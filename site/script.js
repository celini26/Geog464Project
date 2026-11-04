
// THE FEATURE (matches the A3 card and tests):
//   EVENT   : the reader clicks the filter icon, ticks/unticks a checkbox, or clicks a school
//   HANDLER : togglePanel(), the checkbox "change" function, showNearest()
//   UPDATE  : the panel opens/closes, circles are redrawn, the popup list and
//             green lines are recalculated using only the ticked recreation types
//
// ORGANISATION
//   Section 0: settings            Section 3: helper that finds nearest sites
//   Section 1: map and tiles       Section 4: load data, build the filter
//   Section 2: helper that loads   Section 5: the filter icon button
//              a file
// =====================================================================


// ---------- 0. Settings ----------
// ../ means "go up one folder": data/ sits next to site/, not inside it.
const SCHOOLS_FILE = '../data/schools_json_final.geojson';
const RECREATION_FILE = '../data/recreation_filtered.geojson';
const HOW_MANY = 3; // how many nearest recreation sites to show


// ---------- 1. Map and base layer ----------
// L is Leaflet. This builds the map inside <div id="map"> and centres it on Montréal.
const map = L.map('map').setView([45.51, -73.58], 12); // [latitude, longitude], zoom

// Background street picture from OpenStreetMap (small square "tiles").
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// A container for the green lines and dots. We can empty it in one go.
const highlightLayer = L.layerGroup().addTo(map);


// ---------- 2. Helper: fetch a file and turn it into a JavaScript object ----------
function loadJson(path) {
  return fetch(path).then(function (response) {
    // response.ok is false for errors like 404 (file not found)
    if (!response.ok) { throw new Error('HTTP ' + response.status + ' loading ' + path); }
    return response.json(); // convert the file text into a JavaScript object
  });
}


// ---------- 3. Helpers ----------
// Find the n closest recreation sites to a point, with distances in metres.
function findNearest(schoolLatLng, recreationList, n) {
  return recreationList
    .map(function (site) {                       // .map: build a new list with a distance added
      return {
        props: site.props,
        latlng: site.latlng,
        dist: map.distance(schoolLatLng, site.latlng) // straight-line distance in metres
      };
    })
    .sort(function (a, b) { return a.dist - b.dist; }) // smallest distance first
    .slice(0, n);                                      // keep only the first n
}

// Turn a list with repeats into a sorted list without repeats.
function unique(list) {
  return Array.from(new Set(list)).sort();
}


