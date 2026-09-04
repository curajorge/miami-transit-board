/* Prototype 3 owns its trip and map. Shared inputs are read-only transit feeds. */
(() => {
  const $ = (id) => document.getElementById(id);
  const trip = { from: "place:home", to: "place:downtown", preference: "soonest", selected: null, role: "to", preview: null, map: null, markers: [], opener: null };
  const mapPoints = new Map();
  let nearbyCenter = null;
  const locations = () => [...state.locations, ...mapPoints.values()];
  let busSnapshot = state.buses, busReceivedAt = Date.now();
  function currentBuses(now) {
    if (busSnapshot !== state.buses) { busSnapshot = state.buses; busReceivedAt = now.getTime(); }
    const elapsed = (now.getTime() - busReceivedAt) / 60000;
    if (elapsed > 2) return [];
    return state.buses.map((bus) => ({ ...bus, minutes: (bus.minutes || []).map((minute) => Number(minute) - elapsed).filter((minute) => minute >= 0).map(Math.ceil) }));
  }
  const time = (date) => new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
  const plus = (now, minutes) => new Date(now.getTime() + minutes * 60000);
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
  const serviceLabel = (id) => id === "trolley" ? "Trolley" : `Bus ${id.slice(4)}`;
  const serviceToken = (id) => id === "trolley" ? "T" : id.slice(4);
  const point = (value) => value.startsWith("place:") ? TransitEngine.PLACES[value.slice(6)] : locations().find((item) => `location:${item.id}` === value) || (trip.preview?.value === value ? trip.preview : null);
  const name = (value) => point(value)?.name || "Choose a place";
  const entries = () => [
    ...Object.entries(TransitEngine.PLACES).map(([key, place]) => ({ ...place, value: `place:${key}`, services: [], detail: place.detail })),
    ...state.locations.map((location) => ({ ...location, value: `location:${location.id}` })),
  ];
  const samePlace = (a, b) => a === b || (point(a) && point(b) && TransitEngine.haversineMiles(point(a), point(b)) < .025);
  function badges(services = []) { const row = el("span", "go-badges"); services.forEach((id) => row.append(el("span", `go-service ${id}`, serviceToken(id)))); return row; }
  function chooseOption(plan) {
    if (trip.selected && plan.options.some((option) => option.id === trip.selected)) return plan.options.find((option) => option.id === trip.selected);
    const feasible = plan.options.filter((option) => option.wait >= option.walkToStop + option.buffer);
    return (feasible.length ? feasible : plan.options).slice().sort((a, b) => trip.preference === "free" ? a.cost - b.cost || a.arrivalMinutes - b.arrivalMinutes : trip.preference === "walk" ? a.walkToStop + a.walkFromStop - b.walkToStop - b.walkFromStop || a.arrivalMinutes - b.arrivalMinutes : a.arrivalMinutes - b.arrivalMinutes)[0];
  }
  const evidence = (option) => option.data === "live-bus" ? "Live bus arrival" : option.data === "live" ? "Live trolley position" : "Rough estimate";
  function render() {
    $("goFrom").textContent = name(trip.from); $("goTo").textContent = name(trip.to);
    document.querySelectorAll("[data-go-place]").forEach((button) => button.setAttribute("aria-pressed", String(trip.to === `place:${button.dataset.goPlace}`)));
    document.querySelectorAll("[data-go-preference]").forEach((button) => button.setAttribute("aria-pressed", String(trip.preference === button.dataset.goPreference)));
    const now = new Date();
    const plan = TransitEngine.planTrip({ from: trip.from, to: trip.to, stops: state.stops, busStops: BUS_STOPS, locations: locations(), vehicles: state.vehicles, buses: currentBuses(now), now });
    const target = $("goJourney"); target.replaceChildren(); $("goOptions").replaceChildren();
    if (!plan || samePlace(trip.from, trip.to)) {
      target.append(el("p", "go-empty", samePlace(trip.from, trip.to) ? "You're already there. Choose a different destination to compare rides." : "No direct ride found for these places. Try a nearby stop along Biscayne."));
    } else {
      const ride = chooseOption(plan), rough = !["live", "live-bus"].includes(ride.data), tight = ride.wait < ride.walkToStop + ride.buffer;
      const ticket = el("article", "go-ticket"), head = el("div", "go-ticket-head");
      head.append(el("p", "", trip.selected ? "Your selected ride" : trip.preference === "free" ? ride.cost === 0 ? "Your free ride" : "Lowest-fare comfortable ride" : trip.preference === "walk" ? "Your shortest walk" : "Your earliest estimated arrival"));
      head.append(el("h3", "", tight ? "This ride may be tight" : rough ? `Rough trip: ~${ride.arrivalMinutes} min` : ride.leaveIn <= 0 ? "Time to head out" : `Head out in ${ride.leaveIn} min`));
      head.append(el("p", "go-ticket-service", `${ride.label} · ${plan.direction}bound`)); ticket.append(head);
      const facts = el("div", "go-ticket-facts");
      [["Estimated arrival", tight ? "Uncertain" : `~${time(plus(now, ride.arrivalMinutes))}`], ["Walking", `${ride.walkToStop + ride.walkFromStop} min`], ["Fare", ride.cost ? `$${ride.cost.toFixed(2)}` : "Free"]].forEach(([label, value]) => { const fact = el("div"); fact.append(el("span", "", label), el("strong", "", value)); facts.append(fact); });
      ticket.append(facts);
      const steps = el("ol", "go-steps");
      [[ride.leaveIn, `Walk ${ride.walkToStop} min to your stop`, ride.boarding], [ride.wait, `Board ${ride.label}`, `${ride.ride} min ride · ${ride.buffer} min boarding cushion`], [ride.wait + ride.ride, `Get off at ${ride.alighting}`, `Walk ${ride.walkFromStop} min to ${name(trip.to)}`]].forEach(([minutes, title, detail]) => { const row = el("li"), copy = el("div"); copy.append(el("strong", "", title), el("small", "", detail)); row.append(el("time", "", tight ? "—" : `${rough ? "~" : ""}${time(plus(now, minutes))}`), copy); steps.append(row); });
      ticket.append(steps, el("p", `go-estimate-note${tight ? " go-tight" : ""}`, tight ? "The predicted arrival leaves too little time to walk and board comfortably. Check another option before leaving." : rough ? "Rough timing: no live arrival for this stop. A 15-minute waiting assumption is used; check again before leaving." : `${evidence(ride)}. ${ride.data === "live" ? "Travel time is estimated from the trolley's position." : "Arrival reported for your boarding stop."} Traffic can change these times.`));
      target.append(ticket);
      plan.options.forEach((option) => {
        const button = el("button", "go-option"); button.type = "button";
        button.dataset.ride = option.id;
        button.setAttribute("aria-pressed", String(option.id === ride.id));
        const copy = el("span", "go-option-copy"); copy.append(el("strong", "", option.label), el("small", "", `${option.cost ? `$${option.cost.toFixed(2)}` : "Free"} · ${option.walkToStop + option.walkFromStop} min walk · ${evidence(option)}`));
        button.append(el("span", `go-service ${option.id}`, serviceToken(option.id)), copy, el("span", "go-option-time", option.wait < option.walkToStop + option.buffer ? "Too tight" : `~${time(plus(now, option.arrivalMinutes))}`));
        button.setAttribute("aria-label", `Select ${option.label}, ${option.wait < option.walkToStop + option.buffer ? "may be too tight to catch" : `estimated arrival ${time(plus(now, option.arrivalMinutes))}`}`);
        button.append(el("span", "go-option-select", option.id === ride.id ? "Selected" : "Select"));
        button.addEventListener("click", () => { trip.selected = option.id; render(); document.querySelector(`[data-ride="${option.id}"]`)?.focus({ preventScroll: true }); }); $("goOptions").append(button);
      });
      if (plan.options.length === 1) $("goOptions").append(el("p", "go-footnote", "Only one direct service found. Bus stops currently cover Edgewater to Downtown."));
    }
    const latest = state.vehicles.reduce((newest, vehicle) => Math.max(newest, Number(vehicle.Tim) || 0), 0);
    const trolleyAge = latest ? Math.max(0, Math.floor((now.getTime() / 1000 - latest) / 60)) : null;
    const busAge = Math.max(0, Math.floor((now.getTime() - busReceivedAt) / 60000));
    $("goFreshness").textContent = `${trolleyAge == null ? "No live trolley positions" : `Trolley positions ${trolleyAge < 1 ? "updated within a minute" : `${trolleyAge} min old`}`}. ${state.buses.length && busAge < 2 ? `Bus arrivals checked ${busAge < 1 ? "within a minute" : `${busAge} min ago`}` : "Live bus arrivals unavailable"}.`;
    $("goRefresh").disabled = state.refreshing;
  }
  function preview(entry, move = true) {
    trip.preview = entry;
    $("goPreviewName").textContent = entry.name;
    $("goPreviewServices").textContent = entry.services?.length ? entry.services.map(serviceLabel).join(" · ") : entry.detail || "Familiar place";
    const equal = samePlace(entry.value, trip[trip.role === "to" ? "from" : "to"]);
    $("goConfirm").disabled = equal;
    $("goConfirm").textContent = equal ? "Choose a different place" : `Set ${trip.role === "from" ? "starting point" : "destination"}`;
    document.querySelectorAll(".go-place").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === entry.value)));
    trip.markers.forEach(({ marker, entry: item }) => { const selected = item.value === entry.value; marker.setZIndexOffset(selected ? 1000 : 0); marker.getElement()?.classList.toggle("go-selected", selected); });
    trip.pointMarker?.remove();
    if (entry.id?.startsWith("go-map-") && trip.map) trip.pointMarker = L.circleMarker([entry.lat, entry.lng], { radius: 9, color: "white", weight: 3, fillColor: "#007a72", fillOpacity: 1 }).addTo(trip.map);
    if (move) trip.map?.setView([entry.lat, entry.lng], Math.max(15, trip.map.getZoom()), { animate: false });
  }
  function renderList() {
    const query = $("goSearch").value.trim().toLowerCase();
    let choices = entries().filter((entry) => `${entry.name} ${entry.detail || ""} ${(entry.services || []).map(serviceLabel).join(" ")}`.toLowerCase().includes(query));
    if (nearbyCenter && !query) choices = choices.filter((entry) => entry.services.length).map((entry) => ({ ...entry, distance: TransitEngine.haversineMiles(nearbyCenter, entry) })).filter((entry) => entry.distance <= .5).sort((a, b) => a.distance - b.distance).slice(0, 8);
    $("goPlaceList").replaceChildren();
    choices.forEach((entry) => { const button = el("button", "go-place"); button.type = "button"; button.dataset.value = entry.value; button.setAttribute("aria-pressed", String(trip.preview?.value === entry.value)); const copy = el("span"); copy.append(el("strong", "", entry.name), el("small", "", entry.distance != null ? `${entry.distance.toFixed(2)} mi from map point · ~${Math.max(1, Math.ceil(entry.distance / 3.1 * 60))} min walk*` : entry.detail || "Transit stop")); button.append(copy, badges(entry.services)); button.addEventListener("click", () => preview(entry)); $("goPlaceList").append(button); });
    if (!choices.length) $("goPlaceList").append(el("p", "go-empty", nearbyCenter && !query ? "No stops within half a mile. Move the map toward Biscayne, then try Nearby stops again." : "No matching stops. Try a street number, Downtown, or Bus 3."));
  }
  function assignRole(role) {
    trip.role = role;
    $("goChooserTitle").textContent = role === "from" ? "Where are you leaving from?" : "Where are you going?";
    $("goPreviewLabel").textContent = role === "from" ? "Starting point preview" : "Destination preview";
    document.querySelectorAll("[data-go-assign]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.goAssign === role)));
    if (trip.preview) preview(trip.preview, false);
  }
  function nearby() {
    // Freeze any keyboard/inertial pan before reading the point under the crosshair.
    trip.map.stop();
    const center = trip.map.getCenter();
    nearbyCenter = { lat: center.lat, lng: center.lng };
    $("goSearch").value = "";
    $("goMapHint").textContent = "Nearest stops to this map point. *Walking is a straight-line estimate.";
    renderList(); $("goPlaceList").scrollTop = 0;
    return state.locations.map((entry) => ({ ...entry, distance: TransitEngine.haversineMiles(nearbyCenter, entry) })).sort((a, b) => a.distance - b.distance)[0];
  }
  function openChooser(role, opener) {
    trip.role = role; trip.opener = opener; $("goChooserTitle").textContent = role === "from" ? "Where are you leaving from?" : "Where are you going?"; $("goPreviewLabel").textContent = role === "from" ? "Starting point preview" : "Destination preview";
    nearbyCenter = null; trip.preview = null; assignRole(role);
    $("goMapHint").textContent = "Move the map under the crosshair, or tap a stop.";
    $("goSearch").value = ""; $("goChooser").showModal();
    if (!trip.map) {
      trip.map = L.map("goMap", { zoomControl: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([25.79, -80.19], 14);
      L.control.zoom({ position: "bottomright" }).addTo(trip.map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(trip.map);
    }
    trip.markers.forEach(({ marker }) => marker.remove());
    trip.markers = entries().map((entry) => {
      const tokens = entry.services?.length ? entry.services.map(serviceToken) : ["P"];
      const marker = L.marker([entry.lat, entry.lng], { title: `${entry.name}: ${entry.services?.map(serviceLabel).join(", ") || entry.detail}`, alt: `Preview ${entry.name}`, icon: L.divIcon({ className: "go-marker", html: `<div class="go-map-pin">${tokens.map((token) => `<b>${token}</b>`).join("")}</div>`, iconSize: [tokens.length * 19 + 12, 30], iconAnchor: [(tokens.length * 19 + 12) / 2, 15] }) }).addTo(trip.map);
      marker.getElement()?.setAttribute("aria-label", `Preview ${entry.name}, ${entry.services?.map(serviceLabel).join(", ") || entry.detail}`);
      marker.on("click", () => preview(entry, false)); return { marker, entry };
    });
    renderList();
    requestAnimationFrame(() => { trip.map.invalidateSize(); const current = entries().find((entry) => entry.value === trip[role]) || point(trip[role]); if (current) preview({ ...current, value: trip[role] }); });
    $("goClose").focus();
  }
  document.querySelectorAll("[data-go-role]").forEach((button) => button.addEventListener("click", () => openChooser(button.dataset.goRole, button)));
  document.querySelectorAll("[data-go-place]").forEach((button) => button.addEventListener("click", () => { openChooser("to", button); preview(entries().find((entry) => entry.value === `place:${button.dataset.goPlace}`)); requestAnimationFrame(() => preview(entries().find((entry) => entry.value === `place:${button.dataset.goPlace}`))); }));
  document.querySelectorAll("[data-go-preference]").forEach((button) => button.addEventListener("click", () => { trip.preference = button.dataset.goPreference; trip.selected = null; render(); }));
  $("goSwap").addEventListener("click", () => { [trip.from, trip.to] = [trip.to, trip.from]; trip.selected = null; render(); });
  $("goMapOpen").addEventListener("click", () => openChooser("to", $("goMapOpen")));
  $("goSearch").addEventListener("input", renderList);
  document.querySelectorAll("[data-go-assign]").forEach((button) => button.addEventListener("click", () => assignRole(button.dataset.goAssign)));
  $("goNearby").addEventListener("click", nearby);
  $("goUsePoint").addEventListener("click", () => {
    const closest = nearby();
    if (!closest || closest.distance > .5) {
      trip.preview = null; $("goConfirm").disabled = true;
      $("goPreviewName").textContent = "Outside the transit corridor";
      $("goPreviewServices").textContent = "Move closer to the available stops.";
      return;
    }
    const id = `go-map-${nearbyCenter.lat.toFixed(6)}-${nearbyCenter.lng.toFixed(6)}`;
    preview({ ...nearbyCenter, id, value: `location:${id}`, name: `Near ${closest.name}`, services: [], detail: "Chosen map point · walks estimated to nearby boarding stops" }, false);
  });
  $("goClose").addEventListener("click", () => $("goChooser").close());
  $("goChooser").addEventListener("close", () => trip.opener?.focus());
  $("goConfirm").addEventListener("click", () => { if (!trip.preview || $("goConfirm").disabled) return; if (trip.preview.id?.startsWith("go-map-")) mapPoints.set(trip.preview.id, { ...trip.preview }); trip[trip.role] = trip.preview.value; for (const [id] of mapPoints) if (![trip.from, trip.to].includes(`location:${id}`)) mapPoints.delete(id); trip.selected = null; $("goChooser").close(); render(); });
  $("goRefresh").addEventListener("click", async () => { $("goRefresh").disabled = true; await refreshVehicles(); render(); });
  window.addEventListener("transit-data", () => { currentBuses(new Date()); if (state.view === "go") render(); });
  window.setInterval(() => { if (state.view === "go" && !$("goChooser").open) render(); }, 15000);
  window.TransitGo = { enter: render };
  if (state.view === "go") render();
})();
