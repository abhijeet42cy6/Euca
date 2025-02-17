let map, autocomplete;
let drawnPolygon = null;
let drawingManager;

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.212968, lng: 72.981295 }, // Adjust this based on your location
        zoom: 13,
    });

    const input = document.getElementById("searchBox");
    autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.addListener("place_changed", onPlaceChanged);

    // Initialize the Drawing Manager inside initMap
    drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: true,  // Enable drawing control UI
        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER, // Position of the drawing UI
            drawingModes: [google.maps.drawing.OverlayType.POLYGON], // Only allow polygon drawing
        },
        polygonOptions: {
            fillColor: '#FF0000',
            fillOpacity: 0.2,
            strokeWeight: 2,
            clickable: true, // Allow clicking on polygons
            editable: true,  // Enable polygon editing
            zIndex: 1,
        },
    });

    drawingManager.setMap(map);

    // Event listener for when a polygon is drawn
    google.maps.event.addListener(drawingManager, "overlaycomplete", function (event) {
        if (event.type === google.maps.drawing.OverlayType.POLYGON) {
            if (drawnPolygon) {
                drawnPolygon.setMap(null); // Remove previous polygon
            }
            drawnPolygon = event.overlay;
            drawnPolygon.setEditable(true);
            console.log(drawnPolygon.getPath().getArray());
        }
    });
}

function onPlaceChanged() {
    const place = autocomplete.getPlace();
    if (!place.geometry) {
        return;
    }

    map.panTo(place.geometry.location);
    map.setZoom(15);  // Zoom in on the searched location
}

// Ensure initMap is globally accessible
window.onload = initMap;
window.initMap = initMap;

function getPolygonCoordinates() {
    if (!drawnPolygon) {
        alert("Please draw a polygon first.");
        return null;
    }
    const path = drawnPolygon.getPath();
    const coordinates = [];
    for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push({ lat: point.lat(), lng: point.lng() });
    }
    return coordinates;
}

window.sendPolygonData = sendPolygonData;

function sendPolygonData() {
    console.log("Detect button clicked!");  // Debugging
    const polygonCoords = getPolygonCoordinates();
    if (!polygonCoords) return;

    console.log("Sending request to FastAPI:", JSON.stringify({ polygon: polygonCoords }));

    fetch("http://127.0.0.1:8000/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polygon: polygonCoords }),
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response:", data);
        if (data.detected_areas) {
            drawDetectedAreas(data.detected_areas);  // Pass the detected areas
        }
    })
    .catch(error => {
        console.error("Error:", error);
        alert("Error detecting eucalyptus.");
    });
}

function drawDetectedAreas(detectedAreas) {
    if (!detectedAreas || !Array.isArray(detectedAreas) || detectedAreas.length === 0) {
        console.error("No detected areas received.");
        return;
    }

    detectedAreas.forEach(area => {
        if (typeof area.lat !== "number" || typeof area.lng !== "number") {
            console.error("Skipping invalid coordinate:", area);
            return; // Skip invalid coordinates
        }

        // Display detected eucalyptus locations using markers instead of polygons
        new google.maps.Marker({
            position: { lat: area.lat, lng: area.lng },
            map: map,
            title: "Detected Eucalyptus",
        });
    });

    // ✅ FIX: Use detectedAreas instead of undefined 'coordinates'
    displayCoordinates(detectedAreas);
}

function displayCoordinates(coordinates) {
    const coordinatesListDiv = document.getElementById("coordinatesList");
    coordinatesListDiv.innerHTML = "";

    coordinates.forEach(coord => {  
        const listItem = document.createElement("li");
        listItem.textContent = `Lat: ${coord.lat}, Lng: ${coord.lng}`;
        coordinatesListDiv.appendChild(listItem);
    });
}


// Function to clear the drawn polygon
function clearPolygon() {
    if (drawnPolygon) {
        drawnPolygon.setMap(null);
        drawnPolygon = null;
    }
}

document.getElementById("detectButton").addEventListener("click", sendPolygonData);
document.getElementById("clearButton").addEventListener("click", clearPolygon);
