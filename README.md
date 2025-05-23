# EucaDetect: Eucalyptus Plantation Detection System

EucaDetect is an AI-powered web application designed to detect eucalyptus plantations from satellite imagery using state-of-the-art computer vision technology. The system combines Google Earth Engine satellite imagery with a custom YOLOv8 object detection model to identify and locate eucalyptus plantations within user-defined areas of interest.

## Table of Contents
- [Overview](#overview)
- [Methodology](#methodology)
- [System Architecture](#system-architecture)
- [Installation and Setup](#installation-and-setup)
- [Usage Guide](#usage-guide)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [Future Enhancements](#future-enhancements)

## Overview

EucaDetect allows users to:
- Select an area of interest on Google Maps by drawing a polygon
- Fetch high-resolution satellite imagery of the selected area
- Run AI-based detection of eucalyptus plantations within the defined area
- Visualize the results with confidence scores, bounding boxes, and markers
- View detailed coordinates of detected plantations
- Download detection results for further analysis

The system is particularly useful for forestry management, environmental monitoring, and land-use planning, providing a fast and accurate way to identify eucalyptus plantations without requiring extensive manual surveys.

## Methodology

### Data Acquisition
- Satellite imagery is acquired from the Copernicus Sentinel-2 satellite via Google Earth Engine
- Images are filtered by date and cloud coverage to ensure the best quality
- Area of interest is defined by user-drawn polygons on the Google Maps interface

### Detection Process
1. **Area Selection**: Users define an area by drawing a polygon on the Google Maps interface
2. **Image Capture**: A screenshot of the drawn area is captured and processed
3. **AI Detection**: The processed image is sent to the backend where our trained YOLOv8 model identifies eucalyptus plantations
4. **Geo-Referencing**: Detection results are converted from pixel coordinates to geographic coordinates
5. **Visualization**: Results are displayed on both the map and in a detailed list view with confidence scores

### AI Model
- Custom YOLOv8 model trained specifically for eucalyptus plantation detection
- Model was trained on a dataset of satellite imagery with annotated eucalyptus plantations
- Detection accuracy is enhanced by confidence threshold filtering (70% by default)
- Object detection includes bounding box coordinates and confidence scores

## System Architecture

### Frontend
- Interactive web interface built with HTML, CSS, and JavaScript
- Google Maps JavaScript API for map visualization and polygon drawing
- Client-side image processing using HTML2Canvas
- Dynamic result visualization with color-coded confidence indicators

### Backend
- FastAPI Python framework for RESTful API endpoints
- PyTorch and Ultralytics YOLOv8 for object detection
- Earth Engine API for satellite imagery acquisition
- Shapely for geometric operations and coordinate transformations

### Data Flow
1. User draws a polygon on the map, defining an area of interest
2. Frontend captures the area and sends coordinates to the backend
3. Backend fetches satellite imagery from Google Earth Engine
4. YOLOv8 model processes the image to detect eucalyptus plantations
5. Results are processed, geo-referenced, and sent back to the frontend
6. Frontend displays the results as markers on the map, bounding boxes on the satellite image, and detailed information in the results panel

## Installation and Setup

### Prerequisites
- Python 3.8+ 
- pip (Python package manager)
- Google Earth Engine account (for satellite imagery access)
- Google Maps API key

### Installation Steps

1. Clone the repository
```bash
git clone https://github.com/yourusername/eucadetect.git
cd eucadetect
```

2. Create and activate a virtual environment
```bash
python -m venv venv
# On Windows
venv\Scripts\activate
# On Linux/Mac
source venv/bin/activate
```

3. Install dependencies
```bash
pip install -r requirements.txt
```

4. Set up Google Earth Engine authentication
```bash
earthengine authenticate
```

5. Start the application
```bash
python app.py
```

6. Access the web interface
```
http://localhost:8000
```

## Usage Guide

### Detecting Eucalyptus Plantations

1. **Navigate to the Area of Interest**:
   - Use the search box to find a specific location
   - Or manually navigate using the map controls

2. **Define the Target Area**:
   - Click the "Draw Polygon" button in the map controls
   - Click on the map to create vertices of your polygon
   - Complete the polygon by clicking on the first vertex

3. **Run Detection**:
   - Click the "Detect Plantations" button
   - Wait for the processing to complete (this may take a few seconds depending on the area size)

4. **View Results**:
   - The satellite view shows the area with bounding boxes around detected plantations
   - The map displays markers at each detection location
   - The detection list shows all plantations with confidence scores and coordinates
   - The confidence chart summarizes detection confidence levels

5. **Interact with Results**:
   - Click on a detection in the list to center the map on that location
   - Copy coordinates using the copy button next to each detection
   - Download results using the "Download Results" button

### Additional Features

- **Clear AOI**: Remove the current area of interest and results
- **Confidence Filtering**: Results are filtered by a 70% confidence threshold by default
- **Coordinate Display**: Exact geographic coordinates are shown with full precision
- **Color-Coded Confidence**: Detections are color-coded based on confidence level (green for high, yellow for medium, red for low)

## Features

- **Interactive Map Interface**: Google Maps integration with drawing tools
- **Satellite Imagery**: High-resolution imagery from Sentinel-2 satellite
- **AI-Powered Detection**: YOLOv8 model for accurate eucalyptus plantation detection
- **Bounding Box Visualization**: Visual representation of detected areas on the satellite image
- **Geographic Coordinate Display**: Precise location data for each detection
- **Confidence Scoring**: Reliability indicator for each detection
- **Result Download**: Export detection results for further analysis
- **Responsive Design**: Works on desktop and mobile devices

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript
- **Maps API**: Google Maps JavaScript API
- **Backend**: Python, FastAPI
- **Machine Learning**: PyTorch, YOLOv8, Ultralytics
- **Satellite Imagery**: Google Earth Engine, Copernicus Sentinel-2
- **Geospatial Processing**: Shapely, Earth Engine API
- **Image Processing**: Pillow, HTML2Canvas

## Future Enhancements

- Multi-class detection for different tree species
- Time-series analysis to track plantation growth over time
- Area calculation for detected plantations
- Integration with other data sources (rainfall, soil type, etc.)
- Batch processing for large-scale detection operations
- Custom confidence threshold adjustment
- User authentication and result saving

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- The YOLOv8 model is based on the Ultralytics implementation
- Satellite imagery is provided by the Copernicus Sentinel-2 mission
- Special thanks to the Google Earth Engine team for providing access to satellite imagery
