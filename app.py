from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import sys
import platform
from datetime import datetime
from PIL import Image, ImageDraw
import io
import os
import requests

# Initialize logging first so it's available for the mock
import logging
logging.basicConfig(level=logging.DEBUG)

# Conditionally import Earth Engine API with a workaround for Windows
if platform.system() == 'Windows':
    # Create a mock ee module for Windows
    class MockGeometry:
        def __init__(self):
            pass
            
        def Polygon(self, coords):
            logging.info(f"Mock Polygon created with {len(coords)} coordinates")
            return self
            
    class MockDate:
        def __init__(self, date_str):
            self.date_str = date_str
            
    class MockImageCollection:
        def __init__(self, collection_id):
            self.collection_id = collection_id
            
        def filterBounds(self, geometry):
            logging.info(f"Filtering bounds for {self.collection_id}")
            return self
            
        def filterDate(self, start_date, end_date):
            logging.info(f"Filtering date from {start_date.date_str} to {end_date.date_str}")
            return self
            
        def sort(self, property_name):
            return self
            
        def first(self):
            return MockImage()
            
    class MockImage:
        def __init__(self):
            pass
            
        def getMapId(self, vis_params=None):
            return {
                "tile_fetcher": {
                    "url_format": "https://example.com/mock-tile/{z}/{x}/{y}"
                }
            }
    
    class MockEE:
        def __init__(self):
            self.initialized = False
            self.Geometry = MockGeometry()
            
        def Initialize(self, project=None):
            self.initialized = True
            logging.info(f"Mock EE initialized for Windows with project: {project}")
            
        def Image(self, *args, **kwargs):
            return MockImage()
            
        def ImageCollection(self, collection_id):
            return MockImageCollection(collection_id)
            
        def Date(self, date_str):
            return MockDate(date_str)
    
    ee = MockEE()
else:
    import ee

import torch
import torchvision.transforms as transforms
from shapely.geometry import Polygon
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from ultralytics import YOLO
import base64
import numpy as np

# Initialize logging
logging.basicConfig(level=logging.DEBUG)

# Initialize FastAPI app
app = FastAPI()

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request schema
class DetectionRequest(BaseModel):
    polygon: List[Dict[str, float]]
    screenshot: str = None

# API routes
@app.get("/api")
def root():
    return {"message": "Eucalyptus Detection API is running!"}