// ---------- 4. Load BOTH files, then build everything that needs them ----------
// Promise.all waits until both downloads are finished.
Promise.all([loadJson(SCHOOLS_FILE), loadJson(RECREATION_FILE)])
  .then(function (results) {
    const schools = results[0];
    const recreation = results[1];

    // --- 4a. Recreation sites as a simple list: properties + [lat, lon] ---
    // GeoJSON stores [longitude, latitude]; Leaflet wants [latitude, longitude].
    const recreationList = recreation.features.map(function (f) {
      return { props: f.properties, latlng: L.GeoJSON.coordsToLatLng(f.geometry.coordinates) };
    });

    // --- 4b. What is currently ticked ---
    // A Set holds each value only once. They start with EVERY value = everything ticked.
    const shownOrdre = new Set(schools.features.map(function (f) { return f.properties.ORDRE_ENS; }));
    const shownTypes = new Set(recreationList.map(function (r) { return r.props.TYPE; }));

    // Container for the school circles, so we can clear and redraw them.
    const schoolLayer = L.layerGroup().addTo(map);

    // Only the recreation sites whose TYPE is currently ticked.
    // This is what makes the filter more than "hide/show": "nearest" changes with it.
    function activeRecreation() {
      return recreationList.filter(function (r) { return shownTypes.has(r.props.TYPE); });
    }

    // --- 4c. UPDATE: draw dashed lines and dots to the nearest ticked sites ---
    function showNearest(marker) {
      highlightLayer.clearLayers(); // Test 2: remove the previous school's lines first
      findNearest(marker.getLatLng(), activeRecreation(), HOW_MANY).forEach(function (r) {
        L.polyline([marker.getLatLng(), r.latlng], { color: '#2a9d4b', weight: 2, dashArray: '4' })
          .addTo(highlightLayer);
        L.circleMarker(r.latlng, { radius: 5, color: '#2a9d4b', fillOpacity: 1 })
          .addTo(highlightLayer);
      });
    }

    // --- 4d. Draw (or redraw) only the schools whose type is ticked ---
    function drawSchools() {
      schoolLayer.clearLayers();
      highlightLayer.clearLayers();
      let count = 0; // how many schools get drawn

      const layer = L.geoJSON(schools, {
        // filter: asked for every school. true = draw it, false = skip it.
        filter: function (feature) {
          return shownOrdre.has(feature.properties.ORDRE_ENS);
        },
        // What a point looks like: a blue circle.
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, { radius: 6, color: '#1d4e89', fillOpacity: 0.8 });
        },
        // Runs once for each school that was drawn.
        onEachFeature: function (feature, marker) {
          const s = feature.properties;
          count++;

          // The popup is built only when clicked, so it always uses the CURRENT filter.
          marker.bindPopup(function () {
            const nearest = findNearest(marker.getLatLng(), activeRecreation(), HOW_MANY);
            const items = nearest.map(function (r) {
              return '<li>' + r.props.NOM + ' (' + r.props.TYPE + '), ' + Math.round(r.dist) + ' m</li>';
            }).join('')
              // Test 3 (edge case): if nothing is ticked the list is empty, so say so.
              // "||" means "or use this instead".
              || '<li>No recreation type is ticked in the filter.</li>';

            return '<strong>' + s.NOM_IMM + '</strong><br>' + s.ORDRE_ENS +
                   '<br><br>Closest recreation:<ol>' + items + '</ol>';
          });

          // EVENT: click on this school. HANDLER: showNearest.
          marker.on('click', function () { showNearest(marker); });
        }
      });
      schoolLayer.addLayer(layer);

      // Status line, e.g. "55 of 348 schools shown" (Test 4)
      document.getElementById('status').textContent =
        count + ' of ' + schools.features.length + ' schools shown';
    }

    // When a popup closes, clear the green lines so they do not stay behind.
    map.on('popupclose', function () { highlightLayer.clearLayers(); });

    // --- 4e. Build the checkboxes from the values found in the data ---
    // containerId: the <div> to fill; values: the options; selectedSet: the Set from 4b.
    function buildChecks(containerId, values, selectedSet) {
      const box = document.getElementById(containerId);
      values.forEach(function (v) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true; // everything starts ticked

        // EVENT: the reader ticks or unticks this box.
        // HANDLER: update the Set, then redraw. UPDATE: circles and status change.
        cb.addEventListener('change', function () {
          if (cb.checked) { selectedSet.add(v); } else { selectedSet.delete(v); }
          drawSchools();
        });

        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + v));
        box.appendChild(label);
      });
    }

    buildChecks('ordre-checks',
      unique(schools.features.map(function (f) { return f.properties.ORDRE_ENS; })),
      shownOrdre);
    buildChecks('type-checks',
      unique(recreationList.map(function (r) { return r.props.TYPE; })),
      shownTypes);

    // --- 4f. First drawing ---
    drawSchools();
  })
  // Runs if ANYTHING above failed. The reader sees a sentence; you see the cause in F12.
  .catch(function (err) {
    document.getElementById('status').textContent =
      'Could not load the data. Open the console (F12) for details.';
    console.error(err);
  });


// ---------- 5. The filter icon: open and close the panel ----------
// EVENT: click on the icon. HANDLER: the function below. UPDATE: panel shown or hidden.
document.getElementById('btn-filter').addEventListener('click', function () {
  const panel = document.getElementById('panel-filter');
  panel.hidden = !panel.hidden; // "!" flips true <-> false
});