# Engram Vault Sync

> Your vault, queryable by AI. Synced everywhere.

Bidirectional sync between your Obsidian vault and an [Engram](https://engram.page) server, with AI-powered semantic search across every note.

Engram is the backend: an Elixir/Phoenix app that stores notes in PostgreSQL, embeds them into vectors via Voyage AI or Ollama, and serves semantic search through Qdrant. Any AI assistant that speaks [MCP](https://modelcontextprotocol.io) can query your vault directly. This plugin is the Obsidian half — it watches your vault, pushes changes, pulls remote edits, and exposes search from the command palette.

> **Engram is required.** This plugin is a sync client — it does not run AI locally and does nothing without a server. Self-host the [Engram backend](https://github.com/engram-app/engram), or use the hosted plan at [engram.page](https://engram.page).

## Features

- **Semantic search** — find notes by meaning, not just keywords. Available from the command palette or a dedicated sidebar view.
- **Bidirectional sync** — local edits push automatically; remote edits (from other devices or MCP) pull on startup and periodically.
- **Real-time updates** — optional WebSocket channel for instant propagation without polling.
- **Conflict resolution** — 3-way merge via `diff-match-patch` with an interactive side-by-side diff modal, or automatic conflict-copy creation.
- **Offline queue** — edits made offline are queued and replayed when connectivity returns.
- **Ignore patterns** — glob patterns to exclude files and folders. Auto-detects and warns about problematic directories (`node_modules`, `.venv`, etc.).
- **OAuth and API key auth** — device-flow OAuth or static API key.
- **Mobile and desktop** — works on both. No Node.js or filesystem dependencies.

## Privacy and data flow

```
Obsidian vault  ⇄  Engram Sync (plugin)  ⇄  Your Engram server  →  Qdrant + Voyage/Ollama
```

All note content is sent to the Engram URL you configure — nothing else. No third-party AI services, no telemetry, no analytics. The plugin never talks to OpenAI, Anthropic, or any cloud AI provider; only your Engram server does, and only if you configure it to use a hosted embedding model. An opt-in remote-logging feature (default OFF) sends sync lifecycle events back to your own Engram server for debugging.

## Install

### From Obsidian Community Plugins

1. Open **Settings → Community plugins**.
2. Search for **Engram Vault Sync**.
3. Click **Install**, then **Enable**.

### BRAT (beta channel)

For pre-release builds, install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) and add `engram-app/Engram-obsidian`.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/engram-app/Engram-obsidian/releases/latest).
2. In your vault, create a folder at `.obsidian/plugins/engram-vault-sync/`.
3. Copy the three files into that folder.
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**.

## Quick start

1. Stand up an Engram server — see the [backend repo](https://github.com/engram-app/engram) for self-hosting (`docker compose` or `mix phx.server`).
2. Create an API key on the server:
   ```bash
   curl -X POST https://engram.example.com/api-keys \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"name": "my-vault"}'
   ```
3. In Obsidian, open **Settings → Engram Vault Sync**.
4. Enter your **Engram URL** (e.g. `https://engram.example.com`).
5. Authenticate:
   - **OAuth** — click "Sign in with Engram" and follow the device flow, or
   - **API key** — paste the `engram_` key from step 2.
6. On first sync, the plugin walks you through pushing your existing vault to the server.

Optionally tune ignore patterns, debounce delay, and conflict resolution mode from the same settings panel.

## Commands

| Command | What it does |
|---------|--------------|
| Engram: Sync now | Push pending changes and pull remote changes immediately |
| Engram: Push entire vault | Force push every syncable file |
| Engram: Pull all from server | Download all notes into the vault |
| Engram: Check sync status | Compare local and remote state, report drift |
| Engram: Show sync log | Open the in-app sync log modal |
| Engram: Semantic search | Search notes by meaning (modal) |
| Engram: Open search sidebar | Persistent search sidebar view |

## Conflict resolution

When a note changes both locally and remotely between syncs, the plugin runs a 3-way merge using `diff-match-patch`. Disjoint edits merge cleanly. Overlapping edits open a side-by-side diff modal where you pick a resolution per hunk. Configure automatic "conflict-copy" creation if you'd rather never lose either version.

## Troubleshooting

| Symptom | Things to check |
|---------|-----------------|
| Sync silently fails | Engram URL reachable from your device? API key/OAuth token valid? Open **Engram: Show sync log** |
| Files not syncing | Check ignore patterns in settings — matching files are skipped |
| Conflicts every sync | Likely clock skew between client and server. Check both system clocks |
| Plugin won't load on mobile | File an issue with desktop/mobile flag and Obsidian version |
| OAuth sign-in fails | Confirm the Engram server has OAuth enabled. Fall back to API key |

## Disclosures

- **Network use** — communicates only with the Engram URL you configure. No third-party services.
- **Account required** — API key or OAuth credentials for your Engram instance.
- **Remote logging** — opt-in, default OFF, sends only to your own Engram server.
- **Telemetry** — none.

## Support

If this plugin saves you time, you can [buy me a coffee on Ko-fi](https://ko-fi.com/rasbandit). Optional and appreciated.

## Attribution

Uses [diff-match-patch](https://github.com/google/diff-match-patch) by Google for 3-way merge conflict resolution, licensed under Apache 2.0.

## License

[MIT](LICENSE)
