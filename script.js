// ===== CONFIGURATION =====
const CONFIG = {
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
  OVERPASS_URL: 'https://overpass-api.de/api/interpreter',
  DEFAULT_LAT: 28.6139,
  DEFAULT_LON: 77.2090,
  DEFAULT_ZOOM: 5,
  TRAVEL_SPEED_KMH: 60,
  HISTORY_KEY: 'stg_history',
  MAX_HISTORY: 50
};

// ===== STATE =====
let map = null;
let currentMarker = null;
let routeLine = null;
let startMarker = null;
let endMarker = null;
let nearbyMarkers = [];
let currentLat = CONFIG.DEFAULT_LAT;
let currentLon = CONFIG.DEFAULT_LON;
let isListening = false;
let recognition = null;
let allPlaces = [];
let auraCursorEffect = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initScrollAnimations();
  initNavHighlighting();
  initPanelTabs();
  initVoiceVisualizer();
  init3DTilt();
  initAuraCursor();
  initBackgroundTransitions();
  renderHistory();
});

// ===== BACKGROUND TRANSITIONS =====
function initBackgroundTransitions() {
  const sections = {
    'hero': 'bgHimalayas',
    'features': 'bgTeagarden',
    'app': 'bgHimalayas',
    'places': 'bgKerala',
    'weather': 'bgKerala',
    'voice': 'bgTeagarden',
    'history': 'bgHimalayas'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const bgId = sections[entry.target.id];
        if (bgId) {
          document.querySelectorAll('.travel-background').forEach(bg => {
            bg.style.opacity = '0';
          });
          const activeBg = document.getElementById(bgId);
          if (activeBg) {
            activeBg.style.opacity = '0.15';
          }
        }
      }
    });
  }, { threshold: 0.3 });

  Object.keys(sections).forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

// ===== CURSOR AURA EFFECT =====
function initAuraCursor() {
  const field = document.getElementById('ambientField');
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    const auras = document.querySelectorAll('.aura');
    if (auras.length > 0) {
      const targetAura = auras[2];
      const offsetX = (mouseX / window.innerWidth - 0.5) * 80;
      const offsetY = (mouseY / window.innerHeight - 0.5) * 80;
      targetAura.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }
  });
}

// ===== MAP =====
function initMap() {
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LON], CONFIG.DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  map.on('click', (e) => {
    currentLat = e.latlng.lat;
    currentLon = e.latlng.lng;
    setMarker(e.latlng.lat, e.latlng.lng);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
  });

  setTimeout(() => map.invalidateSize(), 300);
}

