const API_KEY = (window.OPENWEATHER_API_KEY || '').trim();
const STORAGE = { favorites: 'atmos-favorites-v1', unit: 'atmos-unit-v1' };
const $ = (selector) => document.querySelector(selector);
const weatherContent = $('#weather-content');
const searchInput = $('#search-input');
const searchResults = $('#search-results');
let currentWeather = null;
let favorites = readStorage(STORAGE.favorites, []);
let unit = localStorage.getItem(STORAGE.unit) || 'metric';
let searchTimer;
let toastTimer;
let requestNumber = 0;

function readStorage(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
function setStatus(text, ok = true) { $('#api-status-text').textContent = text; $('.status-dot').style.background = ok ? 'var(--accent)' : 'var(--warm)'; }
function showToast(text) { const toast = $('#toast'); toast.textContent = text; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2400); }
function setTheme(offsetSeconds = 0) {
  const now = new Date(Date.now() + offsetSeconds * 1000);
  const hour = now.getUTCHours();
  const isDay = hour >= 6 && hour < 18;
  document.body.classList.toggle('light', isDay);
  document.querySelector('meta[name="theme-color"]').content = isDay ? '#f2f3ee' : '#0d1721';
  return { hour, isDay, now };
}
function setWeatherAtmosphere(weather, temperature) {
  const code = weather?.id ?? 800;
  const tempC = unit === 'metric' ? temperature : (temperature - 32) * 5 / 9;
  const scene = tempC >= 40 ? 'heat'
    : code >= 200 && code < 300 ? 'storm'
    : code >= 300 && code < 600 ? 'rain'
    : code >= 600 && code < 700 ? 'snow'
    : code >= 700 && code < 800 ? 'mist'
    : tempC >= 35 ? 'heat'
    : code === 800 ? 'sun'
    : 'clouds';
  document.body.dataset.scene = scene;
  document.body.classList.toggle('severe-heat', tempC >= 40);
}
function localTimeString(timestamp, offset) {
  const date = new Date((timestamp + offset) * 1000);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}
function localDateString(timestamp, offset) {
  const date = new Date((timestamp + offset) * 1000);
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}
function labelForPlace(place) { return [place.name, place.state, place.country].filter(Boolean).join(', '); }
function setUnitDisplay() { document.querySelectorAll('.unit-option').forEach((option) => option.classList.toggle('selected', option.dataset.unit === unit)); }

