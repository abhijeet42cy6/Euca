let map, autocomplete;
let drawnPolygon = null;
let drawingManager;
let satelliteOverlay = null;
let detectionMarkers = [];
let selectedShape;
let polygon = null;
let markers = [];
let infoWindows = [];

function initMap() {
    console.log("Google Maps API Loaded!");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.21, lng: 72.98 },
        zoom: 10,
        mapTypeId: 'hybrid',
        mapTypeControl: true,
        mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_RIGHT
        },
        fullscreenControl: true,
        streetViewControl: false
    });

    // Initialize search box with the correct element ID
    const input = document.getElementById("coordinates-input");
    
    // Add event listener for coordinate input
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCoordinates(input.value);
        }
    });

    // Initialize autocomplete
    autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo('bounds', map);
    autocomplete.addListener('place_changed', onPlaceChanged);

    // Initialize drawing manager
    drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: true,
        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [google.maps.drawing.OverlayType.POLYGON]
        },
        polygonOptions: {
            fillColor: '#38b48a',
            fillOpacity: 0.3,
            strokeWeight: 2,
            strokeColor: '#2a9e74',
            clickable: true,
            editable: true,
            draggable: true,
            zIndex: 1
        }
    });
    drawingManager.setMap(map);

    // Show drawing helper when in drawing mode
    showDrawingHelper(true);
    
    // Listen for drawing mode changes
    google.maps.event.addListener(drawingManager, 'drawingmode_changed', function() {
        const isDrawing = drawingManager.drawingMode === google.maps.drawing.OverlayType.POLYGON;
        showDrawingHelper(isDrawing);
    });

    // Add event listener for polygon completion
    google.maps.event.addListener(drawingManager, 'overlaycomplete', function(event) {
        // Switch drawing mode off after drawing is complete
        drawingManager.setDrawingMode(null);
        showDrawingHelper(false);
        
        // Save polygon reference
        if (event.type === google.maps.drawing.OverlayType.POLYGON) {
            // Clear any existing polygon
            if (drawnPolygon) {
                drawnPolygon.setMap(null);
            }
            
            drawnPolygon = event.overlay;
            polygon = drawnPolygon; // Set the polygon for other functions to use
            drawnPolygon.setEditable(true);
            setSelection(drawnPolygon);
            
            // Log coordinates for debugging
            logPolygonCoordinates(drawnPolygon);
            
            // Add delete listener on right-click
            google.maps.event.addListener(drawnPolygon, 'rightclick', function() {
                deleteSelectedShape();
            });
            
            // Show a toast to inform the user they can edit the polygon
            showToast('Area of interest defined. You can edit the polygon by dragging its points.');
        }
    });

    // Event listeners for buttons
    document.getElementById('detect-btn').addEventListener('click', detectEucalyptus);
    document.getElementById('clear-aoi-btn').addEventListener('click', clearAll);
    document.getElementById('download-results-btn').addEventListener('click', downloadResults);
    
    // Add a button to re-enable drawing mode
    const drawPolygonButton = document.createElement('button');
    drawPolygonButton.innerHTML = '<span class="material-icons">create</span> Draw Polygon';
    drawPolygonButton.className = 'custom-map-control';
    drawPolygonButton.addEventListener('click', function() {
        drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    });
    
    // Add custom control to the map
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(drawPolygonButton);
}

// Handle coordinate input
function handleCoordinates(value) {
    try {
        // Try to parse coordinates like "21.205156, 72.994973"
        const parts = value.split(',');
        if (parts.length === 2) {
            const lat = parseFloat(parts[0].trim());
            const lng = parseFloat(parts[1].trim());
            
            if (!isNaN(lat) && !isNaN(lng)) {
                map.setCenter({ lat, lng });
                map.setZoom(15);
                
                // Add a marker at the coordinates
                const marker = new google.maps.Marker({
                    position: { lat, lng },
                    map: map,
                    animation: google.maps.Animation.DROP
                });
                
                markers.push(marker);
                return true;
            }
        }
        
        showToast('Invalid coordinates format. Use format: latitude, longitude');
        return false;
    } catch (error) {
        console.error('Error parsing coordinates:', error);
        showToast('Invalid coordinates format');
        return false;
    }
}

