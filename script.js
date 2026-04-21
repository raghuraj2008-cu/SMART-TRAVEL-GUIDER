// =============== CONFIG (NO WEATHER, NO KEYS) ===============
const CONFIG = {
    // reserved for future use
};

// =============== GLOBALS ===============
let map;
let routeLayer;
let currentLocation = { lat: 26.8467, lng: 80.9462 }; // Lucknow default
let history = JSON.parse(localStorage.getItem("travelHistory")) || [];
let recognition;

// =============== INIT LEAFLET MAP ===========================
function initMap() {
    map = L.map("map").setView([currentLocation.lat, currentLocation.lng], 7);

    // OpenStreetMap tiles (free, no key) [web:2]
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    // default marker at Lucknow
    L.marker([currentLocation.lat, currentLocation.lng])
        .addTo(map)
        .bindPopup("Lucknow")
        .openPopup();
}

// =============== HELPER: HAVERSINE DISTANCE =================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const toRad = deg => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // km
}

// =============== GEOCODING: NOMINATIM + CITY FALLBACK =======
// Try full text (college + city). If not found, fall back to city. [web:36][web:44]
async function geocodeNominatim(query) {
    const cleaned = query.replace(/\s+/g, " ").trim();

    async function searchOnce(q) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            q
        )}&addressdetails=1`;
        const res = await fetch(url, {
            headers: { "User-Agent": "SmartTravelGuide/1.0" }
        });
        if (!res.ok) {
            throw new Error("Geocoding server error");
        }
        const data = await res.json();
        return data[0] || null;
    }

    // 1) Full query, e.g. "Chandigarh University, Unnao, Uttar Pradesh, India"
    let result = await searchOnce(cleaned);
    if (result) {
        result.__fallback = false;
        return result;
    }

    // 2) If there is a comma, try everything except first part (usually city) [web:44]
    if (cleaned.includes(",")) {
        const parts = cleaned.split(",").map(p => p.trim()).filter(Boolean);
        const last = parts.slice(1).join(", "); // drop the first part (name)
        if (last) {
            result = await searchOnce(last);
            if (result) {
                result.__fallback = true;
                result.__fallbackQuery = last;
                return result;
            }
        }
    } else {
        // 3) If no comma, try last word as city (rough heuristic)
        // "Chandigarh university Unnao" -> "Unnao"
        const tokens = cleaned.split(" ").filter(Boolean);
        if (tokens.length > 1) {
            const lastWord = tokens[tokens.length - 1];
            result = await searchOnce(lastWord);
            if (result) {
                result.__fallback = true;
                result.__fallbackQuery = lastWord;
                return result;
            }
        }
    }

    // 4) Nothing found at all
    return null;
}

// =============== ROUTE PLANNER (ANY PLACE NAMES) ============
document.getElementById("planRoute").addEventListener("click", async () => {
    let start = document.getElementById("startPoint").value.trim();
    let end = document.getElementById("endPoint").value.trim();

    if (!start) start = "Delhi, India";
    if (!end) end = "Lucknow, India";

    const btn = document.getElementById("planRoute");
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Planning...';
    btn.disabled = true;

    try {
        const [startData, endData] = await Promise.all([
            geocodeNominatim(start),
            geocodeNominatim(end)
        ]);

        if (!startData) {
            throw new Error(
                `Could not find location for: "${start}". Try "Name, City, Country".`
            );
        }
        if (!endData) {
            throw new Error(
                `Could not find location for: "${end}". Try "Name, City, Country".`
            );
        }

        const startLoc = {
            lat: parseFloat(startData.lat),
            lng: parseFloat(startData.lon)
        };
        const endLoc = {
            lat: parseFloat(endData.lat),
            lng: parseFloat(endData.lon)
        };

        if (routeLayer) {
            map.removeLayer(routeLayer);
        }

        // Draw straight line as approximate route
        routeLayer = L.polyline(
            [
                [startLoc.lat, startLoc.lng],
                [endLoc.lat, endLoc.lng]
            ],
            {
                color: "#FF6B6B",
                weight: 4,
                opacity: 0.9,
                dashArray: "8 4"
            }
        ).addTo(map);

        map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

        const distanceKm = haversineDistance(
            startLoc.lat,
            startLoc.lng,
            endLoc.lat,
            endLoc.lng
        ).toFixed(1);
        const speedKmH = 60;
        const durationMin = Math.round((distanceKm / speedKmH) * 60);

        const fromLabel = startData.display_name;
        const toLabel = endData.display_name;

        const fromInfo = startData.__fallback
            ? `${fromLabel} <small>(city fallback for "${start}")</small>`
            : fromLabel;
        const toInfo = endData.__fallback
            ? `${toLabel} <small>(city fallback for "${end}")</small>`
            : toLabel;

        document.getElementById("routeResult").innerHTML = `
            <div class="route-info">
                <div class="distance">${distanceKm} km</div>
                <div class="duration">⏱️ ~${durationMin} mins (approx)</div>
                <div><strong>From:</strong> ${fromInfo}</div>
                <div><strong>To:</strong> ${toInfo}</div>
                <div>📍 Straight-line estimate (not road route)</div>
            </div>
        `;

        currentLocation = endLoc;
        addToHistory(
            "Route",
            `From ${start.slice(0, 40)}... to ${end.slice(0, 40)}... (${distanceKm} km)`
        );
        speak(
            `Approximate route planned! Around ${distanceKm} kilometers, taking roughly ${durationMin} minutes by car.`
        );
    } catch (err) {
        document.getElementById("routeResult").innerHTML =
            `<div class="result-box" style="color:#ff6b6b"><strong>❌ Error:</strong> ${err.message}</div>`;
        console.error(err);
    } finally {
        btn.innerHTML = '<i class="fas fa-map"></i> Plan Route';
        btn.disabled = false;
    }
});

// =============== SINGLE LOCATION SEARCH (ANY PLACE) =========
document.getElementById("searchLocation").addEventListener("click", async () => {
    const address = document.getElementById("addressInput").value.trim();
    if (!address) return;

    try {
        const data = await geocodeNominatim(address);
        if (!data) {
            throw new Error(
                `Location not found for: "${address}". Try "Name, City, Country".`
            );
        }

        currentLocation = {
            lat: parseFloat(data.lat),
            lng: parseFloat(data.lon)
        };

        map.setView([currentLocation.lat, currentLocation.lng], 13);

        L.marker([currentLocation.lat, currentLocation.lng], {
            icon: L.icon({
                iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            })
        })
            .addTo(map)
            .bindPopup(data.display_name)
            .openPopup();

        const label = data.display_name;
        const info = data.__fallback
            ? `${label} <small>(city fallback for "${address}")</small>`
            : label;

        document.getElementById("locationResult").innerHTML = `
            <div class="result-box">
                <strong>📍 Found:</strong> ${info}
            </div>
        `;
        addToHistory("Location", address);
    } catch (err) {
        document.getElementById("locationResult").innerHTML = `
            <div class="result-box" style="color:#ff6b6b"><strong>❌ Error:</strong> ${err.message}</div>
        `;
    }
});

// =============== VOICE ASSISTANT =============================
document
    .getElementById("voiceAssistantBtn")
    .addEventListener("click", toggleVoice);
document.getElementById("closeVoice").addEventListener("click", toggleVoice);

function toggleVoice() {
    const panel = document.getElementById("voicePanel");
    panel.classList.toggle("active");
    if (panel.classList.contains("active")) initVoice();
    else if (recognition) recognition.stop();
}

function initVoice() {
    if (typeof webkitSpeechRecognition === "undefined") {
        document.getElementById("voiceStatus").innerHTML =
            "❌ Voice not supported (use Chrome)";
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.lang = "en-IN";

    recognition.onresult = e => {
        const command =
            e.results[e.results.length - 1][0].transcript.toLowerCase();
        document.getElementById("voiceStatus").innerHTML =
            `<i class="fas fa-check"></i> "${command}"`;

        if (command.includes("plan route")) {
            const match = command.match(/from (.+) to (.+)/);
            if (match) {
                document.getElementById("startPoint").value = match[1].trim();
                document.getElementById("endPoint").value = match[2].trim();
            }
            document.getElementById("planRoute").click();
        } else if (command.includes("nearby")) {
            document.getElementById("showNearby").click();
        }
        // Weather command removed because weather feature is removed
    };

    recognition.start();
    document.getElementById("voiceStatus").innerHTML =
        '<i class="fas fa-microphone"></i> Listening...';
}

// =============== NEARBY PLACES (fuel, food, health, edu, hotel)
document.getElementById("showNearby").addEventListener("click", async () => {
    const radiusKm = document.getElementById("radius").value;
    const radiusMeters = radiusKm * 1000;

    const query = `
        [out:json];
        (
          node["amenity"="fuel"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});
          way["amenity"="fuel"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});

          node["amenity"~"^(restaurant|fast_food|cafe)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});
          way["amenity"~"^(restaurant|fast_food|cafe)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});

          node["amenity"~"^(hospital|clinic|doctors)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});
          way["amenity"~"^(hospital|clinic|doctors)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});

          node["amenity"~"^(school|college|university)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});
          way["amenity"~"^(school|college|university)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});

          node["tourism"~"^(hotel|motel|guest_house)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});
          way["tourism"~"^(hotel|motel|guest_house)$"](around:${radiusMeters},${currentLocation.lat},${currentLocation.lng});
        );
        out center 40;
    `;

    try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });

        if (!res.ok) {
            throw new Error("Server busy, please try again later");
        }

        const data = await res.json();
        const places = data.elements.slice(0, 30);

        if (!places.length) {
            document.getElementById("nearbyPlaces").innerHTML = `
                <div class="result-box">
                    <strong>🏙️ No nearby fuel/food/hospitals/schools/hotels within ${radiusKm} km.</strong>
                </div>
            `;
            return;
        }

        const categoryFromTags = tags => {
            if (!tags) return "place";
            if (tags.amenity) return tags.amenity;
            if (tags.tourism) return tags.tourism;
            return "place";
        };

        const placesHtml = places
            .map((p, i) => {
                const name =
                    p.tags && p.tags.name
                        ? p.tags.name
                        : "Unnamed " + categoryFromTags(p.tags);
                const category = categoryFromTags(p.tags);
                return `
                <div style="display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid #eee;">
                    <span>${i + 1}. ${name}</span>
                    <span style="font-size:12px;padding:2px 6px;border-radius:12px;background:#f1f3f5;color:#555;">
                        ${category}
                    </span>
                </div>
            `;
            })
            .join("");

        document.getElementById("nearbyPlaces").innerHTML = `
            <div class="result-box">
                <strong>🏙️ Nearby fuel, food, health, education & hotels (${places.length})</strong>
                <div style="max-height:260px;overflow:auto;">${placesHtml}</div>
            </div>
        `;
    } catch (err) {
        document.getElementById("nearbyPlaces").innerHTML = `
            <div class="result-box" style="color:#ff6b6b">
                <strong>❌ Nearby:</strong> ${err.message}
            </div>
        `;
    }
});

// =============== SPEAK =======================================
function speak(text) {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
}

// =============== HISTORY =====================================
function addToHistory(title, content) {
    history.unshift({
        title,
        content,
        time: new Date().toLocaleString("en-IN")
    });
    if (history.length > 15) history.pop();
    localStorage.setItem("travelHistory", JSON.stringify(history));
    updateHistory();
}

function updateHistory() {
    document.getElementById("historyList").innerHTML =
        history
            .map(
                item => `
            <li onclick="document.getElementById('addressInput').value='${item.content
                .slice(0, 30)
                .replace(/'/g, "\\'")}';document.getElementById('searchLocation').click()">
                <strong>${item.title}</strong> <small>${item.time}</small><br>${item.content}
            </li>
        `
            )
            .join("") ||
        '<li style="color:#666;text-align:center;">No trips planned yet</li>';
}

// =============== OTHER BUTTONS ===============================
document.getElementById("darkToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
});

document.getElementById("clearHistory").addEventListener("click", () => {
    history = [];
    localStorage.removeItem("travelHistory");
    updateHistory();
});

// Simple placeholders for text/image features
document.getElementById("translateBtn").addEventListener("click", () => {
    const text = document.getElementById("textInput").value.trim();
    document.getElementById("textResult").innerHTML = text
        ? `<div class="result-box">Translation feature not implemented yet.</div>`
        : "";
});
document.getElementById("summarizeBtn").addEventListener("click", () => {
    const text = document.getElementById("textInput").value.trim();
    document.getElementById("textResult").innerHTML = text
        ? `<div class="result-box">Summary feature not implemented yet.</div>`
        : "";
});
document.getElementById("speakBtn").addEventListener("click", () => {
    const text = document.getElementById("textInput").value.trim();
    if (text) speak(text);
});

document.getElementById("analyzeImage").addEventListener("click", () => {
    document.getElementById("imageResult").innerHTML =
        '<div class="result-box">Image analysis feature not implemented yet.</div>';
});

// =============== INIT =======================================
document.addEventListener("DOMContentLoaded", () => {
    updateHistory();
    initMap();
    document.getElementById("startPoint").value = "Delhi, India";
    document.getElementById("endPoint").value = "Lucknow, India";
});