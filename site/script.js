// ---------- Settings you can change ----------
const SCHOOLS_FILE = '../data/schools_json_final.geojson';
const RECREATION_FILE = '../data/recreation_filtered.geojson';
const HOW_MANY = 3; // how many nearest recreation sites to show in the popup

// ---------- 1. Map and base layer ----------
const map = L.map('map').setView([45.51, -73.58], 12); // [lat, lon]

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// A layer group is a container we can empty and refill. We use it for the
// recreation sites highlighted after a click, and the lines that link them.
const highlightLayer = L.layerGroup().addTo(map);

// ---------- 2. Helper: fetch a file and turn it into a JavaScript object ----------
function loadJson(path) {
  return fetch(path).then(function (response) {
    if (!response.ok) { throw new Error('HTTP ' + response.status + ' loading ' + path); }
    return response.json();
  });
}

// ---------- 3. Helper: find the closest recreation sites to a point ----------
function findNearest(schoolLatLng, recreationList, n) {
  return recreationList
    .map(function (site) {
      return { props: site.props, latlng: site.latlng, dist: map.distance(schoolLatLng, site.latlng) }; // metres
    })
    .sort(function (a, b) { return a.dist - b.dist; }) // smallest distance first
    .slice(0, n);
}

// ---------- 4. Load BOTH files, and only continue once both have arrived ----------
Promise.all([loadJson(SCHOOLS_FILE), loadJson(RECREATION_FILE)])
  .then(function (results) {
    const schools = results[0];
    const recreation = results[1];

    // Convert recreation features to a simple list: properties + [lat, lon].
    // GeoJSON stores [lon, lat]; Leaflet wants [lat, lon], so we swap with L.GeoJSON.coordsToLatLng.
    const recreationList = recreation.features.map(function (f) {
      return { props: f.properties, latlng: L.GeoJSON.coordsToLatLng(f.geometry.coordinates) };
    });

    // Draw schools as circles. pointToLayer decides what a Point looks like.
    L.geoJSON(schools, {
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, { radius: 6, color: '#1d4e89', fillOpacity: 0.8 });
      },
      onEachFeature: function (feature, layer) {
        const s = feature.properties;

        // Popup content is built only when the school is clicked.
        layer.bindPopup(function () {
          const nearest = findNearest(layer.getLatLng(), recreationList, HOW_MANY);

          const items = nearest.map(function (r) {
            return '<li>' + r.props.NOM + ' (' + r.props.TYPE + '), ' + Math.round(r.dist) + ' m</li>';
          }).join('');

          return '<strong>' + s.NOM_IMM + '</strong><br>' + s.ORDRE_ENS +
                 '<br><br>Closest recreation:<ol>' + items + '</ol>';
        });

        // On click: clear old highlights, then draw lines + dots for the new nearest sites.
        layer.on('click', function () {
          highlightLayer.clearLayers();
          findNearest(layer.getLatLng(), recreationList, HOW_MANY).forEach(function (r) {
            L.polyline([layer.getLatLng(), r.latlng], { color: '#2a9d4b', weight: 2, dashArray: '4' }).addTo(highlightLayer);
            L.circleMarker(r.latlng, { radius: 5, color: '#2a9d4b', fillOpacity: 1 }).addTo(highlightLayer);
          });
        });
      }
    }).addTo(map);

    // Clear highlights when the popup is closed
    map.on('popupclose', function () { highlightLayer.clearLayers(); });

    document.getElementById('status').textContent =
      schools.features.length + ' schools and ' + recreation.features.length + ' recreation sites loaded';
  })
  .catch(function (err) {
    document.getElementById('status').textContent = 'Could not load the data. Open the console (F12) for details.';
    console.error(err);
  });