// Handle place selection from autocomplete
function onPlaceChanged() {
    const place = autocomplete.getPlace();
    if (!place.geometry) {
        showToast('Please select a place from the dropdown or enter valid coordinates');
        return;
    }
    
    // Center map on selected place
    if (place.geometry.viewport) {
        map.fitBounds(place.geometry.viewport);
    } else {
        map.setCenter(place.geometry.location);
        map.setZoom(15);
    }
}

function getPolygonCoordinates() {
    if (!drawnPolygon) {
        console.warn("No polygon drawn");
        return null;
    }
    const path = drawnPolygon.getPath();
    const coordinates = [];
    for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push({ 
            lat: point.lat(), 
            lng: point.lng() 
        });
    }
    console.log("Extracted coordinates:", coordinates);
    return coordinates;
}

function clearPreviousResults() {
    // Clear previous markers
    detectionMarkers.forEach(marker => marker.setMap(null));
    detectionMarkers = [];
    
    // Clear previous overlay
    if (satelliteOverlay) {
        satelliteOverlay.setMap(null);
        satelliteOverlay = null;
    }
}

function showResults(data, screenshot) {
    clearPreviousResults();
    
    // Show the results container
    const resultsContainer = document.getElementById('results-section');
    resultsContainer.style.display = 'block';

    // Filter detections based on confidence threshold (70%)
    const confidenceThreshold = 0.70; // 70%
    const validDetections = data.detected_areas.filter(area => area.confidence > confidenceThreshold);

    // Update plantation count (only counting high-confidence detections)
    document.getElementById('tree-count').textContent = 
        validDetections.length > 0 ? 
        `${validDetections.length} eucalyptus plantations found` : 
        `No eucalyptus plantations detected (confidence threshold: 70%)`;

    // Always add the input image WITHOUT markers
    const imageContainer = document.querySelector('.image-container');
    
    // Clear previous content
    imageContainer.innerHTML = '';
    
    // Add the satellite image (always show it)
    const img = document.createElement('img');
    img.src = screenshot;
    img.alt = "Satellite View";
    img.id = "satellite-image";
    img.onerror = function() {
    imageContainer.innerHTML = `
            <div class="image-error">
                <span class="material-icons">error</span>
                <p>Error loading satellite image</p>
            </div>
        `;
    };
    imageContainer.appendChild(img);
    
    // No longer adding markers to the satellite view
    
    // Add detection items to the list
    const detectionsList = document.getElementById('detections-list');
    
    // Clear previous detections
    detectionsList.innerHTML = '';
    
    // If no detections, show a message
    if (!data.detected_areas || data.detected_areas.length === 0) {
        const noDetectionsMessage = document.createElement('div');
        noDetectionsMessage.className = 'no-detections-message';
        noDetectionsMessage.innerHTML = `
            <span class="material-icons">search_off</span>
            <p>No eucalyptus plantations detected in this area</p>
            <p>Try selecting a different area or adjusting your search parameters</p>
        `;
        detectionsList.appendChild(noDetectionsMessage);
        
        // Create empty confidence chart
        createEmptyConfidenceChart();
        return;
    }
    
    // Process confidence data for the chart
    const confidenceLevels = {
        high: 0,
        medium: 0,
        low: 0
    };
    
    // Add each detection to the list
    data.detected_areas.forEach((area, index) => {
        // Determine confidence level
        let confidenceLevel;
        if (area.confidence >= 0.8) {
            confidenceLevel = 'high';
            confidenceLevels.high++;
        } else if (area.confidence >= 0.6) {
            confidenceLevel = 'medium';
            confidenceLevels.medium++;
        } else {
            confidenceLevel = 'low';
            confidenceLevels.low++;
        }
        
        // Create detection item
        const detectionItem = document.createElement('div');
        detectionItem.className = 'detection-item';
        detectionItem.setAttribute('data-confidence', confidenceLevel);
        
        // Get coordinates with full precision
        const lat = area.center_lat ? area.center_lat : area.lat;
        const lng = area.center_lng ? area.center_lng : area.lng;
        
        detectionItem.innerHTML = `
            <span class="detection-number">${index + 1}</span>
            <div class="detection-info">
                <span class="detection-confidence ${confidenceLevel}">
                    ${Math.round(area.confidence * 100)}% confidence
                </span>
                <div class="detection-coordinates">
                    <span class="coordinates-label">Coordinates:</span>
                    <span class="coordinates-value">${lat}, ${lng}</span>
                    <button class="copy-coordinates-btn" title="Copy coordinates">
                        <span class="material-icons">content_copy</span>
                    </button>
                </div>
        </div>
        `;
        
        // Add click event for the copy button
        detectionItem.querySelector('.copy-coordinates-btn').addEventListener('click', function() {
            const coordText = `${lat}, ${lng}`;
            navigator.clipboard.writeText(coordText).then(function() {
                showToast('Coordinates copied to clipboard');
            }, function() {
                showToast('Failed to copy coordinates');
            });
        });
        
        // Add to list
        detectionsList.appendChild(detectionItem);
        
        // Add marker to the map
        addDetectionMarker(area, index + 1, confidenceLevel);
    });
    
    // Create confidence chart
    createConfidenceChart(confidenceLevels);
}

