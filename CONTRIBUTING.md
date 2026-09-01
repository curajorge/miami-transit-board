# Contributing

Issues and pull requests are welcome. Keep transit recommendations deterministic and label every displayed time as live, scheduled, estimated, or stale.

Before submitting a change:

```bash
node --check app.js
node --check engine.js
node --test engine.test.js
```

Do not commit API keys, signing keys, device identifiers, local SDK paths, or rider location data.
