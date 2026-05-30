/**
 * Download YOLOv8-nano ONNX model during build if not present.
 * This runs as part of the build process so Vercel gets the model
 * without storing it in git.
 *
 * The model is downloaded from the Ultralytics GitHub releases.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const MODEL_URL =
  "https://github.com/ultralytics/assets/releases/download/v8.4.0/yolov8n.onnx";
const MODEL_PATH = path.join(__dirname, "..", "public", "models", "ball-detector.onnx");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      }).on("error", reject);
    };
    follow(url);
  });
}

async function main() {
  if (fs.existsSync(MODEL_PATH)) {
    const stat = fs.statSync(MODEL_PATH);
    if (stat.size > 1000000) {
      console.log("Model already exists, skipping download.");
      return;
    }
  }

  fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
  console.log("Downloading YOLOv8-nano ONNX model...");
  await download(MODEL_URL, MODEL_PATH);
  const stat = fs.statSync(MODEL_PATH);
  console.log(`Model downloaded: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
}

main().catch((err) => {
  console.error("Failed to download model:", err.message);
  // Don't fail the build — the app will work without the model
  // but detection won't function
});
