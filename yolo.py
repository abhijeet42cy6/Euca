import torch
from ultralytics import YOLO
from PIL import Image
import torchvision.transforms as transforms

MODEL_PATH = "best (1).pt"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = YOLO(MODEL_PATH)

transform = transforms.Compose([
    transforms.Resize((512, 512)),
    transforms.ToTensor(),
])

image = Image.open("test.jpg").convert("RGB")  # Use an actual image
image = transform(image).unsqueeze(0).to(device)

with torch.no_grad():
    results = model(image)

print("Model Output:", results)
