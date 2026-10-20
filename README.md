# Atmos Weather Dashboard

A responsive weather dashboard powered by OpenWeatherMap. Search a city, use your device location, switch between Celsius and Fahrenheit, and save up to eight favorite places. Your last location, units, and favorites are stored in this browser.

## Get started

1. Create an API key at [OpenWeatherMap](https://openweathermap.org/api).
2. Copy `config.example.js` to `config.js` and place your key in the config file:

   ```js
   window.OPENWEATHER_API_KEY = 'your_openweathermap_api_key';
   ```

3. Serve this folder over HTTP and open it in a browser. For example, with Python installed, run `python -m http.server 8000` from this folder and visit `http://localhost:8000`.

The page starts with New York until you search for a location or grant geolocation access. A localhost or HTTPS origin is required by most browsers for geolocation. `config.js` is listed in `.gitignore` and should never be committed. This only keeps the key out of Git; because this is a browser app, the key can still be seen in network requests by visitors. For a public deployment, proxy requests through a server and keep the key in a server-side environment variable.

## Features

- OpenWeatherMap geocoding, current weather, and five-day forecast
- Browser geolocation and local-time display for the selected city
- Automatic light theme from 06:00–17:59 and dark theme overnight, based on the city's UTC offset
- Persistent favorites and temperature-unit preference
- Responsive layout and clear missing-key / API error states

Weather requests follow the [OpenWeather current weather](https://openweathermap.org/api/current), [geocoding](https://openweathermap.org/api/geocoding-api), and [five-day forecast](https://openweathermap.org/api/forecast5) APIs.
