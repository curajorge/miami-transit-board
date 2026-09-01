const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeStops, busStopsForCorridor, planTrip } = require("./engine");
const NOW = new Date("2026-08-31T18:00:00-04:00");
const stops = [
  { ID:"920851", Name:"NE 29 St (SB)", StopNumber:"6 - NE 29 St (SB)", Latitude:"25.804565", Longitude:"-80.193634" },
  { ID:"920869", Name:"Bayfront Metromover (SB)", StopNumber:"24 - Bayfront Metromover (SB)", Latitude:"25.773203", Longitude:"-80.187495" },
  { ID:"920876", Name:"Brickell Metromover", StopNumber:"30 - Brickell Metromover", Latitude:"25.763316", Longitude:"-80.195167" },
  { ID:"921010", Name:"Fin. District Metromover", StopNumber:"34 - Fin. District Metromover", Latitude:"25.760705", Longitude:"-80.192013" },
  { ID:"921016", Name:"Bayfront Park Metromover (NB)", StopNumber:"40 - Bayfront Park Metromover (NB)", Latitude:"25.772571", Longitude:"-80.187160" },
  { ID:"921033", Name:"NE 2 Ave (WB)", StopNumber:"56 - NE 2 Ave (WB)", Latitude:"25.804127", Longitude:"-80.191638" },
];
const busStops = [
  {route:"3",direction:"south",id:"6706",name:"Biscayne Blvd & NE 29 St",lat:25.803996,lng:-80.189448,sequence:10},
  {route:"3",direction:"south",id:"3-downtown",name:"Downtown Terminal",lat:25.7732,lng:-80.1875,sequence:25},
  {route:"3",direction:"north",id:"3-downtown-north",name:"Downtown Terminal",lat:25.7732,lng:-80.1875,sequence:10},
  {route:"3",direction:"north",id:"3-edgewater-north",name:"Biscayne Blvd & NE 29 St",lat:25.8040,lng:-80.1894,sequence:25},
  {route:"9",direction:"south",id:"6774",name:"NE 2 Ave & NE 29 St",lat:25.804445,lng:-80.191184,sequence:10},
  {route:"9",direction:"south",id:"9-downtown",name:"Downtown Terminal",lat:25.7732,lng:-80.1875,sequence:25},
  {route:"9",direction:"north",id:"9-downtown-north",name:"Downtown Terminal",lat:25.7732,lng:-80.1875,sequence:10},
  {route:"9",direction:"north",id:"9-edgewater-north",name:"NE 2 Ave & NE 29 St",lat:25.804445,lng:-80.191184,sequence:25},
];
test("normalizes official stop sequence", () => assert.equal(normalizeStops(stops)[0].sequence, 6));
test("rejects malformed stop coordinates", () => assert.equal(normalizeStops([{ID:"bad",Name:"Bad",StopNumber:"1 - Bad",Latitude:"25.8",Longitude:"not-a-number"}]).length,0));
test("limits each bus direction to the Edgewater-Downtown corridor", () => {
  const routeGroups = {
    south: { route:"3", direction:"south", stops:[
      {id:"far-north",name:"Aventura",lat:25.9585,lng:-80.1451,sequence:1},
      {id:"edgewater",name:"NE 29 St",lat:25.8040,lng:-80.1894,sequence:2},
      {id:"midtown",name:"NE 15 St",lat:25.7896,lng:-80.1908,sequence:3},
      {id:"downtown",name:"NE 3 St",lat:25.7733,lng:-80.1898,sequence:4},
      {id:"south",name:"Brickell",lat:25.7620,lng:-80.1930,sequence:5},
    ]},
  };
  assert.deepEqual(busStopsForCorridor(routeGroups).map((stop) => stop.id), ["edgewater", "midtown", "downtown"]);
  assert.deepEqual(busStopsForCorridor(routeGroups).map(({ route, direction }) => [route, direction]), [["3", "south"], ["3", "south"], ["3", "south"]]);
});
test("southbound shortcut resolves exact stops", () => { const p=planTrip({from:"place:home",to:"place:brickell",stops,now:NOW}); assert.equal(p.direction,"south"); assert.equal(p.boarding.id,"920851"); assert.equal(p.alighting.id,"920876"); });
test("return trip resolves northbound stops", () => { const p=planTrip({from:"place:brickell",to:"place:home",stops,now:NOW}); assert.equal(p.direction,"north"); assert.equal(p.boarding.id,"921010"); assert.equal(p.alighting.id,"921033"); });
test("arrive-by subtracts total duration", () => { const d=new Date("2026-08-31T19:00:00-04:00"),p=planTrip({from:"place:home",to:"place:downtown",stops,mode:"arrive",arriveBy:d,now:NOW}); assert.equal(Math.round((d-p.leaveAt)/60000),p.best.total); });
test("Biscayne-only plan has no bus or walking alternatives", () => { const p=planTrip({from:"place:home",to:"place:downtown",stops,now:NOW}); assert.deepEqual(p.options.map((o)=>o.id),["trolley"]); });
test("leave-now subtracts walking and safety from trolley wait", () => { const p=planTrip({from:"place:home",to:"place:downtown",stops,now:NOW}); assert.equal(p.minutesUntilLeave,8); });
test("rejects opposite-direction exact stop pairs", () => assert.equal(planTrip({from:"stop:920851",to:"stop:921016",stops,now:NOW}),null));
test("compares live Routes 3 and 9 for Home to Downtown", () => { const p=planTrip({from:"place:home",to:"place:downtown",stops,busStops,buses:[{route:"3",stop:"6706",minutes:[13]},{route:"9",stop:"6774",minutes:[2]}],now:NOW}); assert.deepEqual(new Set(p.options.map((o)=>o.id)),new Set(["trolley","bus-3","bus-9"])); assert.equal(p.best.id,"bus-9"); });
test("preserves a selected Metrobus route and stop", () => { const p=planTrip({from:"bus:3:south:6706",to:"bus:3:south:3-downtown",stops,busStops,buses:[{route:"3",stop:"6706",minutes:[6]}],now:NOW}); assert.equal(p.options.some((o)=>o.id==="bus-3"),true); assert.equal(p.options.find((o)=>o.id==="bus-3").boarding,"Biscayne Blvd & NE 29 St"); });
test("bus stop planning still works when trolley tracker stops are unavailable", () => { const p=planTrip({from:"bus:3:south:6706",to:"bus:3:south:3-downtown",stops:[],busStops,buses:[{route:"3",stop:"6706",minutes:[6]}],now:NOW}); assert.deepEqual(p.options.map((o)=>o.id),["bus-3"]); });
test("Downtown return still compares northbound buses when the trolley tracker is unavailable", () => { const p=planTrip({from:"place:downtown",to:"place:home",stops:[],busStops,buses:[{route:"9",stop:"9-downtown-north",minutes:[4]}],now:NOW}); assert.deepEqual(new Set(p.options.map((o)=>o.id)),new Set(["bus-3","bus-9"])); assert.equal(p.direction,"north"); assert.equal(p.best.id,"bus-9"); });
