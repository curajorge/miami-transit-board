# Transit data sources

Miami Transit Board is an independent project and is not affiliated with or endorsed by the City of Miami or Miami-Dade County.

## City of Miami trolley

- Biscayne route geometry, stops, and public vehicle positions come from the City of Miami public trolley tracker.
- A last-known catalog of the route's 60 public stops is bundled as a fallback. Fresh tracker data replaces it whenever the route endpoint is available.
- Trolley vehicle arrivals are estimates calculated from public positions, heading, distance, and data age. They are not official stop predictions.
- When no fresh approaching vehicle can be identified, the app uses a rough 15-minute waiting assumption. This is not a published headway or official timetable.

## Miami-Dade Metrobus

- Route 3 and Route 9 stop catalogs are generated from Miami-Dade's public GTFS schedule feed.
- Moving bus positions come from the County's [BusRealTime GIS layer](https://gis.miamidade.gov/arcgis/rest/services/BusMetro_RealTime/BusRealTime/MapServer/0). A fixed read-only query requests Routes 3 and 9 and only vehicle ID/name, route, coordinates, UTC timestamp, direction, and headsign. No API key is embedded.
- Bus GPS timestamps use `BusTimeStampUTC` (milliseconds since Unix epoch), not the local-time field. Freshness is checked using the original timestamp. Positions older than four minutes, future-dated positions, and malformed coordinates are not displayed as current.
- The live map shows buses in the Edgewater–Downtown area (latitude 25.765–25.825, longitude -80.205–-80.17), not the full routes to Aventura. A route with no fresh positions in this area is not necessarily out of service.
- Bus GPS and stop arrival estimates are independent feeds. Fresh bus positions do not upgrade a rough trip estimate into an official arrival prediction. The existing BusTime certificate/provider issue can still make stop predictions unavailable even when the live map works.
- The Home-to-Downtown experience reads public arrival estimates near NE 29th Street and Downtown in both directions from Miami-Dade BusTime.
- When a live bus arrival is unavailable at the selected boarding stop, the app uses a rough 15-minute waiting assumption, not an official schedule prediction. Only the configured NE 29th Street and Downtown stops have live bus queries.

Miami-Dade describes its transit feeds as open data intended for third-party applications. The repository's MIT License covers the project code; it does not relicense source transit data, which remains subject to the publisher's applicable terms. See the [Miami-Dade transit open-data page](https://www.miamidade.gov/global/transportation/open-data-feeds.page) and [County website user agreement](https://www.miamidade.gov/global/disclaimer/disclaimer.page).

Walking distances use straight-line geometry, not pedestrian routing. Ride durations are rough stop-count calculations. There is no transfer planner, official service-hours validation, or guarantee of a catchable departure. Transit data can be incomplete, stale, delayed, or changed by its publisher. Do not use this app as the sole basis for time-critical travel.

## On-device saved trips

Up to eight named trips and the last selected trip are stored in browser/WebView local storage. Saved data includes endpoints (and coordinates for selected map points), ride preference, and a selected service when applicable—not cached arrival predictions. There is no account, cloud sync, or feedback upload. The app recalculates the trip and return direction from current data. Clearing app/site storage removes the saved trips.