@app.post("/api/detect")
async def detect(request: DetectionRequest):
    try:
        logging.info("Received detection request")
        
        detected_areas = []
        polygon = None
        confidence_scores = []
        
        if request.screenshot:
            try:
                logging.info("Processing screenshot")
                image_data = request.screenshot.split(',')[1]
                logging.info(f"Base64 image data length: {len(image_data)}")
                image_bytes = base64.b64decode(image_data)
                logging.info(f"Decoded image bytes length: {len(image_bytes)}")
                
                # Save the received image for debugging
                debug_image_path = os.path.join("static", "images", "debug_input.png")
                os.makedirs(os.path.dirname(debug_image_path), exist_ok=True)
                with open(debug_image_path, "wb") as f:
                    f.write(image_bytes)
                logging.info(f"Saved debug image to {debug_image_path}")
                
                image = Image.open(io.BytesIO(image_bytes))
                logging.info(f"Original image size: {image.size}, mode: {image.mode}")
                
                image = image.convert("RGB")
                image = image.resize((512, 512))
                
                # Save the processed image for debugging
                debug_processed_path = os.path.join("static", "images", "debug_processed.png")
                image.save(debug_processed_path)
                logging.info(f"Saved processed image to {debug_processed_path}")
                
                logging.info(f"Image shape after resize: {image.size}")
                image_tensor = transform(image).unsqueeze(0).to(device)
                logging.info(f"Tensor shape: {image_tensor.shape}")
                
                logging.info("Running model inference")
                with torch.no_grad():
                    try:
                        results = model(image_tensor)
                        logging.info(f"Model inference completed successfully")
                    except Exception as e:
                        logging.error(f"Error during model inference: {str(e)}")
                        raise
                    
                logging.info(f"Model results type: {type(results)}")
                logging.info(f"Model results: {results}")
                
                polygon = Polygon([(p["lng"], p["lat"]) for p in request.polygon])
                
                logging.info(f"Processing results for boxes")
                for i, result in enumerate(results):
                    logging.info(f"Processing result {i}")
                    if hasattr(result, 'boxes') and result.boxes is not None:
                        logging.info(f"Result has boxes attribute: {result.boxes}")
                        if len(result.boxes) > 0:
                            boxes = result.boxes.xyxy.tolist()
                            confidences = result.boxes.conf.tolist()
                            logging.info(f"Detected boxes: {boxes}")
                            logging.info(f"Confidence scores: {confidences}")
                            
                            for box, conf in zip(boxes, confidences):
                                x_min, y_min, x_max, y_max = box
                                # Calculate center of the box for more accurate marker placement
                                center_x = (x_min + x_max) / 2
                                center_y = (y_min + y_max) / 2
                                
                                # Convert pixel coordinates to geo coordinates
                                # Use the center of the box for more accurate placement
                                lat = polygon.bounds[1] + (center_y / 512) * (polygon.bounds[3] - polygon.bounds[1])
                                lng = polygon.bounds[0] + (center_x / 512) * (polygon.bounds[2] - polygon.bounds[0])
                                
                                # Store the exact geo coordinates for the marker
                                detected_areas.append({
                                    "lat": float(lat), 
                                    "lng": float(lng),
                                    "confidence": float(conf),
                                    "x_min": (x_min / 512) * 100,  # Convert to percentage for display
                                    "y_min": (y_min / 512) * 100,
                                    "x_max": (x_max / 512) * 100,
                                    "y_max": (y_max / 512) * 100,
                                    "center_x": (center_x / 512) * 100,  # Center coordinates as percentage
                                    "center_y": (center_y / 512) * 100,
                                    "center_lat": float(lat),  # Exact center latitude
                                    "center_lng": float(lng)   # Exact center longitude
                                })
                                confidence_scores.append(float(conf))
                        else:
                            logging.info("Result has boxes but no detections")
                    else:
                        logging.info("Result has no boxes attribute or boxes is None")

            except Exception as e:
                logging.error(f"Error processing screenshot: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Error processing screenshot: {str(e)}")

        if polygon is None:
            polygon = Polygon([(p["lng"], p["lat"]) for p in request.polygon])

        response_data = {
            "detected_areas": detected_areas,
            "bounds": {
                "north": polygon.bounds[3],
                "south": polygon.bounds[1],
                "east": polygon.bounds[2],
                "west": polygon.bounds[0]
            },
            "average_confidence": float(sum(confidence_scores) / len(confidence_scores)) if confidence_scores else 0
        }
        
        logging.info(f"Returning response: {response_data}")
        return response_data

    except Exception as e:
        logging.error(f"Error in detect endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect")
async def detect_redirect(request: DetectionRequest):
    """
    Redirect endpoint for backward compatibility
    """
    logging.info("Received request at /detect, redirecting to /api/detect")
    return await detect(request)

# Mount static files AFTER defining API routes
app.mount("/", StaticFiles(directory="static", html=True), name="static")

# Mount images directory separately to ensure it's accessible
app.mount("/images", StaticFiles(directory="static/images"), name="images")

# Initialize Google Earth Engine with proper error handling
try:
    # Simple initialization without service account
    # ee.Authenticate() # Assuming CLI auth is used, keeping this commented
    ee.Initialize(project='ee-farziabhi42cy6')
    logging.info("Google Earth Engine Initialized Successfully")
except ee.EEException as e: # Use specific EEException
    logging.error(f"Failed to initialize Google Earth Engine: {e}")
    raise HTTPException(status_code=500, detail="GEE Initialization failed")

# Load PyTorch model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best (1).pt")
logging.info(f"Loading model from: {MODEL_PATH}")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logging.info(f"Using device: {device}")

try:
    if os.path.exists(MODEL_PATH):
        model = YOLO(MODEL_PATH).to(device)
        logging.info(f"Model loaded successfully from {MODEL_PATH}: {type(model)}")
    else:
        error_msg = f"Model file not found: {MODEL_PATH}"
        logging.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
except Exception as e:
    error_msg = f"Failed to load model: {str(e)}"
    logging.error(error_msg)
    raise HTTPException(status_code=500, detail=error_msg)

# Define preprocessing transform
transform = transforms.Compose([
    transforms.Resize((512, 512)),
    transforms.ToTensor(),
])