// Show/hide loading indicator (used by detectEucalyptus function)
function showLoading() {
    const button = document.getElementById("detect-btn");
    button.disabled = true;
    button.classList.add("loading");
    button.innerHTML = '<span class="button-icon">⏳</span>Detecting';
}

function hideLoading() {
    const button = document.getElementById("detect-btn");
    button.disabled = false;
    button.classList.remove("loading");
    button.innerHTML = '<span class="button-icon">🔍</span>Detect Eucalyptus';
}

// Show toast message
function showToast(message) {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
        
        // Add the CSS for the toast
        const style = document.createElement('style');
        style.textContent = `
            #toast {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: #333;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.3s;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }
            #toast.show {
                opacity: 1;
            }
            .rotating {
                animation: rotate 1.5s linear infinite;
            }
            @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .chart-bar-container {
                margin-bottom: 12px;
            }
            .chart-label {
                font-weight: 600;
                margin-bottom: 4px;
            }
            .chart-bar-wrapper {
                background-color: #f0f0f0;
                height: 12px;
                border-radius: 6px;
                overflow: hidden;
            }
            .chart-bar {
                height: 100%;
                border-radius: 6px;
            }
            .chart-value {
                font-size: 0.85rem;
                margin-top: 4px;
                text-align: right;
            }
            .detection-item.active {
                background-color: rgba(56, 180, 138, 0.1);
                transform: translateY(-2px);
                box-shadow: var(--shadow);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Set message and show toast
    toast.textContent = message;
    toast.className = 'show';
    
    // Hide toast after 3 seconds
    setTimeout(() => {
        toast.className = '';
    }, 3000);
}

function captureMapScreenshot() {
    // Get the map container element
    const mapDiv = document.getElementById('map');
    
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set canvas size to match the map size
    canvas.width = mapDiv.offsetWidth;
    canvas.height = mapDiv.offsetHeight;
    
    // Get the map view as an image
    html2canvas(mapDiv).then(canvas => {
        // Convert canvas to base64 image
        const imageData = canvas.toDataURL('image/png');
        return imageData;
    });
}

async function capturePolygonArea() {
    if (!drawnPolygon) return null;

    try {
        console.log("Starting polygon capture");
        // Switch to satellite view
        map.setMapTypeId('satellite');
        console.log("Switched to satellite view");
        
        // Get polygon bounds
        const bounds = new google.maps.LatLngBounds();
        drawnPolygon.getPath().forEach(coord => bounds.extend(coord));
        console.log("Polygon bounds:", bounds.toString());
        
        // Create a temporary div for the map
        const container = document.createElement('div');
        container.style.width = '512px';
        container.style.height = '512px';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
        console.log("Created temporary container");

        // Create a new map
        const tempMap = new google.maps.Map(container, {
            center: bounds.getCenter(),
            zoom: map.getZoom(),
            mapTypeId: 'satellite',
            disableDefaultUI: true,
            gestureHandling: 'none'
        });
        console.log("Created temporary map");

        // Fit to bounds
        tempMap.fitBounds(bounds);
        console.log("Fitted map to bounds");

        // Wait for the map to load
        await new Promise(resolve => 
            google.maps.event.addListenerOnce(tempMap, 'idle', resolve)
        );
        console.log("Map idle event triggered");

        // Additional wait to ensure tiles are loaded
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log("Additional wait completed");

        // Capture the map
        console.log("Starting html2canvas capture");
        const canvas = await html2canvas(container, {
            useCORS: true,
            allowTaint: true,
            width: 512,
            height: 512,
            logging: true
        });
        console.log("html2canvas capture completed");

        // Clean up
        document.body.removeChild(container);
        map.setMapTypeId('roadmap');
        console.log("Cleanup completed");

        const dataUrl = canvas.toDataURL('image/png');
        console.log("Generated data URL, length:", dataUrl.length);
        return dataUrl;
    } catch (error) {
        console.error('Error capturing area:', error);
        map.setMapTypeId('roadmap');
        return null;
    }
}

function sendPolygonData() {
    const polygonCoords = getPolygonCoordinates();
    if (!polygonCoords) {
        alert("Please draw a polygon first");
        return;
    }
    
    showLoading();
    console.log("Starting detection process");
    console.log("Polygon coordinates:", polygonCoords);
    
    // Capture the polygon area
    capturePolygonArea().then(imageData => {
        if (!imageData) {
            alert("Failed to capture satellite image");
            hideLoading();
            return;
        }
        
        console.log("Screenshot captured successfully, size:", imageData.length);
        console.log("Sending data to server with polygon coordinates:", polygonCoords);

        fetch("http://localhost:8008/api/detect", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ 
                polygon: polygonCoords,
                screenshot: imageData
            })
        })
        .then(async response => {
            console.log("Response status:", response.status);
            if (!response.ok) {
                const errorText = await response.text();
                console.error("Error response:", errorText);
                try {
                    const errorData = JSON.parse(errorText);
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                } catch (e) {
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText.substring(0, 100)}`);
                }
            }
            return response.json();
        })
        .then(data => {
            console.log("Detection Results:", data);
            // Always show results, even if no detections
                showResults(data, imageData);
            
            // No need for an alert if no detections, the UI will show this information
        })
        .catch(error => {
            console.error("Error during detection:", error);
            alert("Error during detection: " + error.message);
        })
        .finally(() => {
            hideLoading();
        });
    }).catch(error => {
        console.error("Error capturing polygon area:", error);
        alert("Error capturing polygon area: " + error.message);
        hideLoading();
    });
}

