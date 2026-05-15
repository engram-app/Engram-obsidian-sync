# Engram Vault Sync — Developer Guide

Implementation and contributor notes for Engram Vault Sync, the Obsidian plugin that syncs your vault with an [Engram](https://github.com/engram-app/engram) server. For the end-user overview, see [README.md](README.md).

## Architecture

The plugin is a thin sync client. It watches the vault for changes, pushes them to an Engram server over REST, and pulls remote changes on startup, on a timer, and in real time over a WebSocket channel. It does **no** AI work itself — no markdown parsing, no embedding generation, no vector search. All of that lives on the Engram backend.

```
┌──────────┐     ┌──────────────────────────┐     ┌───────────────────┐
│ Obsidian │ ⇄  │      Engram server       │ ⇄  │  AI client (MCP)  │
│  vault   │     │  notes + vector search   │     │  Claude, Cursor…  │
└──────────┘     └──────────────────────────┘     └───────────────────┘
     ↑                       ↑
 This repo            engram-app/engram
```

The Engram backend is an Elixir/Phoenix app that stores notes in PostgreSQL, generates embeddings via Voyage AI or a local Ollama, serves semantic search through Qdrant, and speaks MCP. Setup, deployment, and the full REST contract live in [engram-app/engram](https://github.com/engram-app/engram).

### What this plugin is responsible for

1. **Watch vault events** — `app.vault.on("create" | "modify" | "delete" | "rename")`.
2. **Push changes** — `POST /notes`, `POST /attachments`, `DELETE /notes/:path`.
3. **Pull changes** — `GET /notes/changes` on startup, on a timer, and via WebSocket push.
4. **Apply remote changes locally** — files created or edited via MCP or other devices.
5. **Settings UI** — Engram URL, auth, ignore patterns, conflict resolution.

### What it explicitly is not responsible for

- Parsing markdown or chunking text (Engram does this).
- Generating embeddings (Engram does this via Voyage or Ollama).
- Talking to Qdrant (Engram does this).
- Indexing for search (Engram does this — the plugin only calls `POST /search`).
- Auth or user management (Engram does this).

Internals beyond this overview — class map, sync algorithm, type definitions — are documented in [`docs/internals.md`](docs/internals.md). CDP and Obsidian remote debugging are covered in [`docs/engram-ops.md`](docs/engram-ops.md).

## Repo layout

```
src/
  main.ts              Plugin entry — registers commands, views, ribbon, status bar
  sync.ts              SyncEngine — push/pull/merge orchestration
  api.ts               REST client for the Engram backend
  channel.ts           Phoenix WebSocket channel for real-time pushes
  auth.ts              ApiKeyAuth and OAuthAuth providers
  diff.ts              Hunk-based diff utilities
  three-way-merge.ts   diff-match-patch-based 3-way merge
  conflict-modal.ts    Interactive conflict resolution UI
  search-modal.ts      Semantic search modal
  search-view.ts       Persistent search sidebar
  sync-center-view.ts  Sync dashboard
  settings.ts + tabs/  Settings UI (Account, Sync Center, Self-hosted, Advanced)
  offline-queue.ts     Persistent queue for offline edits
  remote-log.ts        Opt-in lifecycle logging back to the user's own Engram
  …
tests/                 313 unit tests (Bun + custom Obsidian mocks)
docs/                  Internals, ops, API audit, submission notes
```

## Toolchain

- **Runtime/package manager:** [Bun](https://bun.sh). Use `bun`, not `npm` — the only exception is `npm version patch|minor|major`, which needs npm's lifecycle hooks to run `version-bump.mjs`.
- **Bundler:** esbuild (`esbuild.config.mjs`).
- **Type check:** TypeScript (`tsc -noEmit`) — runs as part of `bun run build`.
- **Lint/format:** Biome (`bun run lint`, `bun run format`) plus an Obsidian-specific ESLint pass (`bun run lint:obsidian`).
- **Styles:** Stylelint over `styles.css`.
- **Git hooks:** Lefthook (auto-installed via `bun run prepare`).

## Building

```bash
bun install
bun run build         # production bundle → main.js
bun run dev           # esbuild watch mode
```

## Testing

**Tests are the spec. If a test fails, fix the implementation — not the test.**

```bash
bun test              # 313 unit tests
bun test --verbose
bun test --coverage   # ~89% functions, ~97% lines
```

### Test layout

| File | Tests | Covers |
|------|-------|--------|
| `tests/sync.test.ts` | 134 | SyncEngine — ignore, modify/delete/rename, pull, WebSocket, echo suppression, status, first sync, 3-way merge, destroy, state export/import |
| `tests/api.test.ts` | 47 | EngramApi methods, base64, auth headers, URL encoding, error handling, attachments, `pushLogs` |
| `tests/dev-log.test.ts` | 20 | Ring buffer log, 500-entry cap, singleton lifecycle |
| `tests/diff.test.ts` | 17 | `computeDiff`, `groupIntoHunks`, `buildMergedContent` |
| `tests/three-way-merge.test.ts` | 15 | 3-way merge via `diff-match-patch` |
| `tests/offline-queue.test.ts` | 17 | Enqueue/dequeue, dedup by path, oldest-first, persistence |
| `tests/remote-log.test.ts` | 15 | Buffer mgmt, flush threshold, ring buffer overflow |
| `tests/base-store.test.ts` | 13 | BaseStore — last-synced content for 3-way merge base |
| `tests/channel.test.ts` | 10 | Phoenix channel topic, events, auth flow |
| `tests/auth.test.ts` | 20 | ApiKeyAuth, OAuthAuth — refresh, dedup, persistence |
| `tests/search.test.ts` | 5 | `EngramApi.search`, search modal debounce |

### Test config

- `bunfig.toml` preloads `tests/preload.ts`, which wires `tests/__mocks__/obsidian.ts`.
- The Obsidian mock provides minimal `TFile`, `Plugin`, `Modal`, `requestUrl`, etc.
- Coverage thresholds: 40% minimum across branches, functions, lines, statements.

### Untested files

UI-heavy modules are exercised end-to-end from the backend repo: `settings.ts`, `conflict-modal.ts`, `first-sync-modal.ts`, `search-modal.ts`, `search-view.ts`, `main.ts`.

## Deploying to your local vault

```bash
bun run build
cp main.js manifest.json styles.css \
  "/path/to/Your Vault/.obsidian/plugins/engram-vault-sync/"
```

Then restart Obsidian, or toggle the plugin off and on, to pick up the new build.

## Release process

Releases are automated via GitHub Actions. Tags use `x.y.z` format (no `v` prefix) for BRAT and Obsidian compatibility.

### Workflows

| Workflow | Trigger | Effect |
|----------|---------|--------|
| `ci.yml` | Push to any branch | Build + lint + test, plus backend E2E trigger |
| `version-check.yml` | PR to `main` | Blocks merge unless `manifest.json`, `package.json`, and `versions.json` agree |
| `rc-release.yml` | Each push to a PR | Publishes a BRAT-installable pre-release (`X.Y.Z-rc.N`) |
| `release.yml` | PR merged to `main` | Cleans up RCs, tags `X.Y.Z`, publishes the final release |

### Cutting a release

1. **Bump the version (only manual step):**
   ```bash
   npm version patch     # or minor / major
   ```
   This updates `package.json`, runs `version-bump.mjs` to sync `manifest.json` + `versions.json`, and commits the change.
2. **Open a PR.** Each push to that PR triggers `rc-release.yml` and publishes `X.Y.Z-rc.N` as a GitHub pre-release — BRAT users can pin to that frozen version for testing.
3. **Merge.** `release.yml` removes the RC tags/pre-releases, tags `X.Y.Z` on the merge commit, and publishes the final GitHub release with `main.js`, `manifest.json`, and `styles.css` attached.

### Branch protection

`main` requires two passing checks: `build-and-test` and `version-check / version-check`.

## Settings reference

The plugin's settings are stored in `<vault>/.obsidian/plugins/engram-vault-sync/data.json` and shaped by `EngramSyncSettings` in `src/types.ts`.

| Key | Default | Purpose |
|-----|---------|---------|
| `apiUrl` | `""` | Engram base URL. |
| `apiKey` | `""` | Static API key (falls back when OAuth isn't configured). |
| `refreshToken` | unset | OAuth refresh token. Takes precedence over `apiKey`. |
| `userEmail` | unset | Display only; populated after OAuth sign-in. |
| `authMethod` | `null` | `"oauth"`, `"api_key"`, or `null`. |
| `vaultId` | `null` | Server-assigned vault ID, populated on first registration. |
| `clientId` | `""` | SHA-256 of the vault path. Stable across restarts, used for idempotent registration. |
| `ignorePatterns` | `""` | One pattern per line. Trailing `/` = folder match anywhere in the path; otherwise exact filename or path suffix. `.obsidian/`, `.trash/`, `.git/` are always ignored. |
| `debounceMs` | `2000` | Delay between the last `modify` event and the push. |
| `conflictResolution` | `"auto"` | `"auto"` writes a conflict copy; `"modal"` opens the interactive diff. |
| `conflictViewMode` | `"unified"` | `"unified"` or `"side-by-side"` diff layout. |
| `remoteLoggingEnabled` | `false` | Opt-in lifecycle logging to the user's own Engram server. |

## Commands

All registered in `src/main.ts`, exposed in the palette under `Engram:`.

| ID | Name | Effect |
|----|------|--------|
| `sync-now` | Sync now | Push pending, then pull. |
| `push-all` | Push entire vault | Force-push every syncable file. |
| `pull-all` | Pull all from server (force overwrite) | Download everything; overwrite local. Confirmation prompt. |
| `check-sync` | Check sync status | Compare local and remote state; report drift. |
| `show-sync-log` | Show sync log | In-app sync log modal. |
| `open-sync-center` | Open sync center | Sync dashboard view. |
| `search` | Semantic search | Search modal. |
| `open-search-sidebar` | Open search sidebar | Persistent sidebar view. |

Two ribbon icons: 🔍 (search) and 🔄 (Sync Center). One status-bar item shows live sync state.

## Supported file types

Defined in `src/sync.ts`:

- `TEXT_EXTENSIONS`: `md`, `canvas` (canvas is JSON text).
- `BINARY_EXTENSIONS`: `png`, `jpg`, `jpeg`, `gif`, `bmp`, `svg`, `webp`, `pdf`, `mp3`, `wav`, `ogg`, `m4a`, `flac`, `mp4`, `mov`, `webm`, `zip`.

Anything outside both sets is silently ignored by `isSyncable()`.

## Contributing

- Doc-only changes (this file, `docs/`, `CLAUDE.md`, `README.md`) can be pushed directly to `main`.
- Code changes go through a PR. CI must pass and the version must be bumped before merge.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:` — subject ≤50 chars.
- Tests are the spec. Add or update tests alongside code changes; never modify tests to mask a regression.

## Multi-repo notes

This plugin is one half of the Engram project. For cross-repo work (API changes, plugin↔backend debugging, deploys), the workspace pattern lives at `../engram-workspace/`. See `../engram-workspace/docs/workspace-pattern.md` for when to use the workspace vs this repo standalone.

## License

[MIT](LICENSE)