function setMarker(lat, lon, popupContent) {
  if (currentMarker) map.removeLayer(currentMarker);
  
  const markerIcon = L.divIcon({
    html: `<div style="background:#b8a56f;width:24px;height:24px;border-radius:50%;border:3px solid rgba(232,229,220,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;color:#0a0c08;font-weight:700;">✦</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    className: ''
  });
  
  currentMarker = L.marker([lat, lon], { icon: markerIcon }).addTo(map);
  if (popupContent) currentMarker.bindPopup(popupContent).openPopup();
  map.setView([lat, lon], Math.max(map.getZoom(), 10));
}

function setRouteMarkers(startLat, startLon, endLat, endLon, startName, endName) {
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  if (routeLine) map.removeLayer(routeLine);

  const startIcon = L.divIcon({
    html: '<div style="background:#4a5a3d;width:30px;height:30px;border-radius:50%;border:3px solid rgba(232,229,220,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;color:#e8e5dc;font-weight:700;">A</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    className: ''
  });

  const endIcon = L.divIcon({
    html: '<div style="background:#5c3d2e;width:30px;height:30px;border-radius:50%;border:3px solid rgba(232,229,220,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;color:#e8e5dc;font-weight:700;">B</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    className: ''
  });

  startMarker = L.marker([startLat, startLon], { icon: startIcon }).addTo(map)
    .bindPopup(`<strong>Origin:</strong> ${startName}`).openPopup();
  endMarker = L.marker([endLat, endLon], { icon: endIcon }).addTo(map)
    .bindPopup(`<strong>Destination:</strong> ${endName}`);

  routeLine = L.polyline(
    [[startLat, startLon], [endLat, endLon]],
    { color: '#b8a56f', weight: 2.5, dashArray: '8, 12', opacity: 0.7 }
  ).addTo(map);

  map.fitBounds(routeLine.getBounds().pad(0.2));
  currentLat = (startLat + endLat) / 2;
  currentLon = (startLon + endLon) / 2;
}

// ===== GEOCODING =====
async function geocodeAddress(address, isFallback = false) {
  const url = `${CONFIG.NOMINATIM_URL}/search?q=${encodeURIComponent(address)}&format=json&limit=1&accept-language=en`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Geocoding failed');
    const data = await resp.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name,
        fallback: isFallback,
        originalQuery: address
      };
    }
    return null;
  } catch (err) {
    console.error('Geocode error:', err);
    return null;
  }
}

async function reverseGeocode(lat, lon) {
  const url = `${CONFIG.NOMINATIM_URL}/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Reverse geocoding failed');
    const data = await resp.json();
    return data.display_name || 'Unknown location';
  } catch (err) {
    console.error('Reverse geocode error:', err);
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

function extractCity(query) {
  const parts = query.split(',').map(s => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts.slice(i).length >= 2) {
      return parts.slice(i).join(', ');
    }
  }
  return query;
}

// ===== ROUTE PLANNING =====
async function planRoute() {
  const startInput = document.getElementById('routeStart').value.trim();
  const endInput = document.getElementById('routeEnd').value.trim();
  const resultDiv = document.getElementById('routeResult');

  if (!startInput || !endInput) {
    showToast('Please enter both origin and destination.', 'error');
    return;
  }

  resultDiv.innerHTML = '<div class="loading-spinner"><div class="spinner"></div>Charting coordinates...</div>';

  let startResult = await geocodeAddress(startInput);
  if (!startResult) {
    const cityQuery = extractCity(startInput);
    startResult = await geocodeAddress(cityQuery, true);
  }

  let endResult = await geocodeAddress(endInput);
  if (!endResult) {
    const cityQuery = extractCity(endInput);
    endResult = await geocodeAddress(cityQuery, true);
  }

  if (!startResult || !endResult) {
    resultDiv.innerHTML = '<div class="result-card"><p style="color: var(--danger);">❌ Could not geocode one or both locations. Try a different search term.</p></div>';
    return;
  }

  const dist = haversineDistance(startResult.lat, startResult.lon, endResult.lat, endResult.lon);
  const timeHours = dist / CONFIG.TRAVEL_SPEED_KMH;
  const timeMins = Math.round(timeHours * 60);

  setRouteMarkers(startResult.lat, startResult.lon, endResult.lat, endResult.lon, startResult.displayName, endResult.displayName);

  const fallbackNote = (startResult.fallback ? `<p style="font-size:12px;color:var(--warning);margin-top:8px;">⚠️ City fallback used for "${startInput}": ${startResult.displayName}</p>` : '') +
    (endResult.fallback ? `<p style="font-size:12px;color:var(--warning);margin-top:4px;">⚠️ City fallback used for "${endInput}": ${endResult.displayName}</p>` : '');

  resultDiv.innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <div class="result-icon">🗺️</div>
        <div class="result-title">Route Charted</div>
      </div>
      <div class="result-address"><strong>From:</strong> ${startResult.displayName}</div>
      <div class="result-address"><strong>To:</strong> ${endResult.displayName}</div>
      <div class="route-info-display">
        <div class="route-stat-card">
          <div class="route-stat-value">${dist.toFixed(1)}</div>
          <div class="route-stat-label">Distance (km)</div>
        </div>
        <div class="route-stat-card">
          <div class="route-stat-value">${timeHours < 1 ? timeMins + ' min' : timeHours.toFixed(1) + ' hrs'}</div>
          <div class="route-stat-label">Est. Time (${CONFIG.TRAVEL_SPEED_KMH} km/h)</div>
        </div>
        <div class="route-stat-card">
          <div class="route-stat-value">~${Math.round(dist / CONFIG.TRAVEL_SPEED_KMH * 60)}</div>
          <div class="route-stat-label">Minutes</div>
        </div>
      </div>
      ${fallbackNote}
      <p style="font-size:10px;color:var(--text-muted);margin-top:12px;">* Distance is a straight-line (great-circle) estimate, not a driving route.</p>
    </div>
  `;

  addToHistory('route', `${startInput} → ${endInput}`, dist.toFixed(1) + ' km');
  showToast(`Route charted: ${dist.toFixed(1)} km`, 'success');
}

function clearRoute() {
  document.getElementById('routeStart').value = '';
  document.getElementById('routeEnd').value = '';
  document.getElementById('routeResult').innerHTML = '';
  if (startMarker) map.removeLayer(startMarker);
  if (endMarker) map.removeLayer(endMarker);
  if (routeLine) map.removeLayer(routeLine);
  startMarker = null; endMarker = null; routeLine = null;
}

// ===== LOCATION SEARCH =====
async function searchLocation() {
  const query = document.getElementById('searchInput').value.trim();
  const resultDiv = document.getElementById('searchResult');

  if (!query) {
    showToast('Please enter a location to seek.', 'error');
    return;
  }

  resultDiv.innerHTML = '<div class="loading-spinner"><div class="spinner"></div>Searching the archives...</div>';

  let result = await geocodeAddress(query);
  if (!result) {
    const cityQuery = extractCity(query);
    result = await geocodeAddress(cityQuery, true);
  }

  if (!result) {
    resultDiv.innerHTML = '<div class="result-card"><p style="color: var(--danger);">❌ Location not found. Try a different search term.</p></div>';
    return;
  }

  setMarker(result.lat, result.lon, result.displayName);
  currentLat = result.lat;
  currentLon = result.lon;

  const fallbackNote = result.fallback ? `<p style="font-size:12px;color:var(--warning);margin-top:8px;">⚠️ City fallback for "${query}": ${result.displayName}</p>` : '';

  resultDiv.innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <div class="result-icon">📍</div>
        <div class="result-title">${result.displayName.split(',')[0]}</div>
      </div>
      <div class="result-address">${result.displayName}</div>
      <div class="result-stats">
        <div class="result-stat">🌐 <strong>Lat:</strong> ${result.lat.toFixed(4)}</div>
        <div class="result-stat">🌐 <strong>Lon:</strong> ${result.lon.toFixed(4)}</div>
      </div>
      ${fallbackNote}
    </div>
  `;

  addToHistory('search', query, result.displayName);
  showToast(`Located: ${result.displayName.split(',')[0]}`, 'success');
}

// ===== NEARBY PLACES =====
async function fetchNearbyPlaces() {
  const resultDiv = document.getElementById('placesResult');
  const gridDiv = document.getElementById('placesGrid');

  resultDiv.innerHTML = '<div class="loading-spinner"><div class="spinner"></div>Surveying nearby havens...</div>';
  gridDiv.innerHTML = '';

  nearbyMarkers.forEach(m => map.removeLayer(m));
  nearbyMarkers = [];

  const radius = 10000;
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="fuel"](around:${radius},${currentLat},${currentLon});
      node["amenity"="restaurant"](around:${radius},${currentLat},${currentLon});
      node["amenity"="fast_food"](around:${radius},${currentLat},${currentLon});
      node["amenity"="cafe"](around:${radius},${currentLat},${currentLon});
      node["amenity"="hospital"](around:${radius},${currentLat},${currentLon});
      node["amenity"="clinic"](around:${radius},${currentLat},${currentLon});
      node["amenity"="doctors"](around:${radius},${currentLat},${currentLon});
      node["amenity"="school"](around:${radius},${currentLat},${currentLon});
      node["amenity"="college"](around:${radius},${currentLat},${currentLon});
      node["amenity"="university"](around:${radius},${currentLat},${currentLon});
      node["tourism"="hotel"](around:${radius},${currentLat},${currentLon});
      node["tourism"="motel"](around:${radius},${currentLat},${currentLon});
      node["tourism"="guest_house"](around:${radius},${currentLat},${currentLon});
    );
    out body 30;
  `;

  try {
    const resp = await fetch(CONFIG.OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!resp.ok) throw new Error('Overpass API request failed');
    const data = await resp.json();
    allPlaces = data.elements.map(el => {
      let category = 'other';
      const a = el.tags.amenity || '';
      const t = el.tags.tourism || '';
      if (a === 'fuel') category = 'fuel';
      else if (['restaurant', 'fast_food', 'cafe'].includes(a)) category = 'food';
      else if (['hospital', 'clinic', 'doctors'].includes(a)) category = 'health';
      else if (['school', 'college', 'university'].includes(a)) category = 'education';
      else if (['hotel', 'motel', 'guest_house'].includes(t)) category = 'hotel';

      return {
        lat: el.lat,
        lon: el.lon,
        name: el.tags.name || el.tags['name:en'] || 'Unnamed',
        category: category,
        address: [el.tags['addr:street'], el.tags['addr:city']].filter(Boolean).join(', ') || ''
      };
    });

    renderPlaces(allPlaces);
    resultDiv.innerHTML = `<p style="font-size:14px;color:var(--text-secondary);">Uncovered <strong style="color:var(--accent-lime);">${allPlaces.length}</strong> places within ~10km radius.</p>`;

    allPlaces.slice(0, 20).forEach((place) => {
      const colors = { fuel: '#7a8a55', food: '#b8a56f', health: '#8a4a3d', education: '#a69a5c', hotel: '#5c3d2e', other: '#5a584a' };
      const icon = L.divIcon({
        html: `<div style="background:${colors[place.category]};width:18px;height:18px;border-radius:50%;border:2px solid rgba(232,229,220,0.8);box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        className: ''
      });
      const m = L.marker([place.lat, place.lon], { icon: icon })
        .addTo(map)
        .bindPopup(`<strong>${place.name}</strong><br>${place.category}`);
      nearbyMarkers.push(m);
    });

    showToast(`Found ${allPlaces.length} nearby places`, 'success');
  } catch (err) {
    console.error('Overpass error:', err);
    resultDiv.innerHTML = '<div class="result-card"><p style="color:var(--danger);">❌ Failed to fetch nearby places. The Overpass API may be temporarily unavailable.</p></div>';
  }
}