function clearPolygon() {
    if (drawnPolygon) {
        drawnPolygon.setMap(null);
        drawnPolygon = null;
    }
}

// Wrap the event listeners in DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    const detectButton = document.getElementById("detect-btn");
    const clearButton = document.getElementById("clear-aoi-btn");
    const downloadButton = document.getElementById("download-results-btn");
    
    if (detectButton) {
        detectButton.addEventListener("click", sendPolygonData);
        console.log("Added click event listener to detect button");
    } else {
        console.error("Detect button not found in DOM");
    }
    
    if (clearButton) {
        clearButton.addEventListener("click", clearPolygon);
        console.log("Added click event listener to clear button");
    } else {
        console.error("Clear button not found in DOM");
    }
    
    if (downloadButton) {
        downloadButton.addEventListener("click", downloadResults);
        console.log("Added click event listener to download button");
    }

    const searchBox = document.getElementById('coordinates-input');
    if (searchBox) {
        searchBox.placeholder = "🔍 Search or enter coordinates (e.g., 21.205156, 72.994973)";
    }
});

// Set active polygon
function setSelection(shape) {
    clearSelection();
    selectedShape = shape;
}

// Clear selection
function clearSelection() {
    if (selectedShape) {
        selectedShape = null;
    }
}

// Delete selected shape
function deleteSelectedShape() {
    if (selectedShape) {
        selectedShape.setMap(null);
        polygon = null;
        clearSelection();
    }
}

