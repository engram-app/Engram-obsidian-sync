# Sync Preview Modal — Design

**Status:** Approved (2026-05-16). Pending implementation.

## Goal

Replace the silent "vault-selected → start syncing" behavior with a verbose preview modal that:

1. Tells the user exactly what is about to happen (counts, deletions, conflicts, match quality).
2. Lets them pick one of six sync directions (or back out entirely).
3. Gates destructive directions (anything that bulk-deletes notes on either side) behind a typed-DELETE confirmation.

Currently the plugin shows a primitive 3-button `FirstSyncModal` (push-all / pull-only / cancel) only on the very first sync, and a richer `PreSyncModal` only when the user clicks Sync Center action buttons. After vault selection in account or self-hosted tabs, the plugin just starts syncing. This design unifies the post-vault-select path with a single, more capable modal.

## Trigger Points

The new `SyncPreviewModal` fires:

1. **After successful vault selection** in `tabs/account-tab.ts` and `tabs/self-hosted-tab.ts` — every time, even on re-selection or vault switch.
2. **First-sync path** in `doSyncWithFirstSyncCheck` (replaces `FirstSyncModal` usage entirely).
3. **Sync Center action buttons** (`Sync now`, `Push all`, `Pull all`) in `sync-center-render.ts` — replaces the current `PreSyncModal` + `WipeConfirmModal` pair so all surfaces use the same UI.

## Sync Direction Options

Six choices presented as cards inside the modal:

| Choice | Label | Behavior | Destructive |
|---|---|---|---|
| `smart-merge` | Smart merge (recommended) | `syncEngine.fullSync()` — bidirectional, 3-way merge on conflicts | No |
| `pull-all-delete-local` | Pull all, delete local extras | New: pull every remote note + attachment; delete any local file not on server | Yes (local) |
| `pull-all-keep-local` | Pull all, keep local extras | Pull every remote; keep local-only files; remote wins on path collisions | No |
| `push-all-delete-remote` | Push all, delete remote extras | Push every local; delete any remote file not present locally | Yes (remote) |
| `push-all-keep-remote` | Push all, keep remote extras | Push every local; keep remote-only files; local wins on path collisions | No |
| `cancel` / `change-vault` | Cancel / Change vault | Two buttons in footer. Cancel = close, no sync. Change vault = close + return user to vault picker | No |

The recommended `smart-merge` card is visually emphasized (CTA styling). Destructive cards use a red/warning style.

## Modal Layout

Single Obsidian modal, content swaps between two views:

### View 1 — Preview

```
┌─ Engram sync — preview ──────────────────────┐
│  Vault: "My Vault"  →  https://api.engram.io │   identity strip
├──────────────────────────────────────────────┤
│  Local:  234 notes · 12 attachments          │   counts grid
│  Remote: 198 notes · 8 attachments           │
│  Match: 87% · Conflicts: 14                  │
├──────────────────────────────────────────────┤
│  [ Smart merge   ★ recommended ]             │
│    Pull 36, push 48, merge 14 conflicts      │
│    ▸ Sample paths                            │
│                                              │
│  [ Pull all + delete local      ⚠ red ]      │
│    Download 198, delete 48 local             │
│    ▸ Sample paths                            │
│                                              │
│  [ Pull all + keep local ]                   │
│    Download 198, keep all local              │
│    ▸ Sample paths                            │
│                                              │
│  [ Push all + delete remote      ⚠ red ]     │
│    Upload 234, delete 36 remote              │
│    ▸ Sample paths                            │
│                                              │
│  [ Push all + keep remote ]                  │
│    Upload 234, keep all remote               │
│    ▸ Sample paths                            │
├──────────────────────────────────────────────┤
│            [ Cancel ]  [ Change vault ]      │
└──────────────────────────────────────────────┘
```

Each option card shows counts derived from the loaded `SyncPlan`. "Sample paths" is a collapsible disclosure listing the first 5 file paths in the affected bucket — gives users a chance to spot disasters before clicking.

