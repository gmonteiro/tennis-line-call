"""
Convert YOLOv8-nano to ONNX format for browser inference.

Usage:
    pip install ultralytics
    python scripts/convert-model.py

This will create public/models/ball-detector.onnx
"""

from ultralytics import YOLO

# Load YOLOv8-nano (pre-trained on COCO, includes "sports ball" class)
model = YOLO("yolov8n.pt")

# Export to ONNX
model.export(
    format="onnx",
    imgsz=640,
    simplify=True,
    opset=13,  # Well-supported by ONNX Runtime Web
)

# The exported file will be at yolov8n.onnx
# Move it to public/models/ball-detector.onnx
import shutil
shutil.move("yolov8n.onnx", "public/models/ball-detector.onnx")

print("Model exported to public/models/ball-detector.onnx")
print("For better performance, consider quantizing to INT8:")
print("  python -m onnxruntime.quantization.quantize \\")
print("    --model public/models/ball-detector.onnx \\")
print("    --output public/models/ball-detector.onnx \\")
print("    --quant_type QInt8")