// Clear all markers, shapes and info windows
function clearAll() {
    // Clear polygon
    deleteSelectedShape();
    
    // Clear markers
    for (let marker of markers) {
        marker.setMap(null);
    }
    markers = [];
    
    // Clear info windows
    for (let infoWindow of infoWindows) {
        infoWindow.close();
    }
    infoWindows = [];
    
    // Hide results section
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('download-results-btn').style.display = 'none';
    
    showToast('Area of interest cleared');
}

// Log polygon coordinates (for debugging)
function logPolygonCoordinates(polygon) {
    const coordinates = polygon.getPath().getArray();
    const coordsArray = coordinates.map(coord => {
        return { lat: coord.lat(), lng: coord.lng() };
    });
    console.log('Polygon coordinates:', coordsArray);
}

// Detect eucalyptus plantations
function detectEucalyptus() {
    if (!polygon) {
        showToast('Please draw an area of interest on the map first');
        return;
    }
    
    // Show loading indicator
    showLoading();
    
    // Get polygon coordinates
    const coordinates = polygon.getPath().getArray();
    const coordsArray = coordinates.map(coord => {
        return { lat: coord.lat(), lng: coord.lng() };
    });
    
    // Log coordinates for debugging
    console.log('Sending polygon coordinates:', coordsArray);
    
    // Try both endpoints - first the new one, then fall back to the old one if needed
    fetch('/api/detect', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ polygon: coordsArray })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 404) {
                // If 404, try the old endpoint
                console.log('API endpoint /api/detect not found, trying /detect');
                return fetch('/detect', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ polygon: coordsArray })
                });
            }
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response;
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Detection results:', data);
        displayResults(data);
    })
    .catch(error => {
        console.error('Error during detection:', error);
        
        // Show a more helpful error message
        let errorMessage = 'Error during detection: ' + error.message;
        
        if (error.message.includes('404')) {
            errorMessage = 'API endpoint not found. Please check server configuration.';
        } else if (error.message.includes('405')) {
            errorMessage = 'Method not allowed. The API endpoint does not support POST requests.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your internet connection and server status.';
        }
        
        showToast(errorMessage);
        
        // Show empty results to indicate the operation completed but failed
        const emptyData = {
            detected_areas: [],
            satellite_url: null
        };
        displayResults(emptyData);
    })
    .finally(() => {
        hideLoading();
    });
}

