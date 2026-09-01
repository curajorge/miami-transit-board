const ROUTE_ID = "71276";
const API_BASE = "/api/tracker";
const REFRESH_MS = 30_000;
const BISCAYNE_CENTER = [25.7867, -80.1948];
const BUS_STOPS = TransitEngine.busStopsForCorridor(window.MiamiBusStops?.routes);

const state = { map: null, routeLayer: null, markers: new Map(), stopMarkers: [], busStopMarkers: [], stopLayer: "all", userMarker: null, refreshing: false, vehicles: [], buses: [], stops: [], from: "place:home", to: "place:downtown", mode: "now", pickRole: null };
const ui = {
  count: document.querySelector("#trolleyCount"),
  label: document.querySelector("#statusLabel"),
  status: document.querySelector(".status-label"),
  updated: document.querySelector("#updatedText"),
  error: document.querySelector("#errorMessage"),
  loading: document.querySelector("#mapLoading"),
  refresh: document.querySelector("#refreshButton"),
  eyebrow: document.querySelector("#tripEyebrow"),
  arriveTime: document.querySelector("#arriveTime"),
  decisionKicker: document.querySelector("#decisionKicker"),
  decisionTime: document.querySelector("#decisionTime"),
  decisionAction: document.querySelector("#decisionAction"),
  decisionRoute: document.querySelector("#decisionRoute"),
  decisionArrival: document.querySelector("#decisionArrival"),
  decisionReason: document.querySelector("#decisionReason"),
  optionDetails: document.querySelector("#optionDetails"),
  swap: document.querySelector("#swapButton"),
  boardRows: document.querySelector("#boardRows"),
  pickHint: document.querySelector("#pickHint"),
  fromLabel: document.querySelector("#fromLabel"),
  fromDetail: document.querySelector("#fromDetail"),
  toLabel: document.querySelector("#toLabel"),
  toDetail: document.querySelector("#toDetail"),
  visibleStopCount: document.querySelector("#visibleStopCount"),
};

function endpointText(value) {
  if (value.startsWith("place:")) {
    const place = TransitEngine.PLACES[value.slice(6)];
    return place ? { name: place.name, detail: place.detail } : { name: "Choose on map", detail: "Tap a transit stop" };
  }
  if (value.startsWith("bus:")) {
    const [, route, direction, id] = value.split(":");
    const stop = BUS_STOPS.find((item) => item.route === route && item.direction === direction && item.id === id);
    return { name: stop?.name || "Choose a bus stop", detail: `Metrobus ${route} · ${direction}bound` };
  }
  const stop = TransitEngine.normalizeStops(state.stops).find((item) => item.id === value.replace("stop:", ""));
  return { name: stop?.name || "Choose on map", detail: stop ? `Biscayne stop ${stop.sequence}` : "Tap a transit stop" };
}

function refreshEndpointCards() {
  const from = endpointText(state.from), to = endpointText(state.to);
  ui.fromLabel.textContent = from.name; ui.fromDetail.textContent = from.detail;
  ui.toLabel.textContent = to.name; ui.toDetail.textContent = to.detail;
}

function setEndpoint(role, endpointValue) {
  const value = endpointValue.includes(":") ? endpointValue : `stop:${endpointValue}`;
  state[role] = value;
  localStorage.setItem(`transit.${role}`, value);
  refreshEndpointCards();
  renderPlan();
}

function reverseEndpoint(value) {
  if (value.startsWith("place:")) return value;
  if (value.startsWith("bus:")) {
    const [, route, direction, id] = value.split(":");
    const selected = BUS_STOPS.find((stop) => stop.route === route && stop.direction === direction && stop.id === id);
    if (!selected) return value;
    const opposite = BUS_STOPS.filter((stop) => stop.route === route && stop.direction !== direction)
      .sort((a, b) => TransitEngine.haversineMiles(selected, a) - TransitEngine.haversineMiles(selected, b))[0];
    return opposite ? `bus:${opposite.route}:${opposite.direction}:${opposite.id}` : value;
  }
  const selected = TransitEngine.normalizeStops(state.stops).find((stop) => stop.id === value.replace("stop:", ""));
  if (!selected) return value;
  const direction = selected.sequence <= 32 ? "south" : "north";
  const opposite = TransitEngine.normalizeStops(state.stops).filter((stop) => (stop.sequence <= 32 ? "south" : "north") !== direction)
    .sort((a, b) => TransitEngine.haversineMiles(selected, a) - TransitEngine.haversineMiles(selected, b))[0];
  return opposite ? `stop:${opposite.id}` : value;
}