function renderPlaces(places) {
  const gridDiv = document.getElementById('placesGrid');
  gridDiv.innerHTML = '';

  const catIcons = { fuel: '⛽', food: '🍖', health: '⚕', education: '📖', hotel: '🏨', other: '•' };
  const catClasses = { fuel: 'cat-fuel', food: 'cat-food', health: 'cat-health', education: 'cat-education', hotel: 'cat-hotel', other: '' };
  const catLabels = { fuel: 'Fuel', food: 'Sustenance', health: 'Healing', education: 'Learning', hotel: 'Lodging', other: 'Other' };

  places.slice(0, 30).forEach((place, idx) => {
    const card = document.createElement('div');
    card.className = 'place-card';
    card.style.animationDelay = `${idx * 0.05}s`;
    card.innerHTML = `
      <div class="place-name">
        ${catIcons[place.category]} ${place.name}
        <span class="cat-badge ${catClasses[place.category]}">${catLabels[place.category]}</span>
      </div>
      <div class="place-address">${place.address || 'Address unavailable'}</div>
    `;
    card.addEventListener('click', () => {
      setMarker(place.lat, place.lon, `<strong>${place.name}</strong><br>${place.address || ''}`);
      currentLat = place.lat;
      currentLon = place.lon;
    });
    gridDiv.appendChild(card);
  });
}

