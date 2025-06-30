// Initialize the Leaflet map centered on Kenya
let marker;
const map = L.map('map').setView([-1.286389, 36.817223], 6); // Centered on Kenya

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Handle map clicks to select a location
map.on('click', function(e) {
  // Place or move the marker to the clicked location
  if (marker) {
    marker.setLatLng(e.latlng);
  } else {
    marker = L.marker(e.latlng).addTo(map);
  }
  // Reverse geocode the coordinates to get a human-readable address
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json`)
    .then(response => response.json())
    .then(data => {
      if (data.display_name) {
        // Show the address in a popup and set it in the hidden input
        marker.bindPopup(`Selected location:<br>${data.display_name}`).openPopup();
        document.getElementById('eventLocation').value = data.display_name;
      } else {
        // If no address found, show a message and clear the input
        marker.bindPopup('No address found').openPopup();
        document.getElementById('eventLocation').value = '';
      }
    })
    .catch(() => {
      // Handle fetch errors
      marker.bindPopup('No address found').openPopup();
      document.getElementById('eventLocation').value = '';
    });
});

// Handle place search using Nominatim when the search button is clicked
document.getElementById('searchBtn').addEventListener('click', function() {
  const query = document.getElementById('search').value.trim();
  if (!query) return;
  // Search for the place using Nominatim API
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    .then(response => response.json())
    .then(results => {
      if (results && results.length > 0) {
        // Use the first result from the search
        const place = results[0];
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        // Center the map and place/move the marker
        map.setView([lat, lon], 16);
        if (marker) {
          marker.setLatLng([lat, lon]);
        } else {
          marker = L.marker([lat, lon]).addTo(map);
        }
        // Show the address in a popup and set it in the hidden input
        marker.bindPopup(`Selected location:<br>${place.display_name}`).openPopup();
        document.getElementById('eventLocation').value = place.display_name;
      } else {
    
        alert('No results found.');
      }
    })
    .catch(() => {
    
      alert('Search failed. Please try again.');
    });
});