function setPickRole(role) {
  state.pickRole = state.pickRole === role ? null : role;
  document.querySelectorAll("[data-pick-role]").forEach((button) => button.classList.toggle("active", button.dataset.pickRole === state.pickRole));
  updatePickHint(state.pickRole ? `Tap a stop to set ${state.pickRole === "from" ? "your starting point" : "your destination"}` : null);
}

function updatePickHint(message) {
  ui.pickHint.textContent = message || "Tap any stop for arrivals or trip selection";
}

const clock = (date) => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);

function renderPlan() {
  const now = new Date();
  let arriveBy;
  if (state.mode === "arrive") {
    const [hours, minutes] = (ui.arriveTime.value || "19:00").split(":").map(Number);
    arriveBy = new Date(now);
    arriveBy.setHours(hours, minutes, 0, 0);
    if (arriveBy < now) arriveBy.setDate(arriveBy.getDate() + 1);
  }
  const plan = TransitEngine.planTrip({ from: state.from, to: state.to, stops: state.stops, busStops: BUS_STOPS, mode: state.mode, arriveBy: arriveBy?.toISOString(), vehicles: state.vehicles, buses: state.buses, now });
  if (!plan) {
    ui.decisionKicker.textContent = "Choose stops in the same direction";
    ui.decisionTime.textContent = "—";
    ui.decisionAction.textContent = "";
    ui.decisionRoute.textContent = "Choose stops that support the same travel direction.";
    ui.decisionArrival.textContent = "";
    ui.decisionReason.textContent = "";
    ui.optionDetails.innerHTML = "";
    ui.boardRows.innerHTML = "";
    return;
  }
  ui.eyebrow.textContent = `${plan.best.label.toUpperCase()} · ${plan.best.boarding || plan.boarding.name}`;
  ui.decisionKicker.textContent = `Best option · ${plan.best.confidence} confidence`;
  ui.decisionTime.textContent = state.mode === "arrive" ? clock(plan.leaveAt) : plan.minutesUntilLeave <= 0 ? "Now" : `${plan.minutesUntilLeave} min`;
  ui.decisionAction.textContent = state.mode === "arrive" ? "leave by" : "time to leave";
  ui.decisionRoute.textContent = `${plan.best.label}${plan.best.vehicle ? ` ${plan.best.vehicle}` : ""} · ${plan.direction === "south" ? "↓ Southbound" : "↑ Northbound"} · ${plan.best.cost ? "$2.25" : "free"}`;
  ui.decisionArrival.textContent = `Expected at ${plan.destination.name}: ${clock(plan.arrival)} · about ${plan.best.total} min`;
  ui.decisionReason.textContent = `Walk about ${plan.walkToStop} min to ${plan.best.boarding || plan.boarding.name}. Get off at ${plan.best.alighting || plan.alighting.name}. ${plan.reason}`;
  ui.optionDetails.innerHTML = `<div class="option-line"><span><strong>${plan.best.data === "live" ? "Live trolley estimate" : plan.best.data === "live-bus" ? "Live Miami-Dade BusTime" : plan.best.data === "bus-schedule" ? "Metrobus schedule estimate" : "Published trolley headway"}</strong><small>Updated with each refresh</small></span><b>${plan.best.total} min</b></div>`;
  ui.boardRows.innerHTML = plan.options.map((option) => {
    const board = new Date(now.getTime() + option.wait * 60000);
    const arrival = new Date(board.getTime() + (option.ride + option.walkFromStop) * 60000);
    const source = option.data === "live-bus" ? "Miami-Dade BusTime" : option.data === "bus-schedule" ? "Schedule estimate" : option.data === "live" ? "Live trolley position" : "Trolley headway estimate";
    return `<div class="board-row${option === plan.best ? " best" : ""}"><span><strong>${option.label}</strong><small>${source} · ${option.cost ? "$2.25" : "free"}</small></span><b>${clock(board)}</b><b>${clock(arrival)}</b></div>`;
  }).join("");
}