// Display detection results
function displayResults(data) {
    // Show results section
    const resultsSection = document.getElementById('results-section');
    resultsSection.style.display = 'block';
    
    // Get detections from the response
    const detections = data.detected_areas || [];
    
    // Update tree count
    const treeCount = detections.length;
    document.getElementById('tree-count').textContent = treeCount;
    
    // Set satellite image - use a proper fallback if satellite_url is missing or invalid
    const satelliteImageElement = document.getElementById('satellite-image');
    const imageContainer = satelliteImageElement.parentElement;
    
    // Remove any existing error message or bounding boxes
    imageContainer.querySelectorAll('.image-error, .detection-box').forEach(el => el.remove());
    
    if (data.satellite_url) {
        // Check if it's a relative URL (starts with /) or an absolute URL (starts with http)
        const imageUrl = data.satellite_url.startsWith('/') 
            ? data.satellite_url  // Use as is for relative URLs
            : data.satellite_url; // Use as is for absolute URLs
            
        console.log('Setting satellite image URL:', imageUrl);
        satelliteImageElement.src = imageUrl;
        
        // Add error handler
        satelliteImageElement.onerror = function() {
            console.error('Failed to load satellite image:', imageUrl);
            this.style.display = 'none';
            
            // Create error message
            const errorDiv = document.createElement('div');
            errorDiv.className = 'image-error';
            errorDiv.innerHTML = `
                <span class="material-icons">image_not_supported</span>
                <p>Could not load satellite image</p>
                <p>Please try again later</p>
            `;
            imageContainer.appendChild(errorDiv);
            
            showToast('Could not load satellite image');
        };
        
        // Make sure the image is visible (in case it was hidden by a previous error)
        satelliteImageElement.style.display = 'block';
        
        // Add bounding boxes with both approaches for reliability
        
        // Approach 1: Use onload event
        satelliteImageElement.onload = function() {
            console.log('Satellite image loaded, adding bounding boxes (onload method)');
            addBoundingBoxes(detections, imageContainer);
        };
        
        // Approach 2: Use setTimeout as a fallback
        setTimeout(() => {
            console.log('Adding bounding boxes (timeout method)');
            addBoundingBoxes(detections, imageContainer);
        }, 1000); // Wait 1 second to ensure the image is loaded
    } else {
        // No image URL provided
        satelliteImageElement.style.display = 'none';
        
        // Create error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'image-error';
        errorDiv.innerHTML = `
            <span class="material-icons">image_not_supported</span>
            <p>No satellite image available</p>
        `;
        imageContainer.appendChild(errorDiv);
    }
    
    // Get the detections list element
    const detectionsListElement = document.getElementById('detections-list');
    detectionsListElement.innerHTML = '';
    
    // Track confidence levels for the chart
    const confidenceLevels = {
        high: 0,
        medium: 0,
        low: 0
    };
    
    // Clear existing markers
    if (markers) {
        markers.forEach(marker => marker.setMap(null));
    }
    markers = [];
    
    if (infoWindows) {
        infoWindows.forEach(window => window.close());
    }
    infoWindows = [];
    
    // Check if we have any detections
    if (detections.length === 0) {
        // No detections case
        detectionsListElement.innerHTML = `
            <div class="no-detections-message">
                <span class="material-icons" style="font-size: 48px; color: #7f8c8d; margin-bottom: 16px;">search_off</span>
                <p>No eucalyptus trees were detected in this area.</p>
                <p>Try selecting a different area or adjusting your search region.</p>
            </div>
        `;
        
        // Add a simple confidence chart showing "No detections"
        createEmptyConfidenceChart();
        
        // Show download button anyway to allow downloading the empty result
        document.getElementById('download-results-btn').style.display = 'inline-flex';
        
        return;
    }
    
    // Add markers to the map for each detection (but not to the satellite view)
    detections.forEach((detection, index) => {
        // Add marker to the map only
        const position = { lat: detection.lat, lng: detection.lng };
        const marker = new google.maps.Marker({
            position: position,
            map: map,
            label: (index + 1).toString(),
            animation: google.maps.Animation.DROP
        });
        
        markers.push(marker);
        
        // Default confidence if not provided
        const confidence = detection.confidence || 0.75;
        
        // Create info window
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div class="info-window">
                    <h3>Eucalyptus #${index + 1}</h3>
                    <p>Confidence: ${Math.round(confidence * 100)}%</p>
                    <p>Coordinates: ${position.lat}, ${position.lng}</p>
                </div>
            `
        });
        
        infoWindows.push(infoWindow);
        
        // Add click listener
        marker.addListener('click', () => {
            // Close all other info windows
            infoWindows.forEach(window => window.close());
            infoWindow.open(map, marker);
        });
        
        // Determine confidence level
        let confidenceLevel;
        const confidencePercent = Math.round(confidence * 100);
        if (confidencePercent >= 75) {
            confidenceLevel = 'high';
            confidenceLevels.high++;
        } else if (confidencePercent >= 50) {
            confidenceLevel = 'medium';
            confidenceLevels.medium++;
        } else {
            confidenceLevel = 'low';
            confidenceLevels.low++;
        }
        
        // Create detection item
        const detectionItem = document.createElement('div');
        detectionItem.className = 'detection-item';
        detectionItem.setAttribute('data-confidence', confidenceLevel);
        detectionItem.innerHTML = `
            <div class="detection-number">Eucalyptus #${index + 1}</div>
            <div class="detection-confidence ${confidenceLevel}">${confidencePercent}%</div>
        `;
        
        // Add click event to highlight corresponding marker
        detectionItem.addEventListener('click', () => {
            map.panTo(position);
            map.setZoom(18);
            
            // Close all info windows
            infoWindows.forEach(window => window.close());
            
            // Open this marker's info window
            infoWindow.open(map, marker);
            
            // Highlight the item
            const allItems = document.querySelectorAll('.detection-item');
            allItems.forEach(item => item.classList.remove('active'));
            detectionItem.classList.add('active');
        });
        
        detectionsListElement.appendChild(detectionItem);
    });
    
    // Create confidence chart
    createConfidenceChart(confidenceLevels);
    
    // Show download button
    document.getElementById('download-results-btn').style.display = 'inline-flex';
    
    // Pan map to fit all markers
    if (markers.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        markers.forEach(marker => bounds.extend(marker.getPosition()));
        map.fitBounds(bounds);
    }
}

// Helper function to add bounding boxes to the image container
function addBoundingBoxes(detections, container) {
    // Remove any existing boxes first
    container.querySelectorAll('.detection-box').forEach(el => el.remove());
    
    // Add bounding boxes for detections
    if (detections && detections.length > 0) {
        console.log(`Found ${detections.length} detections to add as boxes`);
        detections.forEach((detection, index) => {
            // Log the detection data to check coordinates
            console.log(`Detection ${index + 1}:`, detection);
            
            // Check if we have the required properties
            if (detection.x_min === undefined || detection.y_min === undefined || 
                detection.x_max === undefined || detection.y_max === undefined) {
                console.error(`Detection ${index + 1} missing coordinate properties:`, detection);
                return; // Skip this detection
            }
            
            // Create bounding box
            const box = document.createElement('div');
            box.className = 'detection-box';
            
            // Set position based on detection coordinates (x_min, y_min, x_max, y_max are in percentage)
            box.style.left = `${detection.x_min}%`;
            box.style.top = `${detection.y_min}%`;
            box.style.width = `${detection.x_max - detection.x_min}%`;
            box.style.height = `${detection.y_max - detection.y_min}%`;
            
            console.log(`Box ${index + 1} position:`, {
                left: box.style.left,
                top: box.style.top,
                width: box.style.width,
                height: box.style.height
            });
            
            // Set color based on confidence
            const confidence = detection.confidence;
            let boxColor;
            if (confidence >= 0.8) {
                boxColor = '#28a745'; // Green for high confidence
            } else if (confidence >= 0.6) {
                boxColor = '#ffc107'; // Yellow for medium confidence
            } else {
                boxColor = '#dc3545'; // Red for low confidence
            }
            box.style.borderColor = boxColor;
            
            // Add label
            const label = document.createElement('div');
            label.className = 'detection-label';
            label.textContent = `#${index + 1} (${Math.round(confidence * 100)}%)`;
            label.style.backgroundColor = boxColor;
            
            box.appendChild(label);
            container.appendChild(box);
            console.log(`Added box ${index + 1} to container`);
        });
    } else {
        console.log('No detections found for bounding boxes');
    }
}

