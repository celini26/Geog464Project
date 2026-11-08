


// ---------- 0. Settings ----------
// "const" = a value that is never reassigned. ../ means "one folder up":
// data/ sits NEXT TO site/, not inside it.
const SCHOOLS_FILE = '../data/schools_json_final.geojson';
const RECREATION_FILE = '../data/recreation_filtered.geojson';
const HOW_MANY = 3; // how many nearest recreation sites are listed for a school


// ---------- 1. Map and background ----------
// L is Leaflet, the map library loaded in index.html.
// L.map('map') builds a map inside <div id="map">.
// preferCanvas draws the dots with the faster "canvas" method (we have ~2,600 sites).
// setView([latitude, longitude], zoom) centres the map on Montréal.
const map = L.map('map', { preferCanvas: true }).setView([45.51, -73.58], 12);

// The background is a grid of small picture "tiles" downloaded from a tile service.
// Any service works if you keep its credit line (attribution).
// CartoDB "Positron" is light grey, so your own dots stand out (cleaner look).
// {z}/{x}/{y} are filled in by Leaflet depending on zoom and position;
// {r} asks for sharper tiles on high-resolution screens.
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// A layer group is a container of map objects that can be emptied in one go.
// We keep three, so each kind of object can be cleared without touching the others.
const schoolLayer = L.layerGroup().addTo(map);  // school circles that are ticked in the filter
const lineLayer = L.layerGroup().addTo(map);    // green dashed lines and dots for the nearest sites of a clicked school
const searchLayer = L.layerGroup().addTo(map);  // the one place the reader found with the search


// ---------- 2. Small helper functions ----------
// Downloads a file and turns its text into a JavaScript object.
// fetch() does not answer instantly, it returns a "promise" that the answer will
// arrive later; .then() says what to do once it has.
function loadJson(path) {
  return fetch(path).then(function (response) {
    // response.ok is false for errors such as 404 (file not found).
    // "throw" jumps straight to the .catch() at the end of section 3.
    if (!response.ok) { throw new Error('HTTP ' + response.status + ' loading ' + path); }
    return response.json(); // convert the file's text into a JavaScript object
  });
}

// Takes a list that may repeat values, returns it sorted and without repeats.
// A Set is a collection that cannot hold the same value twice.
const unique = list => Array.from(new Set(list)).sort();


