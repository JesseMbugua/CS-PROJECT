// Initialize Leaflet map
const map = L.map('map').setView([-1.286389, 36.817223], 6); // Centered on Kenya
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let marker;
map.on('click', function(e) {
    if (marker) {
        marker.setLatLng(e.latlng);
    } else {
        marker = L.marker(e.latlng).addTo(map);
    }
    // Reverse geocode using Nominatim
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json`)
      .then(response => response.json())
      .then(data => {
        if (data.display_name) {
          marker.bindPopup(`Selected location:<br>${data.display_name}`).openPopup();
          document.getElementById('address').value = data.display_name;
        } else {
          marker.bindPopup('No address found').openPopup();
          document.getElementById('address').value = '';
        }
      })
      .catch(() => {
        marker.bindPopup('No address found').openPopup();
        document.getElementById('address').value = '';
      });
});

// Place search using Nominatim
document.getElementById('searchBtn').addEventListener('click', function() {
  const query = document.getElementById('search').value.trim();
  if (!query) return;
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    .then(response => response.json())
    .then(results => {
      if (results && results.length > 0) {
        const place = results[0];
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        map.setView([lat, lon], 16);
        if (marker) {
          marker.setLatLng([lat, lon]);
        } else {
          marker = L.marker([lat, lon]).addTo(map);
        }
        marker.bindPopup(`Selected location:<br>${place.display_name}`).openPopup();
        document.getElementById('address').value = place.display_name;
      } else {
        alert('No results found.');
      }
    })
    .catch(() => {
      alert('Search failed. Please try again.');
    });
});

document.getElementById('reportForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const form = e.target;
  const addressValue = document.getElementById('address').value;
  if (!addressValue) {
    alert('Please select a location on the map.');
    return;
  }
  const formData = new FormData(form);

  const response = await fetch('/report', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  alert(result.message);
  if(result.success) {
    form.reset();
    if (marker) map.removeLayer(marker);
    document.getElementById('address').value = "";
  }
});