async function trackerRequest(params) {
  const query = new URLSearchParams(params);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${API_BASE}?${query}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The live tracker is unavailable.");
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The live tracker took too long to respond.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function busRequest(route, direction) {
  const response = await fetch(`/api/bus?route=${encodeURIComponent(route)}&direction=${encodeURIComponent(direction)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Bus arrivals unavailable");
  return data;
}

function decodePolyline(encoded) {
  if (typeof encoded !== "string" || encoded.length > 500_000) throw new Error("Route geometry is invalid.");
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, byte;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 31) << shift; shift += 5; } while (byte >= 32);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
    if (points.length > 50_000) throw new Error("Route geometry is too large.");
  }
  return points;
}

function initMap() {
  state.map = L.map("map", { zoomControl: false }).setView(BISCAYNE_CENTER, 13);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  }).addTo(state.map);
}

async function loadRoute() {
  const data = await trackerRequest({ Key: "ROUTES_BYTKN", id: "-1", f1: "81E39EC9-D773-447E-BE29-D7F30AB177BC", f2: "", f3: "", lan: "en" });
  const routes = Array.isArray(data?.[0]) ? data[0] : [];
  const route = routes.find((item) => String(item.ID) === ROUTE_ID);
  state.stops = Array.isArray(data?.[1]) ? data[1].filter((item) => String(item.RouteID) === ROUTE_ID) : [];
  if (!route?.RoutePath) throw new Error("Biscayne route geometry is unavailable.");
  const points = decodePolyline(route.RoutePath);
  if (!points.length || points.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Error("Biscayne route geometry is invalid.");
  state.routeLayer = L.polyline(points, { color: "#2363c3", weight: 6, opacity: .9, lineCap: "round" }).addTo(state.map);
  state.map.fitBounds(state.routeLayer.getBounds(), { padding: [24, 24] });
  populateStations();
  paintStops();
}

function populateStations() {
  refreshEndpointCards();
  renderPlan();
}

function stopPopup(stop, direction, eta) {
  const content = document.createElement("div");
  const title = document.createElement("p"); title.className = "popup-title"; title.textContent = stop.name;
  const meta = document.createElement("p"); meta.className = "popup-meta"; meta.textContent = `Stop ${stop.sequence} · ${direction === "south" ? "↓ Southbound" : "↑ Northbound"}`;
  const times = document.createElement("p"); times.className = "popup-times"; times.textContent = `Next trolley estimate: ${eta.minutes} min`;
  const source = document.createElement("p"); source.className = "popup-meta"; source.textContent = eta.source === "live" ? `Based on trolley ${eta.vehicle || "position"}` : "Based on published headway";
  const actions = document.createElement("div"); actions.className = "popup-actions";
  [["from", "Use as start"], ["to", "Use as destination"]].forEach(([role, label]) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.addEventListener("click", () => { setEndpoint(role, stop.id); setPickRole(null); state.map.closePopup(); updatePickHint(`${label}: ${stop.name}`); });
    actions.appendChild(button);
  });
  content.append(title, meta, times, source, actions);
  return content;
}

function paintStops() {
  state.stopMarkers.forEach((marker) => marker.remove());
  const normalized = TransitEngine.normalizeStops(state.stops);
  state.stopMarkers = normalized.map((stop) => {
    const marker = L.marker([stop.lat, stop.lng], {
    icon: L.divIcon({ className: "", html: '<div class="stop-marker"></div>', iconSize: [32,32], iconAnchor: [16,16] }), zIndexOffset: -100,
    });
    marker.on("click", () => {
      const direction = stop.sequence <= 32 ? "south" : "north";
      const eta = TransitEngine.trolleyWait(state.vehicles, stop, direction, new Date());
      marker.bindPopup(stopPopup(stop, direction, eta)).openPopup();
    });
    return marker;
  });
  paintBusStops();
  renderStopLayer();
}

function busStopPopup(stop) {
  const content = document.createElement("div");
  const title = document.createElement("p"); title.className = "popup-title"; title.textContent = stop.name;
  const meta = document.createElement("p"); meta.className = "popup-meta"; meta.textContent = `Metrobus ${stop.route} · ${stop.direction}bound`;
  const live = state.buses.find((bus) => String(bus.route) === stop.route && String(bus.stop) === stop.id);
  const times = document.createElement("p"); times.className = "popup-times"; times.textContent = live?.minutes?.length ? `Next bus: ${live.minutes.slice(0, 2).join(" min, ")} min` : "Schedule estimate used for planning";
  const actions = document.createElement("div"); actions.className = "popup-actions";
  [["from", "Use as start"], ["to", "Use as destination"]].forEach(([role, label]) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.addEventListener("click", () => { setEndpoint(role, `bus:${stop.route}:${stop.direction}:${stop.id}`); setPickRole(null); state.map.closePopup(); updatePickHint(`${label}: Metrobus ${stop.route} · ${stop.name}`); });
    actions.appendChild(button);
  });
  content.append(title, meta, times, actions);
  return content;
}

function paintBusStops() {
  state.busStopMarkers.forEach(({ marker }) => marker.remove());
  state.busStopMarkers = BUS_STOPS.map((stop) => {
    const marker = L.marker([stop.lat, stop.lng], { icon: L.divIcon({ className: "", html: `<div class="bus-stop-marker route-${stop.route}">${stop.route}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: -80 });
    marker.on("click", () => marker.bindPopup(busStopPopup(stop)).openPopup());
    return { marker, stop };
  });
}

