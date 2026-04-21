# Smart Travel Guide 

Smart Travel Guide is a web app that shows an interactive map, plans a simple route, lists nearby places (fuel, restaurants, hospitals, schools, hotels), and provides a basic weather helper message — all without using Google Maps or any weather API key.

## Tech stack

- HTML, CSS, JavaScript
- Leaflet for the map (OpenStreetMap tiles) [web:2]
- Nominatim for geocoding and reverse-geocoding place names [web:36][web:44]
- Overpass API for nearby places (fuel, food, health, education, hotels) [web:24][web:22]

> Note: Live weather data normally requires a separate weather API (OpenWeather, AccuWeather, Google Weather API, etc.), all of which require API keys even for free usage. [web:11][web:55][web:56][web:57]  
> This project intentionally avoids such keys and only shows a generic weather helper message.

## Features

- **Route Planner (Start → End)**  
  - Accepts any place name, including combinations like:
    - `Chandigarh University, Mohali, Punjab, India`
    - `XYZ College, Lucknow, Uttar Pradesh, India`
  - Uses Nominatim to geocode both start and end.
  - Draws a straight line between them (approximate, not real driving route).
  - Displays:
    - Approximate distance in km (great-circle / haversine).
    - Approximate travel time assuming 60 km/h.

- **Single Location Search**  
  - Accepts any place name (city, school, hospital, college, etc.).
  - Centers the map on the result and adds a marker.
  - Uses Nominatim’s display_name to show full address (including city, state, country). [web:50]

- **Smart Geocoding with City Fallback**  
  - First tries the full text (e.g. `"Chandigarh University Unnao Uttar Pradesh"`).
  - If that exact combination is not found, it tries to resolve just the city part (e.g. `"Unnao, Uttar Pradesh, India"`).
  - When using a fallback, the UI shows a note like:
    - `Unnao, Uttar Pradesh, India (city fallback for "Chandigarh university Unnao")`.

- **Nearby Places (using Overpass API)**  
  - For the current location (from route or search), queries OpenStreetMap data for:
    - Fuel stations (`amenity=fuel`)
    - Restaurants, fast food, cafes (`amenity=restaurant|fast_food|cafe`)
    - Hospitals, clinics, doctors (`amenity=hospital|clinic|doctors`)
    - Schools, colleges, universities (`amenity=school|college|university`)
    - Hotels, motels, guest houses (`tourism=hotel|motel|guest_house`) [web:27]
  - Shows up to 30 places with a small category label.

- **Weather (no external API)**  
  - There is no “free Chrome weather API”.
  - When you click **Weather**, the app:
    - Uses Nominatim reverse geocoding to display a readable place name for the current map center.
    - Shows a friendly message telling the user to check phone or browser weather tools for live data.
  - No API keys or weather subscriptions required.

- **Voice Assistant (Chrome only)**  
  - Basic voice commands:
    - `plan route from Delhi to Lucknow`
    - `show nearby`
    - `show weather`

- **History**  
  - Stores recent routes and location searches in `localStorage`.
  - Click a history item to re-run a location search.

## How to run

1. Put these files in the same folder:
   - `index.html`
   - `style.css`
   - `script.js`
   - (optional) `README.md`
2. Open `index.html` in a modern browser, or serve via a local server (e.g., VS Code Live Server).

## Notes & limitations

- Route is a **straight-line estimate**, not turn-by-turn directions.
- Geocoding and nearby places depend on OpenStreetMap coverage; if a college or hospital is not mapped there, it cannot be found.
- Nominatim and Overpass are public services with usage policies and rate limits; this project is intended for **personal / demo use**, not heavy production. [web:35][web:24]
- Live weather from services such as OpenWeather or AccuWeather always requires an API key (even on free plans). This project intentionally avoids storing any such keys. [web:11][web:55][web:56]

## Enabling real weather (optional)

If in the future you decide you *do* want live weather:

1. Create a free account at OpenWeather.
2. Get your API key (APPID). [web:55]
3. Replace the “no-API” weather block in `script.js` with the `fetch`-based OpenWeather example (refer to OpenWeather docs).
4. Set `CONFIG.OPENWEATHER_KEY = "YOUR_KEY_HERE"`.

This is optional and not required for the rest of the app to work.