function filterPlaces(filter, btn) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');

  if (filter === 'all') {
    renderPlaces(allPlaces);
  } else {
    renderPlaces(allPlaces.filter(p => p.category === filter));
  }
}

// ===== WEATHER HELPER =====
async function getWeatherHelper() {
  const resultDiv = document.getElementById('weatherResult');
  resultDiv.innerHTML = '<div class="loading-spinner"><div class="spinner"></div>Reading atmospheric conditions...</div>';

  const placeName = await reverseGeocode(currentLat, currentLon);

  setTimeout(() => {
    resultDiv.innerHTML = `
      <div class="weather-card">
        <div class="weather-icon-large">🌤️</div>
        <div class="weather-place">${placeName.split(',')[0]}</div>
        <div class="weather-message">
          You are currently observing <strong>${placeName}</strong>.<br><br>
          For precise, real-time atmospheric data, consult your device's weather application or visit <a href="https://weather.com" target="_blank">weather.com</a> or <a href="https://openweathermap.org" target="_blank">openweathermap.org</a>.
        </div>
        <div class="weather-tip">
          📍 Coordinates: ${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}
        </div>
      </div>
    `;
  }, 800);
}

// ===== VOICE ASSISTANT =====
function initVoiceVisualizer() {
  const vis = document.getElementById('voiceVisualizer');
  for (let i = 0; i < 30; i++) {
    const bar = document.createElement('div');
    bar.className = 'voice-bar';
    bar.style.setProperty('--bar-height', (Math.random() * 40 + 10) + 'px');
    bar.style.animationDelay = (Math.random() * 0.5) + 's';
    vis.appendChild(bar);
  }
}

