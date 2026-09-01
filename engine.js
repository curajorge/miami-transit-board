(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  else root.TransitEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PLACES = {
    home: { name: "Whole Foods", detail: "Edgewater", lat: 25.8043, lng: -80.1917, south: "920851", north: "921033" },
    downtown: { name: "Downtown", detail: "Bayfront", lat: 25.7732, lng: -80.1875, south: "920869", north: "921016" },
    brickell: { name: "Brickell", detail: "Metromover", lat: 25.7633, lng: -80.1930, south: "920876", north: "921010" },
  };
  const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
  const roundMinute = (date) => new Date(Math.round(date.getTime() / 60000) * 60000);

  function haversineMiles(a, b) {
    const rad = (n) => n * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function normalizeStops(rawStops) {
    return rawStops.map((stop) => {
      const match = String(stop.StopNumber || "").match(/^(\d+)/);
      return { id: String(stop.ID), name: stop.Name, label: stop.StopNumber || stop.Name, lat: Number(stop.Latitude), lng: Number(stop.Longitude), sequence: match ? Number(match[1]) : 0 };
    }).filter((stop) => stop.id && stop.sequence && Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && Math.abs(stop.lat) <= 90 && Math.abs(stop.lng) <= 180);
  }
  function busPoint(value, busStops) {
    if (!value.startsWith("bus:")) return null;
    const [, route, direction, id] = value.split(":");
    return busStops.find((stop) => stop.route === route && stop.direction === direction && stop.id === id) || null;
  }
  function basePoint(value, stops, busStops = []) {
    if (value.startsWith("place:")) return PLACES[value.slice(6)];
    if (value.startsWith("bus:")) return busPoint(value, busStops);
    return stops.find((item) => item.id === value.replace("stop:", ""));
  }
  function nearestStop(point, stops) {
    return stops.slice().sort((a, b) => haversineMiles(point, a) - haversineMiles(point, b))[0];
  }
  function busStopsForCorridor(routeGroups, start = PLACES.home, end = PLACES.downtown) {
    const groups = Array.isArray(routeGroups) ? routeGroups : Object.values(routeGroups || {});
    return groups.flatMap((group) => {
      const stops = Array.isArray(group?.stops) ? group.stops.filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) && Number.isFinite(stop.sequence)) : [];
      if (!stops.length) return [];
      const first = nearestStop(start, stops), last = nearestStop(end, stops);
      const low = Math.min(first.sequence, last.sequence), high = Math.max(first.sequence, last.sequence);
      return stops.filter((stop) => stop.sequence >= low && stop.sequence <= high).map((stop) => ({ ...stop, route: String(group.route), direction: String(group.direction) }));
    });
  }
  function endpoint(value, stops, direction, busStops = []) {
    if (value.startsWith("place:")) {
      const key = value.slice(6), place = PLACES[key], stop = stops.find((item) => item.id === place[direction]);
      return { ...place, key, value, stop, displayName: place.name };
    }
    if (value.startsWith("bus:")) {
      const selected = busPoint(value, busStops), stop = nearestStop(selected, stops.filter((item) => stopDirection(item) === direction));
      return { ...selected, stop, value, displayName: selected?.name || "Selected bus stop" };
    }
    const stop = stops.find((item) => item.id === value.replace("stop:", ""));
    return { name: stop?.name || "Selected stop", detail: stop?.label || "", lat: stop?.lat, lng: stop?.lng, stop, value, displayName: stop?.name || "Selected stop" };
  }
  const stopDirection = (stop) => stop.sequence <= 32 ? "south" : "north";
  function trolleyWait(vehicles, origin, direction, now) {
    const headingMatches = direction === "south" ? (h) => h >= 110 && h <= 250 : (h) => h <= 70 || h >= 290;
    const candidates = vehicles.map((vehicle) => {
      const point = { lat: Number(vehicle.Lat), lng: Number(vehicle.Lng) }, age = now.getTime() / 1000 - Number(vehicle.Tim), distance = haversineMiles(point, origin) * 1.25;
      const correctSide = direction === "south" ? point.lat >= origin.lat - .002 : point.lat <= origin.lat + .002;
      return { vehicle, distance, valid: age < 240 && distance < 4.5 && correctSide && headingMatches(Number(vehicle.Hea)) };
    }).filter((item) => item.valid).sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return { minutes: 15, source: "scheduled", vehicle: null, confidence: "Fair" };
    const closest = candidates[0];
    return { minutes: Math.max(2, Math.min(25, Math.round(closest.distance / 11 * 60))), source: "live", vehicle: closest.vehicle.ShortName || closest.vehicle.ID, confidence: closest.distance < 1.5 ? "Good" : "Fair" };
  }
  function planTrip({ from = "place:home", to = "place:downtown", stops = [], busStops = [], mode = "now", arriveBy, vehicles = [], buses = [], now = new Date() }) {
    const normalized = normalizeStops(stops), fromPoint = basePoint(from, normalized, busStops), toPoint = basePoint(to, normalized, busStops);
    if (!fromPoint || !toPoint || from === to) return null;
    const fromStop = from.startsWith("stop:") ? fromPoint : null, toStop = to.startsWith("stop:") ? toPoint : null;
    const fromBus = busPoint(from, busStops), toBus = busPoint(to, busStops);
    if (fromStop && toStop && stopDirection(fromStop) !== stopDirection(toStop)) return null;
    if (fromBus && toBus && fromBus.direction !== toBus.direction) return null;
    const direction = fromBus?.direction || toBus?.direction || (fromStop ? stopDirection(fromStop) : toStop ? stopDirection(toStop) : toPoint.lat < fromPoint.lat ? "south" : "north");
    const origin = endpoint(from, normalized, direction, busStops), destination = endpoint(to, normalized, direction, busStops);
    let live = null;
    const options = [];
    if (origin.stop && destination.stop) {
      const stopCount = destination.stop.sequence - origin.stop.sequence;
      if (stopCount > 0) {
        const rideMinutes = Math.max(3, Math.round(stopCount * 1.18));
        live = trolleyWait(vehicles, origin.stop, direction, now);
        const walkToStop = from.startsWith("place:") ? 3 : 1, walkFromStop = to.startsWith("place:") ? 4 : 1;
        const safety = live.source === "live" ? 2 : 4;
        const leaveIn = Math.max(0, live.minutes - walkToStop - safety);
        const tripAfterLeaving = walkToStop + Math.max(safety, live.minutes - leaveIn) + rideMinutes + walkFromStop;
        options.push({ id: "trolley", label: "Biscayne trolley", wait: live.minutes, ride: rideMinutes, walkToStop, walkFromStop, buffer: safety, cost: 0, data: live.source, vehicle: live.vehicle, confidence: live.confidence, total: tripAfterLeaving, arrivalMinutes: live.minutes + rideMinutes + walkFromStop, boarding: origin.stop.name, alighting: destination.stop.name });
      }
    }
    const selectedBusRoutes = [...new Set([fromBus?.route, toBus?.route].filter(Boolean))];
    const commonDowntownTrip = (from === "place:home" && to === "place:downtown" && direction === "south") || (from === "place:downtown" && to === "place:home" && direction === "north");
    const eligibleRoutes = selectedBusRoutes.length ? selectedBusRoutes : (commonDowntownTrip ? ["3", "9"] : []);
    if (mode === "now") {
      eligibleRoutes.forEach((route) => {
        const routeStops = busStops.filter((stop) => stop.route === route && stop.direction === direction);
        const busOrigin = fromBus?.route === route ? fromBus : nearestStop(fromPoint, routeStops);
        const busDestination = toBus?.route === route ? toBus : nearestStop(toPoint, routeStops);
        if (!busOrigin || !busDestination || busDestination.sequence <= busOrigin.sequence) return;
        const liveBus = buses.find((bus) => String(bus.route) === route && String(bus.stop) === busOrigin.id);
        const liveWait = Number(liveBus?.minutes?.[0]), wait = Number.isFinite(liveWait) ? liveWait : 15;
        const busWalk = from.startsWith("place:") ? Math.max(2, Math.round(haversineMiles(fromPoint, busOrigin) / 3.1 * 60)) : 1;
        const walkAfter = to.startsWith("place:") ? Math.max(2, Math.round(haversineMiles(busDestination, toPoint) / 3.1 * 60)) : 1;
        const busRide = Math.max(5, Math.round((busDestination.sequence - busOrigin.sequence) * 1.05)), busBuffer = Number.isFinite(liveWait) ? 2 : 4;
        const busLeaveIn = Math.max(0, wait - busWalk - busBuffer);
        options.push({ id: `bus-${route}`, label: `Metrobus ${route}`, wait, ride: busRide, walkToStop: busWalk, walkFromStop: walkAfter, buffer: busBuffer, cost: 2.25, data: Number.isFinite(liveWait) ? "live-bus" : "bus-schedule", confidence: Number.isFinite(liveWait) ? "Good" : "Fair", total: busWalk + Math.max(busBuffer, wait - busLeaveIn) + busRide + walkAfter, arrivalMinutes: wait + busRide + walkAfter, boarding: busOrigin.name, alighting: busDestination.name, leaveIn: busLeaveIn });
      });
    }
    if (!options.length) return null;
    options.forEach((option) => { if (option.leaveIn == null) option.leaveIn = Math.max(0, option.wait - option.walkToStop - option.buffer); });
    options.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes || a.cost - b.cost);
    const best = options[0], bestDuration = best.total;
    const leaveAt = mode === "arrive" && arriveBy ? addMinutes(new Date(arriveBy), -bestDuration) : addMinutes(roundMinute(now), best.leaveIn);
    const arrival = mode === "arrive" && arriveBy ? new Date(arriveBy) : addMinutes(now, best.wait + best.ride + best.walkFromStop);
    const bestReason = best.id === "trolley" ? `${live.source === "live" ? `Trolley ${live.vehicle} is approaching` : "Using the Biscayne route's published headway"}.` : best.data === "live-bus" ? `Miami-Dade BusTime reports Route ${best.id.slice(4)} approaching.` : `Using the published schedule estimate for Route ${best.id.slice(4)}.`;
    return { origin, destination, direction, mode, leaveAt, arrival, best, options, boarding: origin.stop, alighting: destination.stop, walkToStop: best.walkToStop, nextTrolleyMinutes: live?.minutes ?? null,
      reason: `${bestReason} Leave time includes a ${best.buffer}-minute boarding cushion.`,
      minutesUntilLeave: Math.max(0, Math.round((leaveAt - now) / 60000)) };
  }
  return { PLACES, normalizeStops, busStopsForCorridor, haversineMiles, trolleyWait, planTrip };
});