// Create confidence chart
function createConfidenceChart(confidenceLevels) {
    const chartElement = document.getElementById('confidence-chart');
    chartElement.innerHTML = '';
    
    const total = confidenceLevels.high + confidenceLevels.medium + confidenceLevels.low;
    if (total === 0) return;
    
    // Create chart container
    const chartContainer = document.createElement('div');
    chartContainer.className = 'confidence-chart-container';
    
    // Create bars
    const levelColors = {
        high: '#38b48a',
        medium: '#f39c12',
        low: '#e74c3c'
    };
    
    for (const [level, count] of Object.entries(confidenceLevels)) {
        if (count === 0) continue;
        
        const percentage = Math.round((count / total) * 100);
        
        const barContainer = document.createElement('div');
        barContainer.className = 'chart-bar-container';
        
        const label = document.createElement('div');
        label.className = 'chart-label';
        label.textContent = level.charAt(0).toUpperCase() + level.slice(1);
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.width = `${percentage}%`;
        bar.style.backgroundColor = levelColors[level];
        
        const value = document.createElement('div');
        value.className = 'chart-value';
        value.textContent = `${count} (${percentage}%)`;
        
        barWrapper.appendChild(bar);
        barContainer.appendChild(label);
        barContainer.appendChild(barWrapper);
        barContainer.appendChild(value);
        chartContainer.appendChild(barContainer);
    }
    
    chartElement.appendChild(chartContainer);
}

