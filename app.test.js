const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const TransitEngine = require("./engine");

async function boot(fetch) {
  const context = vm.createContext({ TransitEngine, fetch, AbortController, URLSearchParams, Event,
    document: { hidden: false, addEventListener() {} },
    window: { setTimeout, clearTimeout, setInterval() {}, dispatchEvent() {} },
  });
  for (const file of ["bus-stops.js", "trolley-stops.js", "app.js"]) vm.runInContext(fs.readFileSync(file, "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  return context;
}
test("standalone startup works without legacy DOM and with every feed offline", async () => {
  const context = await boot(async () => { throw new Error("offline"); });
  const state = vm.runInContext("state", context);
  assert.equal(state.refreshing, false);
  assert.equal(state.stops.length, 60);
  assert.ok(state.locations.some(location => location.services.includes("bus-3")));
  assert.ok(state.locations.some(location => location.services.includes("trolley")));
  assert.match(state.lastError, /unavailable/);
  assert.equal(state.trolleyStatus, "unavailable");
  assert.equal(state.trolleyCheckedAt, null);
});
test("malformed positions and arrival minutes cannot poison the planner", async () => {
  const context = await boot(async url => ({ ok: true, json: async () => url.includes("/api/bus")
    ? { route: "3", stop: "6706", minutes: [null, "", "bad", -1, 300, 8, "4"] }
    : [null, { Lat: "bad" }, { Lat: 25.8, Lng: -80.19, Tim: Date.now()/1000, Hea: 180 }] }));
  const state = vm.runInContext("state", context);
  assert.equal(state.vehicles.length, 1);
  assert.deepEqual(Array.from(state.buses[0].minutes), [4, 8]);
  assert.equal(state.refreshing, false);
  assert.equal(state.trolleyStatus, "ready");
});
test("wrong-route and out-of-area vehicles cannot enter the Biscayne map", async () => {
  const base = { Lat: 25.8, Lng: -80.19, Tim: Date.now()/1000, Hea: 180, RouteID: "71276" };
  const context = await boot(async () => ({ ok: true, json: async () => [base, {...base, RouteID: "other"}, {...base, Lat: 0}, {...base, Lng: 0}] }));
  assert.equal(vm.runInContext("state.vehicles.length", context), 1);
});
test("a failed refresh retains last-known timestamps but reports unavailable", async () => {
  const vehicle = { Lat: 25.8, Lng: -80.19, Tim: Date.now()/1000-30, Hea: 180 };
  const context = await boot(async () => ({ok: true, json: async () => [vehicle]}));
  const checkedAt = vm.runInContext("state.trolleyCheckedAt", context);
  context.fetch = async () => { throw new Error("provider offline"); };
  await vm.runInContext("refreshVehicles()", context);
  assert.equal(vm.runInContext("state.trolleyStatus", context), "unavailable");
  assert.equal(vm.runInContext("state.vehicles[0].Tim", context), vehicle.Tim);
  assert.equal(vm.runInContext("state.trolleyCheckedAt", context), checkedAt);
});
test("an empty successful response is not an outage and clears old positions", async () => {
  const context = await boot(async () => ({ok: true, json: async () => []}));
  assert.equal(vm.runInContext("state.trolleyStatus", context), "ready");
  assert.equal(vm.runInContext("state.vehicles.length", context), 0);
});
test("bus GPS works independently of failed trolley and arrival providers", async () => {
  const timestamp = Date.now()-20000;
  const context = await boot(async url => {
    if (url !== "/api/bus-positions") throw new Error("other provider offline");
    return {ok:true,json:async()=>({features:[{attributes:{BusID:5,RouteID:9,Latitude:25.79,Longitude:-80.19,BusTimeStampUTC:timestamp,DirectionName:"Northbound"}}]})};
  });
  assert.equal(vm.runInContext("state.busPositionStatus", context), "ready");
  assert.equal(vm.runInContext("state.busVehicles[0].Tim", context), timestamp/1000);
  assert.equal(vm.runInContext("state.trolleyStatus", context), "unavailable");
  context.fetch = async () => {throw new Error("offline");};
  await vm.runInContext("refreshBusPositions()", context);
  assert.equal(vm.runInContext("state.busPositionStatus", context), "unavailable");
  assert.equal(vm.runInContext("state.busVehicles[0].Tim", context), timestamp/1000);
});
test("released page has one interface and no prototype navigation", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.doesNotMatch(html, /data-view-tab|boardPlanner|timelineControls|TEST VIEWS/);
  assert.match(html, /<h1>Plan your ride<\/h1>/);
  assert.equal((html.match(/id="goPanel"/g) || []).length, 1);
});
