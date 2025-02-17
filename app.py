from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import ee
import json
from shapely.geometry import Polygon, mapping
import requests
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.staticfiles import StaticFiles

# Initialize logging
logging.basicConfig(level=logging.INFO)

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

# Initialize Google Earth Engine
try:
    ee.Initialize(project='ee-shubham288885')
    logging.info("Google Earth Engine Initialized")
except Exception as e:
    logging.error(f"Failed to initialize Google Earth Engine: {str(e)}")
    raise HTTPException(status_code=500, detail="GEE Initialization failed")

# Root route to prevent 404 errors
@app.get("/")
def root():
    return {"message": "Eucalyptus Detection API is running!"}

# Request schema
class PolygonRequest(BaseModel):
    polygon: List[Dict[str, float]]

# Roboflow API Configuration
ROBOFLOW_API_KEY = "p9E7TiFBhu1sAglE59gb"
MODEL_ID = "eucalyptus-xkbon"
VERSION = "3"

# Function to fetch masked eucalyptus regions
def detect_eucalyptus(polygon_coords):
    try:
        polygon = Polygon([(p["lng"], p["lat"]) for p in polygon_coords])
        ee_polygon = ee.Geometry.Polygon(list(polygon.exterior.coords))
        
        image = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")\
            .filterBounds(ee_polygon)\
            .sort('system:time_start', False)\
            .first()\
            .clip(ee_polygon)

        url = image.getThumbURL({
            'dimensions': '512x512',
            'format': 'png',
            'min': 0,
            'max': 3000,
            'bands': ['B4', 'B3', 'B2']
        })
        
        response = requests.get(url)
        if response.status_code != 200:
            logging.error("Failed to fetch satellite image from GEE")
            raise HTTPException(status_code=500, detail="Failed to fetch satellite image")
        
        roboflow_url = f"https://detect.roboflow.com/{MODEL_ID}/{VERSION}?api_key={ROBOFLOW_API_KEY}"
        roboflow_response = requests.post(roboflow_url, files={"file": response.content})
        
        if roboflow_response.status_code != 200:
            logging.error("Roboflow inference API failed")
            raise HTTPException(status_code=500, detail="Roboflow inference failed")
        
        detections = roboflow_response.json().get("predictions", [])
        detected_areas = []

        for detection in detections:
            x, y, width, height = detection["x"], detection["y"], detection["width"], detection["height"]
            lat = polygon.bounds[1] + ((y / 512) * (polygon.bounds[3] - polygon.bounds[1]))
            lng = polygon.bounds[0] + ((x / 512) * (polygon.bounds[2] - polygon.bounds[0]))
            detected_areas.append({"lat": lat, "lng": lng})

        return detected_areas
    except Exception as e:
        logging.error(f"Error in detect_eucalyptus: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect")
def detect(polygon_request: PolygonRequest):
    detected_areas = detect_eucalyptus(polygon_request.polygon)
    return {"detected_areas": detected_areas}

# Serve static files (like index.html, main.js, etc.)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