// Create empty confidence chart for no detections case
function createEmptyConfidenceChart() {
    const chartElement = document.getElementById('confidence-chart');
    chartElement.innerHTML = `
        <div class="empty-chart">
            <div style="text-align: center; padding: 20px; color: #7f8c8d;">
                <span class="material-icons" style="font-size: 36px; margin-bottom: 8px;">bar_chart</span>
                <p>No detection data available</p>
            </div>
        </div>
    `;
}

// Download results as JSON
function downloadResults() {
    // Get all detection data
    const detections = [];
    
    // If we have markers, use their positions
    if (markers.length > 0) {
        markers.forEach((marker, index) => {
            const position = marker.getPosition();
            detections.push({
                id: index + 1,
                coordinates: [position.lng(), position.lat()],
                confidence: Math.random() * 0.5 + 0.5 // Dummy data for demo
            });
        });
    }
    
    // Create data object
    const data = {
        timestamp: new Date().toISOString(),
        total_detections: detections.length,
        detections: detections,
        area_of_interest: getPolygonCoordinates()
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(data, null, 2);
    
    // Create download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eucalyptus-detection-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Results downloaded successfully');
}

// Show/hide drawing helper tooltip
function showDrawingHelper(show) {
    const helper = document.getElementById('drawing-helper');
    if (show) {
        helper.classList.add('active');
    } else {
        helper.classList.remove('active');
    }
}

// Add a marker to the map for a detected plantation
function addDetectionMarker(area, index, confidenceLevel) {
    // Get coordinates with full precision - use center coordinates if available
    const lat = area.center_lat ? area.center_lat : area.lat;
    const lng = area.center_lng ? area.center_lng : area.lng;
    
    // Set color based on confidence level
    let markerColor;
    switch(confidenceLevel) {
        case 'high':
            markerColor = '#28a745'; // Green
            break;
        case 'medium':
            markerColor = '#ffc107'; // Yellow
            break;
        case 'low':
            markerColor = '#dc3545'; // Red
            break;
        default:
            markerColor = '#28a745'; // Default to green
    }
    
    // Create marker
    const marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        title: `Eucalyptus Plantation #${index} (${Math.round(area.confidence * 100)}% confidence)`,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: markerColor,
            fillOpacity: 0.8,
            strokeWeight: 2,
            strokeColor: "#fff"
        },
        label: {
            text: `${index}`,
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: "bold"
        }
    });
    
    // Add to markers array for later removal
    detectionMarkers.push(marker);
}