// ---------- 3. Load both files, then build everything ----------
// Promise.all waits until BOTH downloads are finished. The code inside .then()
// only runs after that, so it can safely use the data.
Promise.all([loadJson(SCHOOLS_FILE), loadJson(RECREATION_FILE)]).then(function (res) {
  const schools = res[0]; // the schools GeoJSON (a FeatureCollection)

  // Recreation sites as a simple list of { props: properties, latlng: position }.
  // GeoJSON stores [longitude, latitude]; Leaflet wants [latitude, longitude].
  // L.GeoJSON.coordsToLatLng swaps them for us.
  const recs = res[1].features.map(function (f) {
    return { props: f.properties, latlng: L.GeoJSON.coordsToLatLng(f.geometry.coordinates) };
  });

  // --- 3a. What the reader has chosen ---
  // These start EMPTY, so nothing is drawn: this is why the map is empty by default.
  // Ticking a checkbox adds its value to the set; unticking removes it.
  const shownOrdre = new Set(); // ticked school types (ORDRE_ENS values)
  const shownTypes = new Set(); // ticked recreation types (TYPE values)
  let maxDist = 1000;           // maximum distance in metres, changed by the slider ("let" = can change)

  // Only the recreation sites whose TYPE is currently ticked.
  const activeRec = () => recs.filter(r => shownTypes.has(r.props.TYPE));

  // --- 3b. The nearest ticked recreation sites to a point ---
  // Steps: add a distance to each ticked site -> keep those within maxDist ->
  // sort smallest distance first -> keep the first HOW_MANY.
  function findNearest(latlng) {
    return activeRec()
      .map(r => ({ props: r.props, latlng: r.latlng, dist: map.distance(latlng, r.latlng) })) // metres
      .filter(r => r.dist <= maxDist)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, HOW_MANY);
  }

  // --- 3c. The text inside a school's popup ---
  // Both error messages (red) appear here, right where the reader is looking.
  function schoolPopup(latlng, s) {
    let body; // will hold the HTML for the list or for an error message
    if (shownTypes.size === 0) {
      // Error 1: no recreation type is ticked, so there is nothing to compare with.
      body = '<p class="err">Tick at least one recreation type in the filter.</p>';
    } else {
      const near = findNearest(latlng);
      body = near.length
        // Normal case: a numbered list with names, types and distances
        ? '<ol>' + near.map(r => '<li>' + r.props.NOM + ' (' + r.props.TYPE + '), ' +
            Math.round(r.dist) + ' m</li>').join('') + '</ol>'
        // Error 2: ticked sites exist but none is within the chosen distance.
        : '<p class="err">No ticked recreation site within ' + maxDist +
          ' m. Increase the distance in the filter.</p>';
    }
    return '<strong>' + s.NOM_IMM + '</strong><br>' + s.ORDRE_ENS +
           '<br><br>Closest recreation:' + body;
  }

  // --- 3d. UPDATE: draw the green dashed lines from a school to its nearest sites ---
  function drawLines(latlng) {
    lineLayer.clearLayers(); // a new answer replaces the old one
    findNearest(latlng).forEach(function (r) {
      L.polyline([latlng, r.latlng], { color: '#2a9d4b', weight: 2, dashArray: '4' }).addTo(lineLayer);
      // A green dot on each of the nearest sites (only these few, only after a click)
      L.circleMarker(r.latlng, { radius: 5, color: '#2a9d4b', fillOpacity: 1 }).addTo(lineLayer);
    });
  }

  // --- 3e. Make one school circle with its popup ---
  // Used by BOTH the filter (redraw) and the search (showSchool), so the two behave the same.
  function schoolMarker(feature) {
    const latlng = L.GeoJSON.coordsToLatLng(feature.geometry.coordinates);
    const m = L.circleMarker(latlng, { radius: 6, color: '#1d4e89', fillOpacity: 0.8 }); // blue circle
    // The popup content is a function, so it is built only when clicked
    // and always uses the CURRENT filter and distance.
    m.bindPopup(() => schoolPopup(latlng, feature.properties));
    // EVENT: click on the school. HANDLER: draw its lines.
    m.on('click', () => drawLines(latlng));
    return m;
  }

  // --- 3f. UPDATE: redraw everything that is ticked ---
  // Called at the start and after every tick or untick.
  function redraw() {
    schoolLayer.clearLayers(); lineLayer.clearLayers(); // empty the map
    let n = 0; // counts the schools drawn

    schools.features.forEach(function (f) {
      // Draw this school only if its school type is ticked.
      if (shownOrdre.has(f.properties.ORDRE_ENS)) {
        schoolLayer.addLayer(schoolMarker(f));
        n++;
      }
    });

    // Status line under the page title.
    // Recreation sites are NOT drawn here: they only appear when a school is clicked.
    document.getElementById('status').textContent = (n === 0)
      ? 'The map is empty: use the filter (☰) to show schools, or the search (🔍).'
      : n + ' of ' + schools.features.length + ' schools shown. Click a school to see its closest recreation.';
  }

  // When a popup closes, remove the green lines so they do not stay behind.
  map.on('popupclose', () => lineLayer.clearLayers());

  // --- 3g. The filter checkboxes ---
  // Builds one checkbox per value found in the data (so names always match the data).
  //   boxId : the <div> in index.html to fill
  //   values: the options, e.g. every school type
  //   set   : the Set from 3a that remembers what is ticked
  function buildChecks(boxId, values, set) {
    const box = document.getElementById(boxId);
    values.forEach(function (v) {
      const label = document.createElement('label'); // create <label>
      const cb = document.createElement('input');    // create <input>
      cb.type = 'checkbox';                          // not ticked: the map starts empty

      // EVENT: the reader ticks or unticks the box.
      // HANDLER: update the set. UPDATE: redraw the map.
      cb.addEventListener('change', function () {
        if (cb.checked) { set.add(v); } else { set.delete(v); }
        redraw();
      });

      label.append(cb, ' ' + v); // box, then its text, inside the label
      box.appendChild(label);    // label goes into the panel
    });
  }
  buildChecks('ordre-checks', unique(schools.features.map(f => f.properties.ORDRE_ENS)), shownOrdre);
  buildChecks('type-checks', unique(recs.map(r => r.props.TYPE)), shownTypes);

  // --- 3h. The distance slider ---
  // EVENT: the reader moves the slider. HANDLER: the function below.
  document.getElementById('dist-range').addEventListener('input', function (e) {
    maxDist = Number(e.target.value); // slider values are text, Number() makes it a number
    document.getElementById('dist-label').textContent = maxDist; // UPDATE: show the value
    map.closePopup(); // UPDATE: the open popup would still show the old distance
  });

  // --- 3i. The search ---
  const input = document.getElementById('search-input');  // the text box
  const msg = document.getElementById('search-msg');      // red message line under it
  const list = document.getElementById('search-results'); // list of matches to click

  // UPDATE for a school found by search: zoom, open its popup, draw its lines.
  function showSchool(f) {
    searchLayer.clearLayers();                 // only one search result at a time
    const m = schoolMarker(f).addTo(searchLayer);
    map.setView(m.getLatLng(), 16);            // zoom in on it
    m.openPopup();
    drawLines(m.getLatLng());
  }

  // UPDATE for a recreation site found by search: zoom and open its popup.
  function showRec(r) {
    searchLayer.clearLayers();
    const m = L.circleMarker(r.latlng, { radius: 7, color: '#2a9d4b', fillOpacity: 1 })
      .bindPopup('<strong>' + r.props.NOM + '</strong><br>' + r.props.TYPE + '<br>' + r.props.ARROND)
      .addTo(searchLayer);
    map.setView(r.latlng, 16);
    m.openPopup();
  }

  // HANDLER: runs when the reader presses Search or Enter.
  function doSearch() {
    const text = input.value.trim();  // what was typed, without extra spaces
    const q = text.toLowerCase();     // lowercase, so capital letters do not matter
    list.innerHTML = '';              // clear the previous list...
    msg.textContent = '';             // ...and the previous message

    // Edge case: nothing typed
    if (!q) { msg.textContent = 'Type a school or recreation site name first.'; return; }

    // Collect every school and recreation site whose name CONTAINS the typed text.
    // "|| ''" protects against a missing name. Each hit has a label and a "go" function.
    const hits = [];
    schools.features.forEach(function (f) {
      if ((f.properties.NOM_IMM || '').toLowerCase().includes(q)) {
        hits.push({ label: f.properties.NOM_IMM + ' (school)', go: () => showSchool(f) });
      }
    });
    recs.forEach(function (r) {
      if ((r.props.NOM || '').toLowerCase().includes(q)) {
        hits.push({ label: r.props.NOM + ' (' + r.props.ARROND + ')', go: () => showRec(r) });
      }
    });

    // Error: a wrong name. The red message appears right under the search bar.
    if (hits.length === 0) {
      msg.textContent = 'No school or recreation site matches "' + text + '". Check the spelling.';
      return;
    }
    // Exactly one match: go straight to it.
    if (hits.length === 1) { hits[0].go(); return; }

    // Several matches: show up to 8 as buttons the reader can click.
    if (hits.length > 8) { msg.textContent = hits.length + ' matches, showing 8. Type more of the name.'; }
    hits.slice(0, 8).forEach(function (h) {
      const b = document.createElement('button');
      b.textContent = h.label;
      // EVENT: click on a match. HANDLER: empty the list, then show that place.
      b.addEventListener('click', function () { list.innerHTML = ''; h.go(); });
      list.appendChild(b);
    });
  }

  // EVENTS that start a search: clicking Search, or pressing Enter in the text box.
  document.getElementById('search-go').addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { doSearch(); } });

  // --- 3j. First drawing: nothing is ticked, so this just writes the "map is empty" message ---
  redraw();

// .catch runs if ANYTHING above failed (a file missing, a typo in a file name...).
// The reader sees a plain sentence; you see the real cause in the console (F12).
}).catch(function (err) {
  document.getElementById('status').textContent =
    'No data was able to be depicted, please refrech the website and check your internet connection.  ';
  console.error(err);
});


// ---------- 4. The three round buttons: open one panel, close the others ----------
// Each pair is [button id, panel id].
const PAIRS = [['btn-info', 'panel-info'], ['btn-search', 'panel-search'], ['btn-filter', 'panel-filter']];

PAIRS.forEach(function (pair) {
  // EVENT: a click on this round button. HANDLER: the function below.
  document.getElementById(pair[0]).addEventListener('click', function () {
    // UPDATE: go through all three panels.
    PAIRS.forEach(function (p) {
      const panel = document.getElementById(p[1]);
      // The panel that belongs to the clicked button flips (open <-> closed);
      // every other panel is forced closed, so only one is open at a time.
      // "hidden" is an HTML attribute: true = not shown. "!" flips true <-> false.
      panel.hidden = (p[1] !== pair[1]) ? true : !panel.hidden;
    });
  });
});