**Match %** is defined as `|local_paths ∩ remote_paths| / |local_paths ∪ remote_paths|` over notes only (attachments excluded — they're typically large and skew the ratio). Surfaces as a single percentage; 100% means every path appears on both sides, regardless of content.

While the plan is loading, the body shows a spinner. If `computeSyncPlan` rejects, the body shows an error message and only Cancel / Retry are enabled.

### View 2 — Typed-DELETE Confirm

Shown after clicking a destructive option:

```
┌─ Confirm destructive sync ───────────────────┐
│  You are about to:                           │
│    • Delete 48 local files                   │
│    • Delete 12 local attachments             │
│                                              │
│  Sample of what gets deleted:                │
│    daily-notes/2024-12-01.md                 │
│    inbox/scratch.md                          │
│    ... 46 more                               │
│                                              │
│  This cannot be undone.                      │
│                                              │
│  Type DELETE to confirm:                     │
│  [ _____________ ]                           │
│                                              │
│  [ Back ]              [ Confirm (disabled) ]│
└──────────────────────────────────────────────┘
```

Confirm button is disabled until the input matches `DELETE` exactly (case-sensitive). Back returns to View 1 with the user's selection preserved.

## Data Flow

```
Vault selected
   │
   ▼
syncEngine.computeSyncPlan("full")
   │  (spinner shown while pending)
   ▼
SyncPreviewModal opens with plan
   │
   ├─ User clicks smart-merge → resolve("smart-merge")
   │     → syncEngine.fullSync()
   │
   ├─ User clicks non-destructive direction → resolve(choice)
   │     → engine method per choice (see "New engine methods" below)
   │
   ├─ User clicks destructive direction → swap to View 2
   │     User types DELETE → Confirm
   │     → resolve(choice) → engine method
   │
   ├─ User clicks Cancel → resolve("cancel"), modal closes, no sync
   │
   └─ User clicks Change vault → resolve("change-vault"), modal closes;
        caller (account-tab / self-hosted-tab) clears vaultId and reopens
        the vault picker. From other trigger sites (Sync Center, first
        sync) this button is hidden.
```

## New / Modified Code

### New: `SyncChoice` type

```ts
// src/types.ts
export type SyncChoice =
  | "smart-merge"
  | "pull-all-delete-local"
  | "pull-all-keep-local"
  | "push-all-delete-remote"
  | "push-all-keep-remote"
  | "cancel"
  | "change-vault";
```

### New: `src/sync-preview-modal.ts`

Replaces `src/first-sync-modal.ts` and `src/pre-sync-modal.ts` entirely. Exposes:

- `class SyncPreviewModal extends Modal`
- Constructor takes `{ app, plan, showChangeVault: boolean }`
- `awaitChoice(): Promise<SyncChoice>` — opens modal and resolves with user choice
- Internal state machine for View 1 ↔ View 2

Keeps the existing pure helpers `isPlanEmpty(plan)` and `formatPlanSummary(plan)` (move them to a new file `src/sync-plan-format.ts` so both the modal and any future surfaces can use them without importing the modal).

### Modified: `src/sync.ts` — new engine methods

Current `SyncEngine` exposes: `pull()`, `pushAll()`, `fullSync()`, `wipePullAll()`. The four new directions need two new methods (or extensions):

```ts
// Pull every remote note + attachment. If deleteLocalExtras=true, also
// delete any local syncable file that has no remote counterpart.
async pullAll(opts?: { deleteLocalExtras?: boolean }): Promise<number>;

// Push every local note + attachment. If deleteRemoteExtras=true, also
// delete any remote note/attachment that has no local counterpart.
async pushAll(opts?: { deleteRemoteExtras?: boolean }): Promise<number>;
```

`wipePullAll` becomes `pullAll({ deleteLocalExtras: true })`. The legacy method stays as a thin wrapper for one release cycle to keep Sync Center working without a same-PR refactor.

### Modified: `src/main.ts`

- `doSyncWithFirstSyncCheck`:
  - Always compute plan and show `SyncPreviewModal` (drop the `isFirstSync()` branch — first-sync is just one case where the modal appears).
  - Dispatch on `SyncChoice` to the right engine method.
- Add helper `runSyncFromChoice(choice: SyncChoice): Promise<void>` so the same dispatch logic is reusable from account-tab / self-hosted-tab.

### Modified: `src/tabs/account-tab.ts` + `src/tabs/self-hosted-tab.ts`

After a successful vault selection:

```ts
const plan = await plugin.syncEngine.computeSyncPlan("full");
const choice = await new SyncPreviewModal(app, plan, { showChangeVault: true }).awaitChoice();
if (choice === "change-vault") {
  // Clear vault selection and re-render tab
  return;
}
await plugin.runSyncFromChoice(choice);
```

### Modified: `src/sync-center-render.ts`

Replace the three separate flows (Sync now / Push all / Pull all) with: compute plan once → open `SyncPreviewModal` → dispatch. Reduces three near-identical button handlers to one.

### Deleted

- `src/first-sync-modal.ts` — superseded
- `src/pre-sync-modal.ts` — replaced by `sync-preview-modal.ts` + `sync-plan-format.ts`

## Error Handling

| Scenario | Behavior |
|---|---|
| `computeSyncPlan` rejects (network, auth, server) | View 1 shows error text + only Cancel and Retry buttons. Retry re-runs `computeSyncPlan`. |
| User dismisses modal via Esc or backdrop | Resolves as `cancel`. No sync runs. Same as clicking Cancel. |
| Sync execution fails after user picks | Existing error path: `Notice` + `rlog().error`. Modal already closed by then. |
| User types something other than `DELETE` | Confirm button stays disabled. No other UI change. |

## Testing

### Unit tests (Bun, mocked Obsidian)

`tests/sync-preview-modal.test.ts` (new):
- Renders correct counts for a given `SyncPlan`
- Each option card resolves the right `SyncChoice`
- Destructive option swaps to View 2; non-destructive resolves immediately
- Typed-DELETE: button disabled until exact match; case-sensitive
- Back from View 2 returns to View 1 without resolving
- Esc / backdrop dismiss resolves `cancel`
- `showChangeVault: false` hides the Change vault button
- Plan-fetch error renders error view with Retry + Cancel only

`tests/sync-plan-format.test.ts` (new, mostly migrated):
- `isPlanEmpty` and `formatPlanSummary` covered against representative plans

`tests/sync.test.ts` (extended):
- `pullAll({ deleteLocalExtras: false })` — pulls remote, leaves local-only files alone
- `pullAll({ deleteLocalExtras: true })` — pulls remote, deletes local-only files
- `pushAll({ deleteRemoteExtras: false })` — pushes local, leaves remote-only files alone
- `pushAll({ deleteRemoteExtras: true })` — pushes local, deletes remote-only files
- Each case asserts `vault.delete` / `api.deleteNote` call counts and arguments

### Not unit-tested (UI integration)

- The actual modal opening from `tabs/account-tab.ts` and `tabs/self-hosted-tab.ts` after vault selection — covered manually + by backend E2E.

## Migration / Rollout

Single PR. No feature flag — the new modal is strictly more informative than the old behavior and gates destructive operations more carefully, so silent rollout is safe.

Version bump: minor (`1.3.x` → `1.4.0`) since the post-vault-select UX is a visible behavior change.

## Out of Scope

- Per-file selective sync (user picks which paths to push/pull). Future feature.
- Backup-before-destroy. Out of scope; the typed-DELETE confirm is the safety net.
- Modal i18n. Plugin has no translation infrastructure today.
- Conflict resolution UI changes. Existing `ConflictModal` handles individual conflicts during sync; smart-merge continues to delegate to it.
