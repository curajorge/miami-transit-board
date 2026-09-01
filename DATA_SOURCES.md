# Transit data sources

Miami Transit Board is an independent project and is not affiliated with or endorsed by the City of Miami or Miami-Dade County.

## City of Miami trolley

- Biscayne route geometry, stops, and public vehicle positions come from the City of Miami public trolley tracker.
- Trolley vehicle arrivals are estimates calculated from public positions, heading, distance, and data age. They are not official stop predictions.
- When no fresh approaching vehicle can be identified, the app labels its fallback as a published-headway estimate.

## Miami-Dade Metrobus

- Route 3 and Route 9 stop catalogs are generated from Miami-Dade's public GTFS schedule feed.
- The Home-to-Downtown prototype reads public arrival estimates for the NE 29th Street stops from Miami-Dade BusTime.
- When a live bus arrival is unavailable, the app labels the result as a schedule estimate.

Transit data can be incomplete, stale, delayed, or changed by its publisher. Do not use this prototype as the sole basis for time-critical travel.