function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Voice recognition is not supported. Please use Chrome.', 'error');
    return;
  }

  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
}

function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('voiceBtn').innerHTML = '<span>⏹️</span> Stop Listening';
    document.getElementById('voiceStatus').textContent = 'Listening... Speak now';
    document.querySelectorAll('.voice-bar').forEach(b => b.classList.add('active'));
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    document.getElementById('voiceTranscript').textContent = transcript;

    if (event.results[event.results.length - 1].isFinal) {
      processVoiceCommand(transcript);
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error !== 'no-speech') {
      document.getElementById('voiceStatus').textContent = 'Error: ' + event.error;
    }
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };

  recognition.start();
}

function stopListening() {
  isListening = false;
  if (recognition) recognition.stop();
  document.getElementById('voiceBtn').innerHTML = '<span>🎙️</span> Begin Listening';
  document.getElementById('voiceStatus').textContent = 'Strike the button to begin listening';
  document.querySelectorAll('.voice-bar').forEach(b => b.classList.remove('active'));
}

function processVoiceCommand(text) {
  const lower = text.toLowerCase().trim();

  if (lower.includes('plan route') || lower.includes('navigate')) {
    const match = lower.match(/plan\s+route\s+(?:from\s+)?(.+?)\s+to\s+(.+)/i) ||
                  lower.match(/navigate\s+(?:from\s+)?(.+?)\s+to\s+(.+)/i);
    if (match) {
      document.getElementById('routeStart').value = match[1].trim();
      document.getElementById('routeEnd').value = match[2].trim();
      document.getElementById('voiceStatus').textContent = `Charting route: ${match[1].trim()} → ${match[2].trim()}`;
      planRoute();
    } else {
      document.getElementById('voiceStatus').textContent = 'Could not parse route. Try: "plan route from Delhi to Lucknow"';
    }
  } else if (lower.includes('search') || lower.includes('find') || lower.includes('look for') || lower.includes('show me')) {
    const searchFor = lower.replace(/^(search|find|look\s+for|show\s+me)\s+(for\s+)?/i, '').trim();
    document.getElementById('searchInput').value = searchFor;
    document.getElementById('voiceStatus').textContent = `Seeking: ${searchFor}`;
    searchLocation();
  } else if (lower.includes('nearby')) {
    document.getElementById('voiceStatus').textContent = 'Surveying nearby havens...';
    fetchNearbyPlaces();
  } else if (lower.includes('weather')) {
    document.getElementById('voiceStatus').textContent = 'Reading atmospheric conditions...';
    getWeatherHelper();
  } else {
    document.getElementById('voiceStatus').textContent = `Command unrecognized: "${text}". Try: "plan route from X to Y", "search for Z", "show nearby", or "show weather"`;
  }
}

