# Biscayne Trolley Live

A mobile-first prototype showing live vehicle positions for the City of Miami's Biscayne trolley route.

## Run locally

```bash
node server.js
```

Then open <http://localhost:4173>.

The small local server reads route geometry and vehicle positions from the public endpoint used by the City of Miami's official trolley tracker. This avoids the tracker's browser compatibility problem, so the app must be run with `node server.js` rather than opened directly as a file.

## Current scope

- Biscayne route only (public route ID `71276`)
- Live vehicle positions refreshed every 30 seconds
- Vehicle update age and stale-data warning
- Responsive mobile and desktop layout
- Deterministic comparison of the Biscayne trolley with Metrobus 3 and 9 for the common Home-to-Downtown trip
- Leave-now and arrive-by planning for Downtown and Brickell
- Expandable arithmetic/source explanation for every recommendation
- All 60 official Biscayne trolley stops on an interactive map
- Map-based From/To assignment: tap either trip card, then tap a stop
- Stop popups with direction, next-trolley estimate, and From/To actions
- Direction-aware saved places for Whole Foods, Downtown, and Brickell
- One-tap outbound/return trip reversal
- Locally remembered From/To selections

## Open source

This project is licensed under the MIT License. Contributions are welcome; see `CONTRIBUTING.md`. Live transit information can be delayed or unavailable, so recommendations should be treated as estimates rather than guarantees.

The leave-time recommendation uses fresh City trolley positions and public Miami-Dade BusTime arrivals for Routes 3 and 9. If a live trolley cannot be identified, the trolley option clearly falls back to the Biscayne route's published headway. The calculation subtracts the walk to the boarding stop and a small boarding cushion from each arrival estimate.

This is an independent prototype and is not affiliated with or endorsed by the City of Miami.