# Function to fetch masked eucalyptus regions
def detect_eucalyptus(polygon_coords):
    try:
        polygon = Polygon([(p["lng"], p["lat"]) for p in polygon_coords])
        ee_polygon = ee.Geometry.Polygon(list(polygon.exterior.coords))
        
        # Fetch Satellite Image from GEE with more parameters
        image = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")\
            .filterBounds(ee_polygon)\
            .filterDate(ee.Date('2023-01-01'), ee.Date('2024-12-31'))\
            .sort('CLOUDY_PIXEL_PERCENTAGE')\
            .first()\
            .clip(ee_polygon)

        url = image.getThumbURL({
            'dimensions': '512x512',
            'format': 'png',
            'min': 0,
            'max': 3000,
            'bands': ['B4', 'B3', 'B2'],
            'gamma': 1.4,
            'region': ee_polygon
        })
        
        logging.info(f"Generated satellite image URL: {url}")
        
        # Create a unique filename for this detection
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        filename = f"satellite_{timestamp}.png"
        filepath = os.path.join("static", "images", filename)
        
        # Make sure the directory exists
        os.makedirs(os.path.join("static", "images"), exist_ok=True)
        
        try:
            # Download the image
            response = requests.get(url, timeout=30)

            if not response.ok:
                logging.error(f"Failed to fetch image. Status: {response.status_code}")
                logging.error(f"Response content: {response.content}")
                # Use a default image instead of failing
                default_image_path = os.path.join("static", "images", "default_satellite.png")
                if not os.path.exists(default_image_path):
                    # Create a simple default image if it doesn't exist
                    img = Image.new('RGB', (512, 512), color=(240, 240, 240))
                    draw = ImageDraw.Draw(img)
                    draw.text((256, 256), "No satellite image available", fill=(100, 100, 100))
                    img.save(default_image_path)
                
                # Use the local URL for the default image
                local_url = f"/images/default_satellite.png"
                
                # Use a placeholder for model inference
                image = Image.new('RGB', (512, 512), color=(240, 240, 240))
            else:
                # Save the downloaded image
                image_data = response.content
                with open(filepath, 'wb') as f:
                    f.write(image_data)
                
                # Use the local URL
                local_url = f"/images/{filename}"
                
                # Open the image for model inference
                image = Image.open(io.BytesIO(image_data)).convert("RGB")
        except Exception as e:
            logging.error(f"Error downloading satellite image: {str(e)}")
            # Use a default image
            local_url = "/images/default_satellite.png"
            image = Image.new('RGB', (512, 512), color=(240, 240, 240))
        
        # Prepare image for model
        image_tensor = transform(image).unsqueeze(0).to(device)

        # Run model inference
        with torch.no_grad():
            results = model(image_tensor)

        detected_areas = []
        confidence_values = []
        
        for result in results:
            if result.boxes is None or len(result.boxes) == 0:
                logging.warning("No eucalyptus detected in the given area.")
                continue
            
            boxes = result.boxes.xyxy.tolist()
            confidences = result.boxes.conf.tolist() if hasattr(result.boxes, 'conf') else [0.75] * len(boxes)
            
            logging.info(f"Detected Boxes: {boxes}")
            logging.info(f"Confidence values: {confidences}")

            for box, conf in zip(boxes, confidences):
                x_min, y_min, x_max, y_max = box
                # Calculate center of the box for more accurate marker placement
                center_x = (x_min + x_max) / 2
                center_y = (y_min + y_max) / 2
                
                # Convert pixel coordinates to geo coordinates
                # Use the center of the box for more accurate placement
                lat = polygon.bounds[1] + (center_y / 512) * (polygon.bounds[3] - polygon.bounds[1])
                lng = polygon.bounds[0] + (center_x / 512) * (polygon.bounds[2] - polygon.bounds[0])
                
                # Store the exact geo coordinates for the marker
                detected_areas.append({
                    "lat": float(lat), 
                    "lng": float(lng),
                    "confidence": float(conf),
                    "x_min": (x_min / 512) * 100,  # Convert to percentage for display
                    "y_min": (y_min / 512) * 100,
                    "x_max": (x_max / 512) * 100,
                    "y_max": (y_max / 512) * 100,
                    "center_x": (center_x / 512) * 100,  # Center coordinates as percentage
                    "center_y": (center_y / 512) * 100,
                    "center_lat": float(lat),  # Exact center latitude
                    "center_lng": float(lng)   # Exact center longitude
                })
                confidence_values.append(float(conf))

        # Always return satellite URL and bounds, regardless of detections
        response_data = {
            "satellite_url": local_url,
            "detected_areas": detected_areas,
            "bounds": {
                "north": polygon.bounds[3],
                "south": polygon.bounds[1],
                "east": polygon.bounds[2],
                "west": polygon.bounds[0]
            },
            "average_confidence": float(sum(confidence_values) / len(confidence_values)) if confidence_values else 0
        }
        
        logging.info(f"Returning response data: {response_data}")
        return response_data

    except Exception as e:
        logging.error(f"Error in detect_eucalyptus: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)
