// =====================================================================
// script.js (version 3)
// New: walking routes, season filter, age groups, schools without matches
// disappear, search with accents / typos / suggestions.
// Needs: schools_json_final.geojson (with school_id), recreation_filtered.geojson
// (with rec_id, seasons, season_note, age_levels) and walking_routes.geojson.
// =====================================================================

// ---------- 0. Settings ----------
console.log('script.js version 10');   // check in the console (F12) that the new file is loaded
const SCHOOLS_FILE = '../data/schools_json_final.geojson';
const RECREATION_FILE = '../data/recreation_filtered.geojson';
const ROUTES_FILE = '../data/walking_routes.geojson';
const HOW_MANY = 3;                                  // sites listed per school
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
// One colour per school type (ORDRE_ENS). Change a colour code here to change it on the map.
const SCHOOL_COLORS = {
  'Préscolaire': '#f4a300',
  'Primaire': '#1d4e89',
  'Préscolaire - Primaire': '#7b2d8e',
  'Primaire - Secondaire': '#c2185b',
  'Préscolaire - Primaire - Secondaire': '#6d4c41'
};
const schoolColor = type => SCHOOL_COLORS[type] || '#555555';   // grey if a type is not listed

// ---------- 1. Map and background ----------
const map = L.map('map', { preferCanvas: true }).setView([45.51, -73.58], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const schoolLayer = L.layerGroup().addTo(map);   // school circles
const lineLayer = L.layerGroup().addTo(map);     // walking routes of the clicked school
const searchLayer = L.layerGroup().addTo(map);   // the place found with the search

// ---------- 2. Helper functions ----------
function loadJson(path) {
  return fetch(path).then(function (response) {
    if (!response.ok) { throw new Error('HTTP ' + response.status + ' loading ' + path); }
    return response.json();
  });
}
const unique = list => Array.from(new Set(list)).sort();

// Lowercase and remove accents, so "Francois" finds "François"
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Number of single-letter changes needed to turn a into b (typo distance)
function lev(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 1; j <= b.length; j++) { d[0][j] = j; }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// How well a name matches the typed text: 0 = contains it, 1-2 = small typo
function matchScore(q, name) {
  const n = norm(name);
  if (n.includes(q)) { return 0; }
  let best = lev(q, n.slice(0, q.length));
  n.split(/[\s\-\/,()']+/).forEach(w => { best = Math.min(best, lev(q, w.slice(0, q.length))); });
  return best;
}

// ---------- 3. Load the three files, then build everything ----------
Promise.all([loadJson(SCHOOLS_FILE), loadJson(RECREATION_FILE), loadJson(ROUTES_FILE)]).then(function (res) {
  const schools = res[0];

  // Recreation sites: { props, latlng }, also looked up by rec_id
  const recById = {};
  const recs = res[1].features.map(function (f) {
    const r = { props: f.properties, latlng: L.GeoJSON.coordsToLatLng(f.geometry.coordinates) };
    recById[f.properties.rec_id] = r;
    return r;
  });

  // Walking routes grouped by school: routesBySchool[school_id] = [{rec_id, walk_m, latlngs}]
  const routesBySchool = {};
  res[2].features.forEach(function (f) {
    const p = f.properties;
    if (!routesBySchool[p.school_id]) { routesBySchool[p.school_id] = []; }
    routesBySchool[p.school_id].push({
      rec_id: p.rec_id, walk_m: p.walk_m,
      latlngs: L.GeoJSON.coordsToLatLngs(f.geometry.coordinates, 0)
    });
  });

  // --- 3a. What the reader has chosen ---
  const shownOrdre = new Set();     // ticked school types
  const shownTypes = new Set();     // ticked recreation types
  const shownSeasons = new Set();   // ticked seasons (none ticked = any season)
  const slider = document.getElementById('dist-range');
  let maxDist = Number(slider.value);   // starts at the slider's own value
  document.getElementById('dist-label').textContent = maxDist;

  // Age group: a site marked "Primaire" only fits schools that include Primaire, etc.
  function ageOk(school, rec) {
    const levels = rec.props.age_levels || 'all';
    if (levels === 'all') { return true; }
    return levels.split('|').some(l => (school.ORDRE_ENS || '').includes(l));
  }
  function seasonOk(rec) {
    if (shownSeasons.size === 0) { return true; }
    return (rec.props.seasons || '').split('|').some(s => shownSeasons.has(s));
  }

  // --- 3b. The closest matching sites by WALKING distance ---
  function findNearest(feature) {
    const school = feature.properties;
    return (routesBySchool[school.school_id] || [])
      .map(rt => ({ rec: recById[rt.rec_id], walk_m: rt.walk_m, latlngs: rt.latlngs }))
      .filter(r => r.rec && shownTypes.has(r.rec.props.TYPE) && ageOk(school, r.rec) &&
                   seasonOk(r.rec) && r.walk_m <= maxDist)
      .sort((a, b) => a.walk_m - b.walk_m)
      .slice(0, HOW_MANY);
  }

  // --- 3c. Popup text ---
  function schoolPopup(feature) {
    const s = feature.properties;
    let body;
    if (shownTypes.size === 0) {
      body = '<p class="err">Tick at least one recreation type in the filter.</p>';
    } else {
      const near = findNearest(feature);
      body = near.length
        ? '<ol>' + near.map(r => '<li>' + r.rec.props.NOM + ', ' + r.walk_m + ' m</li>').join('') + '</ol>'
        : '<p class="err">No matching site within ' + maxDist + ' m.</p>';
    }
    return '<strong>' + s.NOM_IMM + '</strong>' + body;
  }

  // --- 3d. Draw the green dashed walking routes of a school; returns the sites found ---
  function drawLines(feature) {
    lineLayer.clearLayers();
    const near = findNearest(feature);
    near.forEach(function (r) {
      L.polyline(r.latlngs, { color: '#2a9d4b', weight: 3, dashArray: '4' }).addTo(lineLayer);
      L.circleMarker(r.rec.latlng, { radius: 5, color: '#2a9d4b', fillOpacity: 1 }).addTo(lineLayer);
    });
    return near;
  }

  // --- Popup placement ---
  // Tries 8 spots around the school (above, below, left, right and the 4 corners) and
  // takes the one that covers the fewest route points and stays on the screen.
  //   pts  = points along the routes, in pixels, relative to the school
  //   W, H = size of the popup in pixels
  //   view = where the school is on the screen and how big the map is: {x, y, w, h}
  // The popup then covers x from o[0] - W/2 to o[0] + W/2 and y from o[1] - H to o[1].
  function choosePlacement(pts, W, H, view) {
    const base = 7, gap = 14, margin = 6;            // 7 = Leaflet's normal popup offset
    const options = [
      { name: 'above',       o: [0, base] },                      // the normal spot
      { name: 'below',       o: [0, base + H + gap] },
      { name: 'right',       o: [W / 2 + gap, base + H / 2] },
      { name: 'left',        o: [-(W / 2 + gap), base + H / 2] },
      { name: 'above-right', o: [W / 2 + gap, -gap] },
      { name: 'above-left',  o: [-(W / 2 + gap), -gap] },
      { name: 'below-right', o: [W / 2 + gap, gap + H] },
      { name: 'below-left',  o: [-(W / 2 + gap), gap + H] }
    ];
    let best = 0, bestScore = Infinity, bestCount = 0;
    options.forEach(function (opt, i) {
      const o = opt.o;
      const count = pts.filter(p => Math.hypot(p.x, p.y) > 15 &&   // ignore the start of a route, right at the school
                                    p.x > o[0] - W / 2 - margin && p.x < o[0] + W / 2 + margin &&
                                    p.y > o[1] - H - margin && p.y < o[1] + margin).length;
      const left = view.x + o[0] - W / 2, top = view.y + o[1] - H;
      const outside = left < 5 || left + W > view.w - 5 || top < 5 || top + H > view.h - 5;
      const score = count + (outside ? 1000 : 0);                // a spot off the screen is a last resort
      if (score < bestScore) { best = i; bestScore = score; bestCount = count; }
    });
    return { offset: options[best].o, moved: best !== 0, name: options[best].name, covered: bestCount };
  }

  // Measure the open popup, choose its spot and move it there
  function placePopup(popup, routes) {
    try {
      const el = popup.getElement();
      const anchor = map.latLngToLayerPoint(popup.getLatLng());
      const pts = [];
      routes.forEach(function (r) {               // a point every ~8 pixels along each route
        for (let i = 1; i < r.latlngs.length; i++) {
          const a = map.latLngToLayerPoint(r.latlngs[i - 1]).subtract(anchor);
          const b = map.latLngToLayerPoint(r.latlngs[i]).subtract(anchor);
          const n = Math.max(1, Math.ceil(a.distanceTo(b) / 8));
          for (let k = 0; k <= n; k++) { pts.push(a.add(b.subtract(a).multiplyBy(k / n))); }
        }
      });
      const c = map.latLngToContainerPoint(popup.getLatLng()), size = map.getSize();
      const choice = choosePlacement(pts, el.offsetWidth, el.offsetHeight, { x: c.x, y: c.y, w: size.x, h: size.y });
      console.log('popup placed', choice.name, '- route points covered:', choice.covered, 'of', pts.length);
      popup.options.offset = L.point(choice.offset[0], choice.offset[1]);
      popup.options.autoPan = true;               // now keep it fully on the screen
      popup.update();
      const tip = el.querySelector('.leaflet-popup-tip-container');
      if (tip) { tip.style.display = choice.moved ? 'none' : ''; }   // the little arrow would point the wrong way
    } catch (err) {
      console.error('Could not place the popup', err);
    }
  }

  // Open a school's popup: draw its routes first, then place the popup away from them
  function openSchoolPopup(feature, latlng) {
    map.closePopup();                              // closes the old popup (and its routes)
    const near = drawLines(feature);
    const popup = L.popup({ autoPan: false, offset: [0, 7] })
      .setLatLng(latlng)
      .setContent(schoolPopup(feature));
    popup.openOn(map);
    placePopup(popup, near);
  }

  // --- 3e. One school circle ---
  function schoolMarker(feature) {
    const latlng = L.GeoJSON.coordsToLatLng(feature.geometry.coordinates);
    const col = schoolColor(feature.properties.ORDRE_ENS);
    const m = L.circleMarker(latlng, { radius: 6, color: col, fillColor: col, fillOpacity: 0.8 });
    m.on('click', () => openSchoolPopup(feature, latlng));
    return m;
  }

  // --- Legend (bottom right of the map): only the ticked school types ---
  const legend = document.createElement('div');
  legend.style.cssText = 'position:absolute;bottom:24px;right:10px;z-index:2000;background:white;' +
    'padding:8px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;display:none;';
  document.getElementById('layout').appendChild(legend);

  const dot = c => '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:' + c + '"></span>';
  function updateLegend() {
    const types = Array.from(shownOrdre).sort();
    legend.innerHTML = types.map(t => '<div>' + dot(schoolColor(t)) + t + '</div>').join('');
    legend.style.display = types.length ? 'block' : 'none';
  }

  // --- 3f. Redraw: a school stays only if its type is ticked AND it has a match ---
  function redraw() {
    schoolLayer.clearLayers(); lineLayer.clearLayers(); map.closePopup();
    let n = 0;
    schools.features.forEach(function (f) {
      if (!shownOrdre.has(f.properties.ORDRE_ENS)) { return; }
      // Once recreation types are ticked, schools without any match disappear
      if (shownTypes.size > 0 && findNearest(f).length === 0) { return; }
      schoolLayer.addLayer(schoolMarker(f));
      n++;
    });
    updateLegend();
    document.getElementById('status').textContent = (n === 0)
      ? 'No schools shown: use the filter (☰) to choose school and recreation types, or widen the distance.'
      : n + ' of ' + schools.features.length + ' schools shown. Click a school to see its closest recreation.';
  }
  // When a popup closes, remove the green lines so they do not stay behind.
  map.on('popupclose', () => lineLayer.clearLayers());

  // --- 3g. Filter checkboxes ---
  function buildChecks(boxId, values, set, colorOf) {
    const box = document.getElementById(boxId);
    values.forEach(function (v) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', function () {
        if (cb.checked) { set.add(v); } else { set.delete(v); }
        redraw();
      });
      label.append(cb, ' ');
      if (colorOf) {
        const sw = document.createElement('span');
        sw.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;background:' + colorOf(v);
        label.append(sw);
      }
      label.append(v);
      box.appendChild(label);
    });
  }
  buildChecks('ordre-checks', unique(schools.features.map(f => f.properties.ORDRE_ENS)), shownOrdre, schoolColor);
  buildChecks('type-checks', unique(recs.map(r => r.props.TYPE)), shownTypes);
  buildChecks('season-checks', SEASONS, shownSeasons);

  // --- 3h. Distance slider (now walking distance) ---
  slider.addEventListener('input', function (e) {
    maxDist = Number(e.target.value);
    document.getElementById('dist-label').textContent = maxDist;
    redraw();   // schools can appear or disappear
  });

  // --- 3i. Search: ignores accents, tolerates typos, suggests while typing ---
  const input = document.getElementById('search-input');
  const msg = document.getElementById('search-msg');
  const list = document.getElementById('search-results');

  function showSchool(f) {
    searchLayer.clearLayers();
    const latlng = L.GeoJSON.coordsToLatLng(f.geometry.coordinates);
    map.setView(latlng, 16, { animate: false });   // no animation, so the popup is placed on the final view
    openSchoolPopup(f, latlng);
  }

  function showRec(r) {
    searchLayer.clearLayers();
    map.closePopup();
    map.setView(r.latlng, 16);
    // Only a popup, no marker: when the X is pressed, nothing is left on the map.
    L.popup({ offset: [0, -2] })
      .setLatLng(r.latlng)
      .setContent('<strong>' + r.props.NOM + '</strong><br>' + r.props.TYPE + '<br>' + r.props.ARROND +
                  (r.props.season_note ? '<br><em>' + r.props.season_note + '</em>' : ''))
      .openOn(map);
  }

  // All places matching the typed text, best matches first.
  // exactOnly = true is used for the suggestions while typing.
  function findHits(q, exactOnly) {
    const maxErr = (q.length < 3 || exactOnly) ? 0 : Math.max(1, Math.floor(q.length / 4));
    const all = [];
    schools.features.forEach(f => all.push({ name: f.properties.NOM_IMM, label: f.properties.NOM_IMM + ' (school)', go: () => showSchool(f) }));
    recs.forEach(r => all.push({ name: r.props.NOM, label: r.props.NOM + ' (' + r.props.ARROND + ')', go: () => showRec(r) }));
    return all
      .map(h => ({ h: h, score: matchScore(q, h.name) }))
      .filter(x => x.score <= maxErr)
      .sort((a, b) => a.score - b.score)
      .map(x => x.h);
  }

  function showList(hits) {
    list.innerHTML = '';
    hits.slice(0, 8).forEach(function (h) {
      const b = document.createElement('button');
      b.textContent = h.label;
      b.addEventListener('click', function () { list.innerHTML = ''; h.go(); });
      list.appendChild(b);
    });
  }

  function doSearch() {
    const text = input.value.trim();
    const q = norm(text);
    list.innerHTML = ''; msg.textContent = '';
    if (!q) { msg.textContent = 'Type a school or recreation site name first.'; return; }

    const hits = findHits(q, false);
    if (hits.length === 0) { msg.textContent = 'No match for "' + text + '". Check the spelling.'; return; }
    if (hits.length === 1) { hits[0].go(); return; }
    if (hits.length > 8) { msg.textContent = hits.length + ' matches, showing 8. Type more of the name.'; }
    else { msg.textContent = 'Did you mean one of these?'; }
    showList(hits);
  }

  document.getElementById('search-go').addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { doSearch(); } });
  // Suggestions while typing (from 2 letters on)
  input.addEventListener('input', function () {
    const q = norm(input.value.trim());
    msg.textContent = '';
    if (q.length < 2) { list.innerHTML = ''; return; }
    showList(findHits(q, true));
  });

  redraw();

}).catch(function (err) {
  document.getElementById('status').textContent =
    'No data was able to be depicted, please refresh the website and check your internet connection.';
  console.error(err);
});

// ---------- 4. The three round buttons ----------
const PAIRS = [['btn-info', 'panel-info'], ['btn-search', 'panel-search'], ['btn-filter', 'panel-filter']];
PAIRS.forEach(function (pair) {
  document.getElementById(pair[0]).addEventListener('click', function () {
    PAIRS.forEach(function (p) {
      const panel = document.getElementById(p[1]);
      panel.hidden = (p[1] !== pair[1]) ? true : !panel.hidden;
    });
  });
});