function simulateVoice(text) {
  document.getElementById('voiceTranscript').textContent = text;
  document.getElementById('voiceStatus').textContent = `Simulated: "${text}"`;
  processVoiceCommand(text);
}

// ===== HISTORY =====
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(items));
}

function addToHistory(type, name, meta) {
  let items = getHistory();
  items.unshift({
    type: type,
    name: name,
    meta: meta,
    timestamp: Date.now()
  });
  if (items.length > CONFIG.MAX_HISTORY) items = items.slice(0, CONFIG.MAX_HISTORY);
  saveHistory(items);
  renderHistory();
}

function renderHistory() {
  const listDiv = document.getElementById('historyList');
  const items = getHistory();

  if (items.length === 0) {
    listDiv.innerHTML = '<div class="history-empty"><p>The archive awaits. Begin exploring to inscribe your journey.</p></div>';
    return;
  }

  listDiv.innerHTML = items.map((item, idx) => {
    const typeClass = item.type === 'route' ? 'route' : 'search';
    const icon = item.type === 'route' ? '🗺️' : '📍';
    const time = new Date(item.timestamp);
    const timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="history-item" onclick="replayHistory(${idx})">
        <div class="history-type ${typeClass}">${icon}</div>
        <div class="history-text">
          <div class="history-name">${item.name}</div>
          <div class="history-meta">${item.meta} · ${timeStr}</div>
        </div>
        <button class="history-delete" onclick="event.stopPropagation(); deleteHistoryItem(${idx})" title="Delete">✕</button>
      </div>
    `;
  }).join('');
}

function replayHistory(idx) {
  const items = getHistory();
  if (!items[idx]) return;
  const item = items[idx];

  if (item.type === 'route') {
    const parts = item.name.split(' → ');
    if (parts.length === 2) {
      document.getElementById('routeStart').value = parts[0];
      document.getElementById('routeEnd').value = parts[1];
      scrollToSection('app');
      setTimeout(() => planRoute(), 500);
    }
  } else {
    document.getElementById('searchInput').value = item.name;
    scrollToSection('app');
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-panel="search"]').classList.add('active');
    document.getElementById('panel-search').classList.add('active');
    setTimeout(() => searchLocation(), 500);
  }
}

function deleteHistoryItem(idx) {
  let items = getHistory();
  items.splice(idx, 1);
  saveHistory(items);
  renderHistory();
  showToast('Entry removed from archive', 'info');
}

function clearHistory() {
  localStorage.removeItem(CONFIG.HISTORY_KEY);
  renderHistory();
  showToast('Archive cleared', 'info');
}

// ===== UTILITIES =====
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scrollToSection(id) {
  document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.4s var(--transition-smooth) forwards';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ===== SCROLL ANIMATIONS =====
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    document.getElementById('scrollProgress').style.width = progress + '%';
  });
}

// ===== NAV HIGHLIGHTING =====
function initNavHighlighting() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const sections = ['hero', 'features', 'app', 'places', 'weather', 'voice', 'history'];

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navBtns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-section="${entry.target.id}"]`);
        if (activeBtn) activeBtn.classList.add('active');
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      scrollToSection(btn.dataset.section);
    });
  });
}

// ===== PANEL TABS =====
function initPanelTabs() {
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.panel-container');
      parent.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      parent.querySelectorAll('.panel-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const panelId = 'panel-' + tab.dataset.panel;
      document.getElementById(panelId).classList.add('active');
    });
  });
}

// ===== 3D TILT =====
function init3DTilt() {
  document.querySelectorAll('.tilt-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = (y - centerY) / centerY * -6;
      const rotateY = (x - centerX) / centerX * 6;
      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translateY(0)';
    });
  });
}

// ===== KEYBOARD =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const activePanel = document.querySelector('.panel-content.active');
    if (activePanel) {
      if (activePanel.id === 'panel-route') {
        planRoute();
      } else if (activePanel.id === 'panel-search') {
        searchLocation();
      }
    }
  }
});