# Polyglot Migration Plan

This project now supports a staged engine migration strategy:

1. Keep Discord gateway and command orchestration in Node.js.
2. Move data-fetch and CPU-heavy tasks behind `src/engines/*` adapters.
3. Switch providers by environment variables with safe fallback to JS.

## Current status

- `src/engines/steam_info_engine.js` added.
- `STEAM_INFO_ENGINE=js|python|go|rust|cpp` controls provider selection.
- On provider failure, engine falls back to the JS provider automatically.
- Python worker implemented: `scripts/engines/steam_info_engine.py`.
- Go worker reference source added: `scripts/engines/go/steam_info_engine.go`.
- `src/engines/steamdb_engine.js` added and wired through `src/steamdb_scraper.js`.
- Steam fallback/name+size helpers extracted from the main bot into `src/services/steam_fallback_helpers.js`.
- DRM + manifest metadata helpers extracted into `src/services/game_metadata_helpers.js`.
- `src/engines/checksum_engine.js` added for SHA-256 with JS fallback.
- `STEAMDB_ENGINE=js|python|go|rust|cpp` controls SteamDB provider selection.
- Python worker added: `scripts/engines/steamdb_engine.py`.
- Go worker reference source added: `scripts/engines/go/steamdb_engine.go`.
- Rust worker source added: `scripts/engines/rust/checksum_engine.rs`.
- Build helper added: `npm run build:engines` (builds both Go workers).
- Optional Rust build helper added: `npm run build:rust:checksum`.
- SteamDB parsers now detect anti-bot challenge pages and return `null` (no fake game name).
- Smoke tests:
  - Steam store: `npm run smoke:engine -- 570`
  - SteamDB: `npm run smoke:steamdb -- 570`
  - Checksum: `npm run smoke:checksum -- ./README.md`

## Runtime configuration

Set these in `.env` or Render environment:

- `STEAM_INFO_ENGINE=js`
- `STEAM_INFO_ENGINE_TIMEOUT_MS=10000`
- `PYTHON_BIN=python,python3`
- `STEAM_PY_ENGINE_SCRIPT=scripts/engines/steam_info_engine.py`
- `STEAM_GO_ENGINE_BIN=`
- `STEAM_RUST_ENGINE_BIN=`
- `STEAM_CPP_ENGINE_BIN=`
- `STEAMDB_ENGINE=js`
- `STEAMDB_ENGINE_TIMEOUT_MS=15000`
- `STEAMDB_PY_ENGINE_SCRIPT=scripts/engines/steamdb_engine.py`
- `STEAMDB_GO_ENGINE_BIN=`
- `STEAMDB_RUST_ENGINE_BIN=`
- `STEAMDB_CPP_ENGINE_BIN=`
- `CHECKSUM_ENGINE=js`
- `CHECKSUM_ENGINE_TIMEOUT_MS=45000`
- `CHECKSUM_RUST_ENGINE_BIN=`
- `CHECKSUM_GO_ENGINE_BIN=`
- `CHECKSUM_CPP_ENGINE_BIN=`

## Suggested next phases

1. Run `npm run build:engines`, set `STEAM_INFO_ENGINE=go` and `STEAMDB_ENGINE=go` on hosts with Go binaries.
2. Stabilize on one external provider in production, keep JS fallback enabled.
3. Expand Rust checksum worker to native hashing implementation (no shell delegation).
4. Use Python worker for ML/ranking/autocomplete enrichment.
5. Keep Node.js as API + Discord orchestration shell.