async function api(path, params = {}) {
  const url = new URL(`https://api.openweathermap.org${path}`);
  Object.entries({ ...params, appid: API_KEY }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Weather service returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
async function weatherAt(lat, lon) {
  const [weather, forecast] = await Promise.all([
    api('/data/2.5/weather', { lat, lon, units: unit }),
    api('/data/2.5/forecast', { lat, lon, units: unit })
  ]);
  return { weather, forecast };
}
function apiMessage(error) {
  if (!API_KEY) return 'Add an OpenWeatherMap API key to enable live weather.';
  if (error.status === 401) return 'That API key is not active yet. Check the key and try again.';
  if (error.status === 404) return 'We couldn’t find that place. Try another city name.';
  if (error.status === 429) return 'The weather service is busy. Please try again shortly.';
  return error.message || 'Please check your connection and try again.';
}
function renderError(message, setup = false) {
  setStatus(setup ? 'API key required' : 'Connection issue', false);
  weatherContent.innerHTML = `<div class="error-card"><div class="error-mark">☼</div><h2>${setup ? 'Your weather is waiting.' : 'We hit a little weather.'}</h2><p>${escapeHtml(message)}</p>${setup ? '<div class="setup-note">1. Create a free key at openweathermap.org<br>2. Copy <strong>config.example.js</strong> to <strong>config.js</strong> and add your key<br>3. Reload to see your live forecast</div>' : '<button class="retry-button" id="retry-button">Try again</button>'}</div>`;
  $('#retry-button')?.addEventListener('click', () => currentWeather ? loadCoordinates(currentWeather.coord.lat, currentWeather.coord.lon) : loadDefault());
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function symbolFor(code) {
  if (code >= 200 && code < 600) return { char: '☂', className: 'rainy' };
  if (code >= 600 && code < 700) return { char: '❄', className: 'cloudy' };
  if (code >= 700 && code < 800) return { char: '≋', className: 'cloudy' };
  if (code === 800) return { char: '☀', className: '' };
  return { char: '☁', className: 'cloudy' };
}
function renderWeather({ weather, forecast }) {
  currentWeather = weather;
  const { name, sys, main, wind, clouds, visibility, weather: conditions, timezone, coord, dt } = weather;
  const condition = conditions[0] || { description: 'clear skies', id: 800 };
  const local = setTheme(timezone);
  setWeatherAtmosphere(condition, main.temp);
  $('#current-date').textContent = localDateString(dt, timezone).toUpperCase();
  $('#breadcrumb-city').textContent = name.toUpperCase();
  const location = { name, country: sys.country, lat: coord.lat, lon: coord.lon };
  const icon = symbolFor(condition.id);
  const dayForecast = [];
  const seen = new Set();
  forecast.list.forEach((item) => {
    const date = new Date((item.dt + timezone) * 1000);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    if (seen.has(key) || key === `${new Date((dt + timezone) * 1000).getUTCFullYear()}-${new Date((dt + timezone) * 1000).getUTCMonth()}-${new Date((dt + timezone) * 1000).getUTCDate()}`) return;
    seen.add(key);
    const dayItems = forecast.list.filter((entry) => { const d = new Date((entry.dt + timezone) * 1000); return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}` === key; });
    const mid = dayItems.reduce((best, item) => Math.abs(new Date((item.dt + timezone) * 1000).getUTCHours() - 12) < Math.abs(new Date((best.dt + timezone) * 1000).getUTCHours() - 12) ? item : best, dayItems[0]);
    dayForecast.push(mid);
  });
  const speedUnit = unit === 'metric' ? 'm/s' : 'mph';
  const tempUnit = unit === 'metric' ? '°C' : '°F';
  const sunrise = localTimeString(sys.sunrise, timezone);
  const sunset = localTimeString(sys.sunset, timezone);
  const cityTime = localTimeString(Math.floor(Date.now() / 1000), timezone);
  const localPeriod = local.hour >= 6 && local.hour < 18 ? 'DAYLIGHT' : 'AFTER DARK';
  const rain = weather.rain?.['1h'] ?? weather.rain?.['3h'] ?? 0;
  weatherContent.innerHTML = `
    <section class="hero-card">
      <div class="hero-left">
        <div class="location-line"><span class="location-mark">⌖</span>${escapeHtml(name)}, ${escapeHtml(sys.country)}</div>
        <span class="location-region">${coord.lat.toFixed(2)}° ${coord.lat >= 0 ? 'N' : 'S'} &nbsp; ${Math.abs(coord.lon).toFixed(2)}° ${coord.lon >= 0 ? 'E' : 'W'}</span>
        <div class="condition-label">${escapeHtml(condition.description)}</div>
        <div class="temperature-row"><span class="temperature">${Math.round(main.temp)}</span><span class="temperature-symbol">${tempUnit}</span></div>
        <div class="feels-like">Feels like ${Math.round(main.feels_like)}${tempUnit} <span>·</span> H:${Math.round(main.temp_max)}° L:${Math.round(main.temp_min)}°</div>
      </div>
      <div class="hero-right"><div class="weather-illustration ${icon.className}"><div class="sun-glow"></div><div class="cloud-shape"></div></div><div class="hero-local-time"><strong>${cityTime}</strong> &nbsp;LOCAL TIME</div></div>
      <div class="weather-footer"><span>LIVE CONDITIONS &nbsp;·&nbsp; UPDATED ${localTimeString(dt, timezone)} LOCAL</span><span class="auto-mode"><span>${local.isDay ? '☼' : '☾'}</span> AUTO ${localPeriod} MODE</span></div>
    </section>
    <div class="data-grid">
      <section class="panel conditions-panel"><div class="panel-heading"><div><div class="panel-title">At a glance</div><div class="panel-subtitle">The details that make the difference.</div></div><span class="panel-tag">RIGHT NOW</span></div>
        <div class="conditions-grid">
          <div class="condition-cell"><span class="condition-symbol">◉</span><div><div class="detail-label">FEELS LIKE</div><div class="detail-value">${Math.round(main.feels_like)}${tempUnit}</div></div></div>
          <div class="condition-cell"><span class="condition-symbol">≋</span><div><div class="detail-label">WIND</div><div class="detail-value">${Math.round(wind.speed)} ${speedUnit} <span class="wind-direction">↗ ${wind.deg ?? '—'}°</span></div></div></div>
          <div class="condition-cell"><span class="condition-symbol">◌</span><div><div class="detail-label">HUMIDITY</div><div class="detail-value">${main.humidity}<span style="font-size:10px">%</span></div></div></div>
          <div class="condition-cell"><span class="condition-symbol">⌁</span><div><div class="detail-label">VISIBILITY</div><div class="detail-value">${visibility == null ? '—' : (visibility / 1000).toFixed(1)} <span style="font-size:10px">km</span></div></div></div>
          <div class="condition-cell"><span class="condition-symbol">▱</span><div><div class="detail-label">PRESSURE</div><div class="detail-value">${main.pressure} <span style="font-size:10px">hPa</span></div></div></div>
          <div class="condition-cell"><span class="condition-symbol">☂</span><div><div class="detail-label">PRECIPITATION</div><div class="detail-value">${rain} <span style="font-size:10px">mm</span></div></div></div>
        </div>
      </section>
      <section class="panel sun-panel"><div class="panel-heading"><div><div class="panel-title">Sunrise & sunset</div><div class="panel-subtitle">A little rhythm for your day.</div></div><span class="panel-tag">${localPeriod}</span></div><div class="sun-times"><div class="sun-time"><div class="sun-time-icon">↗</div><div><div class="sun-caption">SUNRISE</div><div class="sun-value">${sunrise}</div></div></div><div class="sun-time"><div class="sun-time-icon moon">↘</div><div><div class="sun-caption">SUNSET</div><div class="sun-value">${sunset}</div></div></div></div><div class="sun-arc"><span class="sun-arc-line"></span></div></section>
    </div>
    <section class="panel forecast-panel"><div class="panel-heading"><div><div class="panel-title">The days ahead</div><div class="panel-subtitle">Your next five days, at a glance.</div></div><span class="panel-tag">5-DAY FORECAST</span></div><div class="forecast-list">${dayForecast.slice(0, 5).map((item) => { const itemDate = new Date((item.dt + timezone) * 1000); const itemIcon = symbolFor(item.weather[0].id); const label = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(itemDate); return `<div class="forecast-day"><div class="forecast-date">${label.toUpperCase()}</div><div class="forecast-icon ${itemIcon.className}">${itemIcon.char}</div><div class="forecast-temps"><span>${Math.round(item.main.temp_max)}°</span><span>${Math.round(item.main.temp_min)}°</span></div><div class="forecast-desc">${escapeHtml(item.weather[0].description)}</div></div>`; }).join('')}</div></section>`;
  $('#last-updated').innerHTML = `LIVE CONDITIONS <i>●</i> ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  setStatus('Live weather connected');
  renderFavorites(location);
}

async function loadCoordinates(lat, lon) {
  const id = ++requestNumber;
  weatherContent.innerHTML = '<div class="loading-state"><div class="loading-orbit"></div><span>Finding your forecast...</span></div>';
  setStatus('Loading live conditions');
  try { const result = await weatherAt(lat, lon); if (id === requestNumber) renderWeather(result); }
  catch (error) { if (id === requestNumber) renderError(apiMessage(error), !API_KEY); }
}
async function loadDefault() {
  const last = readStorage('atmos-last-location-v1', null);
  if (last?.lat && last?.lon) return loadCoordinates(last.lat, last.lon);
  return loadCoordinates(40.7128, -74.006);
}
async function searchPlaces(query) {
  if (!query.trim()) { searchResults.classList.remove('show'); return; }
  try {
    const places = await api('/geo/1.0/direct', { q: query.trim(), limit: 5 });
    if (!places.length) { searchResults.innerHTML = '<div class="search-result">No places found</div>'; searchResults.classList.add('show'); return; }
    searchResults.innerHTML = places.map((place, index) => `<button class="search-result" data-index="${index}" role="option"><span>${escapeHtml(place.name)}${place.state ? `, ${escapeHtml(place.state)}` : ''}</span><small>${escapeHtml(place.country)}</small></button>`).join('');
    searchResults.classList.add('show');
    searchResults.querySelectorAll('.search-result[data-index]').forEach((button) => button.addEventListener('click', () => {
      const place = places[Number(button.dataset.index)];
      $('#breadcrumb-city').textContent = place.name.toUpperCase();
      localStorage.setItem('atmos-last-location-v1', JSON.stringify({ lat: place.lat, lon: place.lon }));
      searchInput.value = ''; searchResults.classList.remove('show'); loadCoordinates(place.lat, place.lon);
    }));
  } catch (error) { searchResults.innerHTML = `<div class="search-result">${escapeHtml(apiMessage(error))}</div>`; searchResults.classList.add('show'); }
}
function renderFavorites(activePlace = currentWeather ? { name: currentWeather.name, country: currentWeather.sys.country, lat: currentWeather.coord.lat, lon: currentWeather.coord.lon } : null) {
  const list = $('#favorite-list');
  if (!favorites.length) { list.innerHTML = '<div class="empty-favorites">Your favorite places will live here.</div>'; return; }
  list.innerHTML = favorites.map((place, index) => `<button class="favorite-item ${activePlace && Math.abs(activePlace.lat - place.lat) < .01 && Math.abs(activePlace.lon - place.lon) < .01 ? 'current' : ''}" data-index="${index}" title="${escapeHtml(labelForPlace(place))}"><span class="favorite-pin"></span><span>${escapeHtml(place.name)}</span><span class="favorite-country">${escapeHtml(place.country || '')}</span></button>`).join('');
  list.querySelectorAll('.favorite-item').forEach((button) => button.addEventListener('click', () => {
    const place = favorites[Number(button.dataset.index)];
    localStorage.setItem('atmos-last-location-v1', JSON.stringify({ lat: place.lat, lon: place.lon }));
    $('#breadcrumb-city').textContent = place.name.toUpperCase(); loadCoordinates(place.lat, place.lon);
  }));
}
function saveFavorite() {
  if (!currentWeather) return showToast('Search a place first to save it.');
  const { name, coord, sys } = currentWeather;
  const duplicate = favorites.some((place) => Math.abs(place.lat - coord.lat) < .01 && Math.abs(place.lon - coord.lon) < .01);
  if (duplicate) { favorites = favorites.filter((place) => Math.abs(place.lat - coord.lat) >= .01 || Math.abs(place.lon - coord.lon) >= .01); showToast(`${name} removed from saved places.`); }
  else { favorites.unshift({ name, country: sys.country, lat: coord.lat, lon: coord.lon }); favorites = favorites.slice(0, 8); showToast(`${name} added to saved places.`); }
  localStorage.setItem(STORAGE.favorites, JSON.stringify(favorites)); renderFavorites();
}
function locateMe() {
  if (!navigator.geolocation) return showToast('Location is not available in this browser.');
  const button = $('#locate-button'); button.disabled = true; button.style.opacity = '.55';
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude } = position.coords;
    localStorage.setItem('atmos-last-location-v1', JSON.stringify({ lat: latitude, lon: longitude }));
    button.disabled = false; button.style.opacity = '1'; loadCoordinates(latitude, longitude);
  }, (error) => {
    button.disabled = false; button.style.opacity = '1';
    showToast(error.code === error.PERMISSION_DENIED ? 'Allow location access in your browser settings.' : 'Could not get your location. Try searching instead.');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchPlaces(searchInput.value), 280); });
searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { const first = searchResults.querySelector('.search-result[data-index]'); if (first) first.click(); else { clearTimeout(searchTimer); searchPlaces(searchInput.value); } } if (event.key === 'Escape') searchResults.classList.remove('show'); });
document.addEventListener('click', (event) => { if (!event.target.closest('.search-wrap')) searchResults.classList.remove('show'); });
$('#locate-button').addEventListener('click', locateMe);
$('#add-favorite').addEventListener('click', saveFavorite);
$('#home-nav').addEventListener('click', () => loadDefault());
$('#unit-toggle').addEventListener('click', () => { unit = unit === 'metric' ? 'imperial' : 'metric'; localStorage.setItem(STORAGE.unit, unit); setUnitDisplay(); if (currentWeather) loadCoordinates(currentWeather.coord.lat, currentWeather.coord.lon); });
setUnitDisplay(); renderFavorites();
if (!API_KEY) renderError('Add an OpenWeatherMap API key to enable live weather.', true);
else loadDefault();
