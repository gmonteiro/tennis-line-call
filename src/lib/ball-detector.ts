import * as ort from "onnxruntime-web";
import type { Detection } from "@/types";

const MODEL_PATH = "/models/ball-detector.onnx";
const INPUT_SIZE = 640;
const CONFIDENCE_THRESHOLD = 0.3;

// COCO class index for "sports ball"
const SPORTS_BALL_CLASS = 32;

let session: ort.InferenceSession | null = null;
let isLoading = false;

/**
 * Load the ONNX model. Call once on startup.
 */
export async function loadModel(): Promise<void> {
  if (session || isLoading) return;
  isLoading = true;

  try {
    // Prefer WebGL for GPU acceleration, fallback to WASM
    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["webgl", "wasm"],
    });
  } catch {
    // If WebGL fails, try WASM only
    session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["wasm"],
    });
  } finally {
    isLoading = false;
  }
}

export function isModelLoaded(): boolean {
  return session !== null;
}

/**
 * Preprocess an ImageData frame for YOLOv8 input.
 * Resizes to 640x640, normalizes to [0,1], converts HWC → CHW.
 */
function preprocess(
  imageData: ImageData,
  canvas: HTMLCanvasElement
): Float32Array {
  const ctx = canvas.getContext("2d")!;

  // Resize to INPUT_SIZE x INPUT_SIZE
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  ctx.drawImage(
    // Use createImageBitmap workaround: draw ImageData to temp canvas first
    (() => {
      const tmp = document.createElement("canvas");
      tmp.width = imageData.width;
      tmp.height = imageData.height;
      tmp.getContext("2d")!.putImageData(imageData, 0, 0);
      return tmp;
    })(),
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE
  );

  const resized = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = resized;
  const float32 = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

  // Convert RGBA HWC to RGB CHW, normalize to [0,1]
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    float32[i] = data[i * 4] / 255; // R
    float32[INPUT_SIZE * INPUT_SIZE + i] = data[i * 4 + 1] / 255; // G
    float32[2 * INPUT_SIZE * INPUT_SIZE + i] = data[i * 4 + 2] / 255; // B
  }

  return float32;
}

/**
 * Run detection on a frame. Returns the best ball detection or null.
 */
export async function detect(
  imageData: ImageData,
  preprocessCanvas: HTMLCanvasElement,
  minConfidence: number = CONFIDENCE_THRESHOLD
): Promise<Detection | null> {
  if (!session) return null;

  const inputData = preprocess(imageData, preprocessCanvas);
  const inputTensor = new ort.Tensor("float32", inputData, [
    1,
    3,
    INPUT_SIZE,
    INPUT_SIZE,
  ]);

  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: inputTensor });
  const output = results[session.outputNames[0]];

  return postprocess(
    output.data as Float32Array,
    output.dims as number[],
    imageData.width,
    imageData.height,
    minConfidence
  );
}

/**
 * Parse YOLOv8 output tensor.
 * YOLOv8 output shape: [1, 84, 8400] (for COCO 80 classes)
 * Each of 8400 predictions: [x_center, y_center, width, height, class_scores...]
 */
function postprocess(
  data: Float32Array,
  dims: number[],
  origWidth: number,
  origHeight: number,
  minConfidence: number
): Detection | null {
  const numDetections = dims[2]; // 8400
  const numOutputs = dims[1]; // 84 (4 bbox + 80 classes)

  let bestDetection: Detection | null = null;
  let bestScore = minConfidence;

  for (let i = 0; i < numDetections; i++) {
    // Class scores start at index 4
    const classScore = data[SPORTS_BALL_CLASS * numDetections + i + 4 * numDetections];

    if (classScore > bestScore) {
      // bbox values are in INPUT_SIZE scale
      const cx = data[0 * numDetections + i];
      const cy = data[1 * numDetections + i];
      const w = data[2 * numDetections + i];
      const h = data[3 * numDetections + i];

      // Scale back to original image size
      const scaleX = origWidth / INPUT_SIZE;
      const scaleY = origHeight / INPUT_SIZE;

      bestScore = classScore;
      bestDetection = {
        x: (cx - w / 2) * scaleX,
        y: (cy - h / 2) * scaleY,
        width: w * scaleX,
        height: h * scaleY,
        confidence: classScore,
      };
    }
  }

  return bestDetection;
}
