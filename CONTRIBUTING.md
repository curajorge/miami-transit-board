# Contributing

Issues and pull requests are welcome. Keep transit recommendations deterministic and label every displayed time as live, scheduled, estimated, or stale.

Before submitting a change:

```bash
npm run verify
cd android && ./gradlew assembleDebug
```

Do not commit API keys, signing keys, device identifiers, local SDK paths, or rider location data.

Keep pull requests focused. Include tests for changes to deterministic routing behavior and explain whether any displayed time is live, scheduled, estimated, or stale.
