# Flow State

Flow State is a grid-based path puzzle game built with Expo + React Native. The lobby lets you pick any level, and the game screen renders levels using Skia with gesture-driven drawing and pinch-to-zoom.

## Project Structure
- `app/` Expo Router screens (lobby, game, overlays).
- `game/` Drag engine, gesture controller, commit/preview logic.
- `data/levels.json` Level definitions (grid size, dots, open cells).
- `assets/` Images, icons, and splash assets.

## Requirements
- Node.js + npm
- Expo CLI (via `npx expo`) for local development
- EAS CLI for cloud builds (`npx eas-cli`)

## Getting Started
```bash
npm install
npx expo start
```

Use the Expo dev menu to open iOS/Android simulators, or run:
```bash
npm run ios
npm run android
```

## Builds
Production iOS builds are done via EAS.

### TestFlight flow (recommended)
We keep the **version** (`app.json` → `expo.version`) manual, and **auto-increment the iOS build number** on every production build. Auto-increment is configured in `eas.json` for the `production` profile.

Use this command to build + auto-submit:
```bash
npx eas-cli build -p ios --profile production --auto-submit
```

If you want to submit later:
```bash
npx eas-cli build -p ios --profile production
npx eas-cli submit -p ios --latest
```

### Versioning
- **Build number**: auto-increments on every production build.
- **Version**: bump manually in `app.json` when you want a new TestFlight/App Store version.

### One-off build
```bash
npx eas-cli build -p ios --profile production
```

## How Levels Work
- Each level defines a grid and dot pairs in `data/levels.json`.
- The game screen reads the level by id and renders the grid + dots using Skia.
- Drag gestures build a preview path and commit paths on release.

## Related Projects
- Flow State Editor (level authoring): `https://github.com/oscarmckittrick-personal/flowstate-editor`