function renderStopLayer() {
  const showTrolley = state.stopLayer === "all" || state.stopLayer === "trolley";
  state.stopMarkers.forEach((marker) => showTrolley ? marker.addTo(state.map) : marker.remove());
  state.busStopMarkers.forEach(({ marker, stop }) => (state.stopLayer === "all" || state.stopLayer === stop.route) ? marker.addTo(state.map) : marker.remove());
  const visible = (showTrolley ? state.stopMarkers.length : 0) + state.busStopMarkers.filter(({ stop }) => state.stopLayer === "all" || state.stopLayer === stop.route).length;
  ui.visibleStopCount.textContent = `${visible} nearby stops`;
}

function trolleyIcon(name) {
  return L.divIcon({
    className: "trolley-marker",
    html: `<div class="trolley-pin"><span>${String(name || "T").replace(/[^a-z0-9]/gi, "").slice(-4)}</span></div>`,
    iconSize: [38, 38], iconAnchor: [19, 34], popupAnchor: [0, -33],
  });
}

function formatAge(timestamp) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(timestamp)));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

function updateMarkers(vehicles) {
  const active = new Set();
  vehicles.forEach((vehicle) => {
    const id = String(vehicle.ID);
    const lat = Number(vehicle.Lat), lng = Number(vehicle.Lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    active.add(id);
    let marker = state.markers.get(id);
    if (!marker) {
      marker = L.marker([lat, lng], { icon: trolleyIcon(vehicle.ShortName) }).addTo(state.map);
      state.markers.set(id, marker);
    } else marker.setLatLng([lat, lng]);
    const content = document.createElement("div");
    const title = document.createElement("p"); title.className = "popup-title"; title.textContent = `Trolley ${vehicle.ShortName || id}`;
    const meta = document.createElement("p"); meta.className = "popup-meta"; meta.textContent = `Position updated ${formatAge(vehicle.Tim)}`;
    content.append(title, meta); marker.bindPopup(content);
  });
  state.markers.forEach((marker, id) => {
    if (!active.has(id)) { marker.remove(); state.markers.delete(id); }
  });
}

async function refreshVehicles() {
  if (state.refreshing) return;
  state.refreshing = true;
  ui.refresh.disabled = true;
  ui.error.hidden = true;
  try {
    const [vehicleResult, ...busResults] = await Promise.allSettled([
      trackerRequest({ Key: "UNITS_LOCATION_ROUTE", id: ROUTE_ID, lan: "en" }),
      busRequest("3", "south"), busRequest("9", "south"), busRequest("3", "north"), busRequest("9", "north"),
    ]);
    state.buses = busResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (vehicleResult.status === "rejected") {
      renderPlan();
      throw vehicleResult.reason;
    }
    const vehicles = vehicleResult.value;
    const valid = Array.isArray(vehicles) ? vehicles : [];
    state.vehicles = valid;
    updateMarkers(valid);
    renderPlan();
    const newest = valid.reduce((max, item) => Math.max(max, Number(item.Tim) || 0), 0);
    const age = newest ? Date.now() / 1000 - newest : Infinity;
    ui.count.textContent = valid.length;
    ui.status.className = `status-label${age > 180 ? " stale" : ""}`;
    ui.label.textContent = age > 180 ? "Data may be delayed" : "Live now";
    const busNote = state.buses.length ? ` · ${state.buses.length} bus arrival points checked` : " · bus arrivals unavailable";
    ui.updated.textContent = newest ? `Newest trolley updated ${formatAge(newest)}${busNote} · refreshes every 30 sec` : `No active trolley positions reported${busNote}`;
  } catch (error) {
    ui.status.className = "status-label error";
    ui.label.textContent = "Tracker unavailable";
    ui.updated.textContent = state.buses.length ? `${state.buses.length} bus arrival points checked · showing last trolley positions` : "Showing the last positions received";
    ui.error.textContent = `${error.message} Tap Refresh to try again.`;
    ui.error.hidden = false;
  } finally {
    state.refreshing = false;
    ui.refresh.disabled = false;
    ui.loading.hidden = true;
  }
}

async function start() {
  initMap();
  paintBusStops();
  renderStopLayer();
  try { await loadRoute(); }
  catch (error) { ui.error.textContent = error.message; ui.error.hidden = false; }
  await refreshVehicles();
  window.setInterval(refreshVehicles, REFRESH_MS);
}

ui.refresh.addEventListener("click", refreshVehicles);
ui.swap.addEventListener("click", () => {
  [state.from, state.to] = [reverseEndpoint(state.to), reverseEndpoint(state.from)];
  localStorage.setItem("transit.from", state.from); localStorage.setItem("transit.to", state.to);
  refreshEndpointCards();
  renderPlan();
});
document.querySelectorAll(".time-mode").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".time-mode").forEach((item) => item.classList.toggle("active", item === button));
  state.mode = button.dataset.mode;
  ui.arriveTime.hidden = state.mode !== "arrive";
  renderPlan();
}));
ui.arriveTime.addEventListener("change", renderPlan);
document.querySelectorAll("[data-trip]").forEach((button) => button.addEventListener("click", () => {
  const trip = button.dataset.trip;
  if (trip === "home") {
    const away = state.to !== "place:home" ? state.to : state.from !== "place:home" ? state.from : "place:downtown";
    state.from = reverseEndpoint(away); state.to = "place:home";
  }
  else { state.from = "place:home"; state.to = `place:${trip}`; }
  localStorage.setItem("transit.from", state.from); localStorage.setItem("transit.to", state.to);
  refreshEndpointCards(); renderPlan();
}));
document.querySelectorAll("[data-pick-role]").forEach((button) => button.addEventListener("click", () => setPickRole(button.dataset.pickRole)));
document.querySelectorAll("[data-stop-layer]").forEach((button) => button.addEventListener("click", () => {
  state.stopLayer = button.dataset.stopLayer;
  document.querySelectorAll("[data-stop-layer]").forEach((item) => { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-pressed", String(active)); });
  renderStopLayer();
}));
const savedFrom = localStorage.getItem("transit.from"), savedTo = localStorage.getItem("transit.to");
const validSaved = (value) => value && (value.startsWith("place:") ? TransitEngine.PLACES[value.slice(6)] : value.startsWith("stop:") || (value.startsWith("bus:") && BUS_STOPS.some((stop) => value === `bus:${stop.route}:${stop.direction}:${stop.id}`)));
state.from = validSaved(savedFrom) ? savedFrom : state.from;
state.to = validSaved(savedTo) ? savedTo : state.to;
document.body.dataset.view = "board";
refreshEndpointCards();
updatePickHint();
start();
