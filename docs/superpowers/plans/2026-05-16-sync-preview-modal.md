# Sync Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace silent post-vault-select sync with a verbose preview modal that shows counts, match %, deletions, and lets the user pick one of six sync directions — gating destructive choices behind a typed-DELETE confirm.

**Architecture:** New `SyncPreviewModal` (Obsidian `Modal` subclass) becomes the single entry point for any "we're about to sync, what do you want to do?" decision. Triggered from `doSyncWithFirstSyncCheck` (which is itself called after every `saveSettings` once auth + vault are configured) and from the Sync Center action buttons. The modal is a thin DOM wrapper around a pure `SyncPreviewState` class that owns the state machine and choice resolution so it can be unit-tested without DOM. Two new option flags on existing engine methods (`pullAll({ deleteLocalExtras })`, `pushAll({ deleteRemoteExtras })`) cover the four new sync directions; the existing `fullSync()` covers `smart-merge`.

**Tech Stack:** TypeScript, Obsidian plugin API, Bun test runner, diff-match-patch (existing, untouched).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `SyncChoice` union type |
| `src/sync-plan-format.ts` | **Create** | Pure helpers: `isPlanEmpty`, `formatPlanSummary`, `computeMatchPercent`, `samplePaths`, `isDestructiveChoice`, `optionBreakdown` |
| `src/sync-preview-modal.ts` | **Create** | `SyncPreviewState` (pure state machine) + `SyncPreviewModal` (DOM wrapper) |
| `src/sync.ts` | Modify | Extend `pullAll`/`pushAll` to accept `{ deleteLocalExtras }` / `{ deleteRemoteExtras }` |
| `src/main.ts` | Modify | Add `runSyncFromChoice`; rewrite `doSyncWithFirstSyncCheck` to always use new modal |
| `src/sync-center-render.ts` | Modify | Consolidate Sync now / Push all / Pull all into one `SyncPreviewModal` handler |
| `src/first-sync-modal.ts` | **Delete** | Superseded |
| `src/pre-sync-modal.ts` | **Delete** | Replaced by `sync-preview-modal.ts` + `sync-plan-format.ts` |
| `tests/sync-plan-format.test.ts` | **Create** | Covers new + migrated helpers |
| `tests/sync-preview-modal.test.ts` | **Create** | Covers `SyncPreviewState` state machine |
| `tests/sync.test.ts` | Modify | Add cases for new `pullAll`/`pushAll` opts |
| `tests/pre-sync-modal.test.ts` | **Delete** | Tests migrated into `sync-plan-format.test.ts` |
| `package.json` + `manifest.json` + `versions.json` | Modify | Version bump → `1.4.0` |

---

## Setup

- [ ] **Step 0: Confirm starting state**

Run from the repo root:

```bash
git switch main
git pull --ff-only
git switch -c feat/sync-preview-modal
bun install
bun test
```

Expected: all 757+ tests pass on a clean `main`. If you're picking up from existing branch work where `refactor/remove-sync-center-pane` has merged, also expect `SyncCenterView` / ribbon to be gone — that PR is independent of this plan and not required to land first.

If you are continuing work on an existing `feat/sync-preview-modal` branch, skip the `git switch -c` step.

---

## Task 1: Add `SyncChoice` type

**Files:**
- Modify: `src/types.ts` (append a new exported type)

- [ ] **Step 1.1: Add the type**

Append at the end of `src/types.ts`:

```ts
/** User's chosen sync direction in the SyncPreviewModal.
 *  Drives dispatch in main.ts → runSyncFromChoice. */
export type SyncChoice =
	| "smart-merge"
	| "pull-all-delete-local"
	| "pull-all-keep-local"
	| "push-all-delete-remote"
	| "push-all-keep-remote"
	| "cancel"
	| "change-vault";

/** Subset of SyncChoice values that delete data on either side. Used by the
 *  modal to gate behind the typed-DELETE confirm view. */
export const DESTRUCTIVE_CHOICES = new Set<SyncChoice>([
	"pull-all-delete-local",
	"push-all-delete-remote",
]);
```

- [ ] **Step 1.2: Type-check**

Run:

```bash
bun run build
```

Expected: clean compile (no test changes yet — these are just type additions).

- [ ] **Step 1.3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add SyncChoice + DESTRUCTIVE_CHOICES"
```

---

## Task 2: Create `src/sync-plan-format.ts` with pure helpers

**Files:**
- Create: `src/sync-plan-format.ts`
- Create: `tests/sync-plan-format.test.ts`

This task migrates `isPlanEmpty` and `formatPlanSummary` from `pre-sync-modal.ts` (don't delete the originals yet — Task 10 does that, once all consumers are switched) and adds three new helpers needed by the modal.

- [ ] **Step 2.1: Write failing tests**

Create `tests/sync-plan-format.test.ts` with the following content. Note: the existing `formatPlanSummary` returns a single newline-joined string; we keep the same shape so the migrated tests continue to assert on `lines` (which is named `lines` historically but is a single string — kept for parity).

```ts
import { describe, expect, test } from "bun:test";
import {
	computeMatchPercent,
	formatPlanSummary,
	isDestructiveChoice,
	isPlanEmpty,
	optionBreakdown,
	samplePaths,
} from "../src/sync-plan-format";
import type { SyncPlan } from "../src/types";

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
	return {
		vaultName: "Personal Notes",
		serverNoteCount: 198,
		localNoteCount: 234,
		localAttachmentCount: 12,
		toPush: { notes: [], attachments: [] },
		toPull: { notes: [], attachments: [] },
		conflicts: [],
		toDeleteLocal: [],
		toDeleteRemote: [],
		...overrides,
	};
}

describe("isPlanEmpty", () => {
	test("empty plan is empty", () => {
		expect(isPlanEmpty(makePlan())).toBe(true);
	});
	test("plan with pushes is not empty", () => {
		expect(isPlanEmpty(makePlan({ toPush: { notes: ["a.md"], attachments: [] } }))).toBe(false);
	});
	test("plan with deletions is not empty", () => {
		expect(isPlanEmpty(makePlan({ toDeleteLocal: ["a.md"] }))).toBe(false);
	});
});

describe("formatPlanSummary", () => {
	test("shows vault name + server/local counts", () => {
		const lines = formatPlanSummary(makePlan());
		expect(lines).toContain("Vault: Personal Notes");
		expect(lines).toContain("Server: 198 notes · Local: 234 notes");
	});
	test("pluralizes correctly", () => {
		const one = makePlan({ toPush: { notes: ["a.md"], attachments: [] } });
		const many = makePlan({ toPush: { notes: ["a.md", "b.md"], attachments: [] } });
		expect(formatPlanSummary(one)).toContain("1 note to push");
		expect(formatPlanSummary(many)).toContain("2 notes to push");
	});
});

describe("computeMatchPercent", () => {
	test("returns 100 when local and remote are empty", () => {
		expect(computeMatchPercent(makePlan({ localNoteCount: 0, serverNoteCount: 0 }))).toBe(100);
	});
	test("returns 0 when nothing overlaps", () => {
		const plan = makePlan({
			localNoteCount: 5,
			serverNoteCount: 5,
			toPush: { notes: ["a.md", "b.md", "c.md", "d.md", "e.md"], attachments: [] },
			toPull: { notes: ["v.md", "w.md", "x.md", "y.md", "z.md"], attachments: [] },
		});
		expect(computeMatchPercent(plan)).toBe(0);
	});
	test("computes |intersection| / |union| over note paths", () => {
		// 3 local notes total, 2 remote-only (toPull), 1 local-only (toPush), 1 in
		// both (it's not in toPush or toPull → already in sync).
		// local: total 2 = {shared.md, only-local.md}
		// remote: total 3 = {shared.md, only-remote-a.md, only-remote-b.md}
		// intersection = 1, union = 4 → 25%
		const plan = makePlan({
			localNoteCount: 2,
			serverNoteCount: 3,
			toPush: { notes: ["only-local.md"], attachments: [] },
			toPull: { notes: ["only-remote-a.md", "only-remote-b.md"], attachments: [] },
		});
		expect(computeMatchPercent(plan)).toBe(25);
	});
});

describe("samplePaths", () => {
	test("returns first N paths", () => {
		const paths = ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md", "g.md"];
		expect(samplePaths(paths, 3)).toEqual(["a.md", "b.md", "c.md"]);
	});
	test("returns all paths when fewer than N", () => {
		expect(samplePaths(["a.md", "b.md"], 5)).toEqual(["a.md", "b.md"]);
	});
	test("returns empty array for empty input", () => {
		expect(samplePaths([], 5)).toEqual([]);
	});
});

describe("isDestructiveChoice", () => {
	test("pull-all-delete-local is destructive", () => {
		expect(isDestructiveChoice("pull-all-delete-local")).toBe(true);
	});
	test("push-all-delete-remote is destructive", () => {
		expect(isDestructiveChoice("push-all-delete-remote")).toBe(true);
	});
	test("smart-merge is not destructive", () => {
		expect(isDestructiveChoice("smart-merge")).toBe(false);
	});
	test("cancel is not destructive", () => {
		expect(isDestructiveChoice("cancel")).toBe(false);
	});
});

describe("optionBreakdown", () => {
	const plan = makePlan({
		localNoteCount: 5,
		serverNoteCount: 4,
		toPush: { notes: ["a.md", "b.md"], attachments: ["pic.png"] },
		toPull: { notes: ["x.md"], attachments: [] },
		conflicts: ["dup.md"],
		toDeleteLocal: ["gone-on-server.md"],
		toDeleteRemote: [],
	});

	test("smart-merge: counts merge actions, no deletions", () => {
		const b = optionBreakdown(plan, "smart-merge");
		expect(b.pullCount).toBe(1);
		expect(b.pushCount).toBe(2);
		expect(b.conflictCount).toBe(1);
		expect(b.deleteLocalCount).toBe(0);
		expect(b.deleteRemoteCount).toBe(0);
	});

	test("pull-all-delete-local: pulls all remote (notes+attachments), deletes local-only", () => {
		const b = optionBreakdown(plan, "pull-all-delete-local");
		// pull = every remote note + attachment, regardless of toPull bucket
		expect(b.pullCount).toBe(4); // serverNoteCount
		// deleteLocalCount = local-only notes (toPush bucket includes them) + locally-deleted-on-server still-present locally
		// Local-only paths: those in toPush (a.md, b.md). Plus conflicts get overwritten (dup.md).
		expect(b.deleteLocalCount).toBe(2);
		expect(b.deleteRemoteCount).toBe(0);
		expect(b.pushCount).toBe(0);
	});

	test("pull-all-keep-local: pulls all remote, no deletions", () => {
		const b = optionBreakdown(plan, "pull-all-keep-local");
		expect(b.pullCount).toBe(4);
		expect(b.deleteLocalCount).toBe(0);
		expect(b.deleteRemoteCount).toBe(0);
		expect(b.pushCount).toBe(0);
	});

	test("push-all-delete-remote: pushes all local, deletes remote-only", () => {
		const b = optionBreakdown(plan, "push-all-delete-remote");
		expect(b.pushCount).toBe(5);
		// remote-only = remote paths not in local. toPull contains those.
		expect(b.deleteRemoteCount).toBe(1);
		expect(b.deleteLocalCount).toBe(0);
		expect(b.pullCount).toBe(0);
	});

	test("push-all-keep-remote: pushes all local, no deletions", () => {
		const b = optionBreakdown(plan, "push-all-keep-remote");
		expect(b.pushCount).toBe(5);
		expect(b.deleteRemoteCount).toBe(0);
		expect(b.deleteLocalCount).toBe(0);
		expect(b.pullCount).toBe(0);
	});

	test("includes sample paths for the destructive bucket", () => {
		const big = makePlan({
			toPush: {
				notes: ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md", "g.md"],
				attachments: [],
			},
		});
		const b = optionBreakdown(big, "pull-all-delete-local");
		expect(b.samplePaths).toEqual(["a.md", "b.md", "c.md", "d.md", "e.md"]);
	});
});
```

- [ ] **Step 2.2: Run tests, verify they fail**

```bash
bun test tests/sync-plan-format.test.ts
```

Expected: module-not-found errors for `../src/sync-plan-format`.

- [ ] **Step 2.3: Create the implementation**

Create `src/sync-plan-format.ts`:

```ts
import type { SyncChoice, SyncPlan } from "./types";
import { DESTRUCTIVE_CHOICES } from "./types";

function plural(count: number, singular: string): string {
	return count === 1 ? `${count} ${singular}` : `${count} ${singular}s`;
}

/** True when the plan has nothing for the engine to do. */
export function isPlanEmpty(plan: SyncPlan): boolean {
	return (
		plan.toPush.notes.length === 0 &&
		plan.toPush.attachments.length === 0 &&
		plan.toPull.notes.length === 0 &&
		plan.toPull.attachments.length === 0 &&
		plan.conflicts.length === 0 &&
		plan.toDeleteLocal.length === 0 &&
		plan.toDeleteRemote.length === 0
	);
}

/** Single-string newline-joined summary. Kept for compatibility with the
 *  prior text-based modal renderer and any callers that log the summary. */
export function formatPlanSummary(plan: SyncPlan): string {
	const lines: string[] = [];
	lines.push(`Vault: ${plan.vaultName}`);
	lines.push(`Server: ${plan.serverNoteCount} notes · Local: ${plan.localNoteCount} notes`);
	lines.push("");
	lines.push(`↑  ${plural(plan.toPush.notes.length, "note")} to push`);
	lines.push(`↓  ${plural(plan.toPull.notes.length, "note")} to pull`);
	lines.push(`⚡  ${plural(plan.conflicts.length, "conflict")}`);
	const totalDeletes = plan.toDeleteLocal.length + plan.toDeleteRemote.length;
	lines.push(`✕  ${plural(totalDeletes, "deletion")}`);

	if (plan.toPush.attachments.length > 0 || plan.toPull.attachments.length > 0) {
		lines.push("");
		if (plan.toPush.attachments.length > 0) {
			lines.push(`↑  ${plural(plan.toPush.attachments.length, "attachment")} to push`);
		}
		if (plan.toPull.attachments.length > 0) {
			lines.push(`↓  ${plural(plan.toPull.attachments.length, "attachment")} to pull`);
		}
	}

	return lines.join("\n");
}

/** Returns 0–100. |local ∩ remote| / |local ∪ remote| over note paths only.
 *  Empty-empty is defined as 100 (vacuously a perfect match). */
export function computeMatchPercent(plan: SyncPlan): number {
	const local = plan.localNoteCount;
	const remote = plan.serverNoteCount;
	if (local === 0 && remote === 0) return 100;

	// toPush.notes = local-only notes (not yet on server).
	// toPull.notes = remote-only or remote-newer notes. Some of these paths may
	// exist locally too (content-different). Approximation: treat toPull paths
	// as either local+remote (already exists locally, just out of date) or
	// remote-only. For path-overlap purposes only "remote-only" matters.
	// We model it as: remote-only count = max(0, remote - (local - localOnly))
	// which simplifies to remote-only count = max(0, remote - localShared),
	// where localShared = local - toPush.notes.length.
	const localOnly = plan.toPush.notes.length;
	const localShared = Math.max(0, local - localOnly);
	const remoteOnly = Math.max(0, remote - localShared);
	const intersection = Math.min(localShared, remote);
	const union = local + remoteOnly;

	if (union === 0) return 100;
	return Math.round((intersection / union) * 100);
}

/** First `limit` entries — useful for "sample of paths about to be deleted". */
export function samplePaths(paths: string[], limit: number): string[] {
	return paths.slice(0, limit);
}

/** True for choices that bulk-delete data on either side. Drives the
 *  typed-DELETE confirm gate in the modal. */
export function isDestructiveChoice(choice: SyncChoice): boolean {
	return DESTRUCTIVE_CHOICES.has(choice);
}

export interface OptionBreakdown {
	/** Total notes + attachments to pull from server. */
	pullCount: number;
	/** Total notes + attachments to push to server. */
	pushCount: number;
	/** Conflicts that will go through 3-way merge (smart-merge only). */
	conflictCount: number;
	/** Local files that will be deleted as a side effect. */
	deleteLocalCount: number;
	/** Remote files that will be deleted as a side effect. */
	deleteRemoteCount: number;
	/** First 5 paths from the relevant bucket — for the "Sample paths" disclosure. */
	samplePaths: string[];
}

/** Per-option preview math. Derives action counts and a sample path list from
 *  a single SyncPlan so each option card in the modal can render its own
 *  numbers without the caller re-deriving them. */
export function optionBreakdown(plan: SyncPlan, choice: SyncChoice): OptionBreakdown {
	switch (choice) {
		case "smart-merge":
			return {
				pullCount: plan.toPull.notes.length + plan.toPull.attachments.length,
				pushCount: plan.toPush.notes.length + plan.toPush.attachments.length,
				conflictCount: plan.conflicts.length,
				deleteLocalCount: plan.toDeleteLocal.length,
				deleteRemoteCount: plan.toDeleteRemote.length,
				samplePaths: samplePaths(plan.conflicts, 5),
			};

		case "pull-all-delete-local": {
			// Pull every remote file. Delete every local file that has no remote
			// counterpart — i.e. paths in toPush (local-only).
			const localOnly = plan.toPush.notes.concat(plan.toPush.attachments);
			return {
				pullCount: plan.serverNoteCount + countServerAttachments(plan),
				pushCount: 0,
				conflictCount: 0,
				deleteLocalCount: localOnly.length,
				deleteRemoteCount: 0,
				samplePaths: samplePaths(localOnly, 5),
			};
		}

		case "pull-all-keep-local":
			return {
				pullCount: plan.serverNoteCount + countServerAttachments(plan),
				pushCount: 0,
				conflictCount: 0,
				deleteLocalCount: 0,
				deleteRemoteCount: 0,
				samplePaths: samplePaths(plan.toPull.notes, 5),
			};

		case "push-all-delete-remote": {
			// Push every local file. Delete every remote file with no local
			// counterpart — i.e. paths in toPull (remote-only or remote-newer).
			// For preview purposes we count toPull as the "remote-only" estimate.
			const remoteOnly = plan.toPull.notes.concat(plan.toPull.attachments);
			return {
				pullCount: 0,
				pushCount: plan.localNoteCount + plan.localAttachmentCount,
				conflictCount: 0,
				deleteLocalCount: 0,
				deleteRemoteCount: remoteOnly.length,
				samplePaths: samplePaths(remoteOnly, 5),
			};
		}

		case "push-all-keep-remote":
			return {
				pullCount: 0,
				pushCount: plan.localNoteCount + plan.localAttachmentCount,
				conflictCount: 0,
				deleteLocalCount: 0,
				deleteRemoteCount: 0,
				samplePaths: samplePaths(plan.toPush.notes, 5),
			};

		case "cancel":
		case "change-vault":
			return {
				pullCount: 0,
				pushCount: 0,
				conflictCount: 0,
				deleteLocalCount: 0,
				deleteRemoteCount: 0,
				samplePaths: [],
			};
	}
}

/** SyncPlan doesn't carry a serverAttachmentCount field (the backend manifest
 *  doesn't always populate it). Best estimate: localAttachmentCount minus the
 *  attachments we'd push, plus the ones we'd pull. Treats absent data
 *  conservatively. */
function countServerAttachments(plan: SyncPlan): number {
	const localOnlyAttach = plan.toPush.attachments.length;
	const sharedAttach = Math.max(0, plan.localAttachmentCount - localOnlyAttach);
	return sharedAttach + plan.toPull.attachments.length;
}
```

- [ ] **Step 2.4: Run tests, verify they pass**

```bash
bun test tests/sync-plan-format.test.ts
```

Expected: all green (24 assertions across the test file).

- [ ] **Step 2.5: Run full test suite — ensure no regressions**

```bash
bun test
```

Expected: 757+ tests pass (the existing `pre-sync-modal.test.ts` still passes — we haven't touched it).

- [ ] **Step 2.6: Commit**

```bash
git add src/sync-plan-format.ts tests/sync-plan-format.test.ts
git commit -m "feat(sync): sync-plan-format helpers for preview modal"
```

---

## Task 3: Extend `SyncEngine.pushAll()` with `deleteRemoteExtras` opt

**Files:**
- Modify: `src/sync.ts:1915` (existing `pushAll` signature)
- Modify: `tests/sync.test.ts` (add new cases)

- [ ] **Step 3.1: Write failing tests**

Append to `tests/sync.test.ts` (find an existing `describe("pushAll", ...)` block if present and add inside; otherwise add a new top-level describe block at the end of the file before any `// EOF` marker):

```ts
describe("pushAll with deleteRemoteExtras", () => {
	test("keep-remote mode: pushes all local, never calls deleteNote", async () => {
		const engine = newEngine(); // existing test helper, mirrors how other pushAll tests build
		const local = [makeTFile("kept.md"), makeTFile("also.md")];
		mockApp.vault.getFiles.mockReturnValue(local);
		mockApp.vault.cachedRead.mockResolvedValue("# Content");
		// Server has an extra file the user wants kept untouched
		(mockApi.getManifest as jest.Mock).mockResolvedValue({
			notes: [{ path: "kept.md" }, { path: "also.md" }, { path: "remote-only.md" }],
			attachments: [],
		});

		await engine.pushAll({ deleteRemoteExtras: false });

		expect(mockApi.pushNote).toHaveBeenCalledTimes(2);
		expect(mockApi.deleteNote).not.toHaveBeenCalled();
	});

	test("delete-remote mode: pushes all local AND deletes remote-only paths", async () => {
		const engine = newEngine();
		const local = [makeTFile("kept.md")];
		mockApp.vault.getFiles.mockReturnValue(local);
		mockApp.vault.cachedRead.mockResolvedValue("# Content");
		(mockApi.getManifest as jest.Mock).mockResolvedValue({
			notes: [{ path: "kept.md" }, { path: "remote-only-a.md" }, { path: "remote-only-b.md" }],
			attachments: [{ path: "old.png" }],
		});

		await engine.pushAll({ deleteRemoteExtras: true });

		expect(mockApi.pushNote).toHaveBeenCalledTimes(1);
		expect(mockApi.deleteNote).toHaveBeenCalledTimes(2);
		expect(mockApi.deleteNote).toHaveBeenCalledWith("remote-only-a.md");
		expect(mockApi.deleteNote).toHaveBeenCalledWith("remote-only-b.md");
		expect(mockApi.deleteAttachment).toHaveBeenCalledTimes(1);
		expect(mockApi.deleteAttachment).toHaveBeenCalledWith("old.png");
	});

	test("backward compat: no opts = no deletions", async () => {
		const engine = newEngine();
		mockApp.vault.getFiles.mockReturnValue([makeTFile("a.md")]);
		mockApp.vault.cachedRead.mockResolvedValue("# x");
		(mockApi.getManifest as jest.Mock).mockResolvedValue({
			notes: [{ path: "a.md" }, { path: "remote.md" }],
			attachments: [],
		});

		await engine.pushAll(); // no args

		expect(mockApi.deleteNote).not.toHaveBeenCalled();
	});
});
```

Adjust `newEngine()` / `makeTFile()` to match whatever helpers `tests/sync.test.ts` already uses. Look at the existing `describe("pushAll", ...)` block (search `pushAll` in that file) and copy the setup pattern. Do NOT invent new helpers.

- [ ] **Step 3.2: Run tests, verify they fail**

```bash
bun test tests/sync.test.ts -t "deleteRemoteExtras"
```

Expected: 3 failures — `pushAll` doesn't accept opts yet, `deleteNote`/`deleteAttachment` not called.

- [ ] **Step 3.3: Update `pushAll` signature + body**

In `src/sync.ts`, replace the `pushAll` declaration around line 1915 with:

```ts
/** Push every local syncable file to the server.
 *
 *  @param opts.deleteRemoteExtras — if true, also delete any remote note or
 *    attachment that has no local counterpart. Used by the "Push all + delete
 *    remote extras" sync direction. Defaults to false (preserves existing
 *    behavior for callers that haven't migrated).
 */
async pushAll(opts: { deleteRemoteExtras?: boolean } = {}): Promise<number> {
```

After the existing post-push reconciliation block (where `await this.saveData({ lastSync: this.lastSync });` lands today), insert:

```ts
		// Delete remote-only files if the caller asked for it. Runs AFTER the
		// reconcile pass so any divergent remote rows are fixed via push first
		// and the manifest reflects the post-push state.
		if (opts.deleteRemoteExtras) {
			await this.deleteRemoteExtras();
		}
```

Then add a new private method below `pushAll` (still inside the `SyncEngine` class):

```ts
	/** Delete every remote note + attachment whose path is not present locally.
	 *  Called only when the user has explicitly picked "Push all + delete remote
	 *  extras" — we trust the path comparison; no extra confirmation here. */
	private async deleteRemoteExtras(): Promise<void> {
		const manifest = await this.api.getManifest();
		if (!manifest) {
			rlog().warn("push", "deleteRemoteExtras skipped — backend has no /sync/manifest");
			return;
		}
		const localFiles = this.app.vault.getFiles();
		const localPaths = new Set(
			localFiles
				.filter((f) => this.isSyncable(f) && !this.shouldIgnore(f.path))
				.map((f) => f.path),
		);

		const remoteOnlyNotes = manifest.notes
			.map((n) => n.path)
			.filter((p) => !localPaths.has(p));
		const remoteOnlyAttachments = manifest.attachments
			.map((a) => a.path)
			.filter((p) => !localPaths.has(p));

		rlog().info(
			"push",
			`deleteRemoteExtras — ${remoteOnlyNotes.length} notes, ${remoteOnlyAttachments.length} attachments`,
		);

		for (const path of remoteOnlyNotes) {
			try {
				await this.api.deleteNote(path);
				this.logEntry("delete", path, "ok", undefined, "remote-extras");
			} catch (e) {
				this.logEntry("delete", path, "error", errMsg(e));
			}
		}
		for (const path of remoteOnlyAttachments) {
			try {
				await this.api.deleteAttachment(path);
				this.logEntry("delete", path, "ok", undefined, "remote-extras");
			} catch (e) {
				this.logEntry("delete", path, "error", errMsg(e));
			}
		}
	}
```

- [ ] **Step 3.4: Run tests, verify they pass**

```bash
bun test tests/sync.test.ts -t "deleteRemoteExtras"
```

Expected: all 3 pass.

- [ ] **Step 3.5: Run full test suite**

```bash
bun test
```

Expected: all pass. The optional `opts` argument means existing callers (`pushAll()` with no args) still work.

- [ ] **Step 3.6: Commit**

```bash
git add src/sync.ts tests/sync.test.ts
git commit -m "feat(sync): pushAll opt to delete remote extras"
```

---

## Task 4: Extend `SyncEngine.pullAll()` with `deleteLocalExtras` opt

**Files:**
- Modify: `src/sync.ts:885-895` (existing `pullAll` + `wipePullAll` + `_pullAll`)
- Modify: `tests/sync.test.ts`

- [ ] **Step 4.1: Write failing tests**

Append to `tests/sync.test.ts`:

```ts
describe("pullAll with deleteLocalExtras", () => {
	test("keep-local mode: pulls remote, never trashes local files", async () => {
		const engine = newEngine();
		mockApp.vault.getFiles.mockReturnValue([makeTFile("local-only.md")]);
		mockApi.getChanges.mockResolvedValue({
			changes: [{ path: "remote.md", content: "# remote", deleted: false, version: 1 }],
			latest_updated_at: "2026-01-01T00:00:00Z",
		});
		mockApi.getAttachmentChanges.mockResolvedValue({ changes: [], latest_updated_at: "..." });

		await engine.pullAll({ deleteLocalExtras: false });

		expect(mockApp.fileManager.trashFile).not.toHaveBeenCalled();
	});

	test("delete-local mode: trashes local-only files after pull", async () => {
		const engine = newEngine();
		const localOnly = makeTFile("local-only.md");
		mockApp.vault.getFiles.mockReturnValue([localOnly]);
		mockApi.getChanges.mockResolvedValue({
			changes: [{ path: "remote.md", content: "# remote", deleted: false, version: 1 }],
			latest_updated_at: "2026-01-01T00:00:00Z",
		});
		mockApi.getAttachmentChanges.mockResolvedValue({ changes: [], latest_updated_at: "..." });

		await engine.pullAll({ deleteLocalExtras: true });

		expect(mockApp.fileManager.trashFile).toHaveBeenCalledTimes(1);
		expect(mockApp.fileManager.trashFile).toHaveBeenCalledWith(localOnly);
	});

	test("legacy wipePullAll still works (back-compat wrapper)", async () => {
		const engine = newEngine();
		mockApp.vault.getFiles.mockReturnValue([makeTFile("wipe-me.md")]);
		mockApi.getChanges.mockResolvedValue({ changes: [], latest_updated_at: "..." });
		mockApi.getAttachmentChanges.mockResolvedValue({ changes: [], latest_updated_at: "..." });

		await engine.wipePullAll();

		expect(mockApp.fileManager.trashFile).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 4.2: Run tests, verify they fail**

```bash
bun test tests/sync.test.ts -t "deleteLocalExtras"
```

Expected: 2 failures (the legacy `wipePullAll` test already passes — keep it for the back-compat assertion).

- [ ] **Step 4.3: Update `pullAll` to accept opts; keep `wipePullAll` as wrapper**

In `src/sync.ts`, replace the block at lines 885–895 with:

```ts
	/** Force-pull every note + attachment from the server.
	 *
	 *  @param opts.deleteLocalExtras — if true, wipe local files that have no
	 *    remote counterpart before pulling. The legacy `wipePullAll()` is a
	 *    thin wrapper for this — kept for one release cycle so existing
	 *    callers (Sync Center) don't need to change in the same PR.
	 */
	async pullAll(opts: { deleteLocalExtras?: boolean } = {}): Promise<number> {
		return this._pullAll(opts.deleteLocalExtras ?? false);
	}

	/** Deprecated alias for `pullAll({ deleteLocalExtras: true })`. Remove
	 *  after the Sync Center handler in `sync-center-render.ts` is migrated
	 *  to the new modal (Task 8). */
	async wipePullAll(): Promise<number> {
		return this._pullAll(true);
	}
```

The private `_pullAll(wipe: boolean)` body is unchanged — `deleteLocalExtras` and `wipe` mean exactly the same thing for the engine.

- [ ] **Step 4.4: Run tests, verify they pass**

```bash
bun test tests/sync.test.ts -t "deleteLocalExtras"
bun test tests/sync.test.ts -t "wipePullAll"
```

Expected: all green.

- [ ] **Step 4.5: Run full test suite**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 4.6: Commit**

```bash
git add src/sync.ts tests/sync.test.ts
git commit -m "feat(sync): pullAll opt to delete local extras"
```

---

## Task 5: Create `SyncPreviewState` + `SyncPreviewModal`

**Files:**
- Create: `src/sync-preview-modal.ts`
- Create: `tests/sync-preview-modal.test.ts`

The modal is split into two cooperating pieces:

- `SyncPreviewState` — pure class. Holds the current view ("preview" vs "confirm"), the pending destructive choice, the typed input, and the resolve function. Exposes `pickOption(choice)`, `submitConfirm()`, `typeConfirm(input)`, `goBack()`, `cancel()`. Tests cover this class directly.
- `SyncPreviewModal` — `Modal` subclass. Owns the DOM and delegates state transitions to `SyncPreviewState`. Re-renders the body whenever state changes. No business logic in the DOM layer.

- [ ] **Step 5.1: Write failing tests for `SyncPreviewState`**

Create `tests/sync-preview-modal.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SyncPreviewState } from "../src/sync-preview-modal";
import type { SyncChoice, SyncPlan } from "../src/types";

function makePlan(overrides: Partial<SyncPlan> = {}): SyncPlan {
	return {
		vaultName: "Test Vault",
		serverNoteCount: 100,
		localNoteCount: 80,
		localAttachmentCount: 0,
		toPush: { notes: [], attachments: [] },
		toPull: { notes: [], attachments: [] },
		conflicts: [],
		toDeleteLocal: [],
		toDeleteRemote: [],
		...overrides,
	};
}

function newState(plan = makePlan()): {
	state: SyncPreviewState;
	resolved: { value: SyncChoice | null };
} {
	const resolved = { value: null as SyncChoice | null };
	const state = new SyncPreviewState(plan, (choice) => {
		resolved.value = choice;
	});
	return { state, resolved };
}

describe("SyncPreviewState — non-destructive choices", () => {
	test("smart-merge resolves immediately", () => {
		const { state, resolved } = newState();
		state.pickOption("smart-merge");
		expect(resolved.value).toBe("smart-merge");
		expect(state.view).toBe("done");
	});

	test("pull-all-keep-local resolves immediately", () => {
		const { state, resolved } = newState();
		state.pickOption("pull-all-keep-local");
		expect(resolved.value).toBe("pull-all-keep-local");
	});

	test("push-all-keep-remote resolves immediately", () => {
		const { state, resolved } = newState();
		state.pickOption("push-all-keep-remote");
		expect(resolved.value).toBe("push-all-keep-remote");
	});

	test("cancel resolves with cancel", () => {
		const { state, resolved } = newState();
		state.cancel();
		expect(resolved.value).toBe("cancel");
	});

	test("change-vault resolves with change-vault", () => {
		const { state, resolved } = newState();
		state.changeVault();
		expect(resolved.value).toBe("change-vault");
	});
});

describe("SyncPreviewState — destructive choices route through confirm view", () => {
	test("pull-all-delete-local swaps to confirm view, does not resolve", () => {
		const { state, resolved } = newState();
		state.pickOption("pull-all-delete-local");
		expect(state.view).toBe("confirm");
		expect(state.pendingChoice).toBe("pull-all-delete-local");
		expect(resolved.value).toBeNull();
	});

	test("push-all-delete-remote swaps to confirm view", () => {
		const { state, resolved } = newState();
		state.pickOption("push-all-delete-remote");
		expect(state.view).toBe("confirm");
		expect(resolved.value).toBeNull();
	});

	test("confirm button disabled until input matches DELETE exactly", () => {
		const { state } = newState();
		state.pickOption("pull-all-delete-local");
		expect(state.canSubmitConfirm()).toBe(false);

		state.typeConfirm("delete");
		expect(state.canSubmitConfirm()).toBe(false); // case-sensitive

		state.typeConfirm("DELETE ");
		expect(state.canSubmitConfirm()).toBe(false); // trailing space rejected

		state.typeConfirm("DELETE");
		expect(state.canSubmitConfirm()).toBe(true);
	});

	test("submitConfirm resolves with the pending destructive choice", () => {
		const { state, resolved } = newState();
		state.pickOption("pull-all-delete-local");
		state.typeConfirm("DELETE");
		state.submitConfirm();
		expect(resolved.value).toBe("pull-all-delete-local");
	});

	test("submitConfirm is a no-op until canSubmitConfirm is true", () => {
		const { state, resolved } = newState();
		state.pickOption("push-all-delete-remote");
		state.typeConfirm("nope");
		state.submitConfirm();
		expect(resolved.value).toBeNull();
		expect(state.view).toBe("confirm");
	});

	test("goBack returns to preview view without resolving", () => {
		const { state, resolved } = newState();
		state.pickOption("pull-all-delete-local");
		state.typeConfirm("DELETE");
		state.goBack();
		expect(state.view).toBe("preview");
		expect(state.pendingChoice).toBeNull();
		expect(state.confirmInput).toBe("");
		expect(resolved.value).toBeNull();
	});
});

describe("SyncPreviewState — multiple resolutions ignored", () => {
	test("once resolved, subsequent calls are no-ops", () => {
		const { state, resolved } = newState();
		state.pickOption("smart-merge");
		state.pickOption("cancel");
		state.cancel();
		expect(resolved.value).toBe("smart-merge");
	});
});
```

- [ ] **Step 5.2: Run tests, verify they fail**

```bash
bun test tests/sync-preview-modal.test.ts
```

Expected: module-not-found error.

- [ ] **Step 5.3: Create `src/sync-preview-modal.ts`**

```ts
import { type App, Modal } from "obsidian";
import {
	computeMatchPercent,
	isDestructiveChoice,
	isPlanEmpty,
	optionBreakdown,
} from "./sync-plan-format";
import type { SyncChoice, SyncPlan } from "./types";

/** Pure state machine for the SyncPreviewModal. Owns view + input state and
 *  the resolve callback. Tested directly; the Modal class is a thin DOM
 *  wrapper that delegates to it. */
export class SyncPreviewState {
	view: "preview" | "confirm" | "done" = "preview";
	pendingChoice: SyncChoice | null = null;
	confirmInput = "";
	private resolved = false;

	constructor(
		readonly plan: SyncPlan,
		private readonly onResolve: (choice: SyncChoice) => void,
	) {}

	pickOption(choice: SyncChoice): void {
		if (this.resolved) return;
		if (isDestructiveChoice(choice)) {
			this.pendingChoice = choice;
			this.view = "confirm";
			this.confirmInput = "";
			return;
		}
		this.resolve(choice);
	}

	typeConfirm(input: string): void {
		if (this.resolved || this.view !== "confirm") return;
		this.confirmInput = input;
	}

	canSubmitConfirm(): boolean {
		return this.view === "confirm" && this.confirmInput === "DELETE";
	}

	submitConfirm(): void {
		if (!this.canSubmitConfirm() || this.pendingChoice == null) return;
		this.resolve(this.pendingChoice);
	}

	goBack(): void {
		if (this.resolved) return;
		this.view = "preview";
		this.pendingChoice = null;
		this.confirmInput = "";
	}

	cancel(): void {
		this.resolve("cancel");
	}

	changeVault(): void {
		this.resolve("change-vault");
	}

	private resolve(choice: SyncChoice): void {
		if (this.resolved) return;
		this.resolved = true;
		this.view = "done";
		this.onResolve(choice);
	}
}

const OPTION_CARDS: Array<{
	choice: SyncChoice;
	label: string;
	subtitle: (plan: SyncPlan) => string;
	cssClass: string;
}> = [
	{
		choice: "smart-merge",
		label: "Smart merge (recommended)",
		subtitle: (plan) => {
			const b = optionBreakdown(plan, "smart-merge");
			return `Pull ${b.pullCount}, push ${b.pushCount}, merge ${b.conflictCount} conflicts`;
		},
		cssClass: "engram-sync-preview-option mod-cta",
	},
	{
		choice: "pull-all-delete-local",
		label: "Pull all + delete local extras",
		subtitle: (plan) => {
			const b = optionBreakdown(plan, "pull-all-delete-local");
			return `Download ${b.pullCount}, delete ${b.deleteLocalCount} local`;
		},
		cssClass: "engram-sync-preview-option engram-sync-preview-destructive",
	},
	{
		choice: "pull-all-keep-local",
		label: "Pull all + keep local extras",
		subtitle: (plan) => {
			const b = optionBreakdown(plan, "pull-all-keep-local");
			return `Download ${b.pullCount}, keep all local`;
		},
		cssClass: "engram-sync-preview-option",
	},
	{
		choice: "push-all-delete-remote",
		label: "Push all + delete remote extras",
		subtitle: (plan) => {
			const b = optionBreakdown(plan, "push-all-delete-remote");
			return `Upload ${b.pushCount}, delete ${b.deleteRemoteCount} remote`;
		},
		cssClass: "engram-sync-preview-option engram-sync-preview-destructive",
	},
	{
		choice: "push-all-keep-remote",
		label: "Push all + keep remote extras",
		subtitle: (plan) => {
			const b = optionBreakdown(plan, "push-all-keep-remote");
			return `Upload ${b.pushCount}, keep all remote`;
		},
		cssClass: "engram-sync-preview-option",
	},
];

export interface SyncPreviewOptions {
	/** Server URL string for the identity strip. */
	serverUrl: string;
	/** When true the footer shows a "Change vault" button. Off for triggers
	 *  outside the vault picker (e.g. Sync Center). */
	showChangeVault: boolean;
}

export class SyncPreviewModal extends Modal {
	private state: SyncPreviewState;

	constructor(
		app: App,
		private readonly plan: SyncPlan,
		private readonly opts: SyncPreviewOptions,
	) {
		super(app);
		this.state = new SyncPreviewState(plan, (choice) => {
			this.resolvedChoice = choice;
			this.close();
		});
	}

	private resolvedChoice: SyncChoice | null = null;
	private resolveFn: ((c: SyncChoice) => void) | null = null;

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		// Defensive: if the user dismisses via Esc/backdrop before picking,
		// treat that as a cancel.
		const resolve = this.resolveFn;
		this.resolveFn = null;
		this.contentEl.empty();
		if (resolve) resolve(this.resolvedChoice ?? "cancel");
	}

	awaitChoice(): Promise<SyncChoice> {
		return new Promise((resolve) => {
			this.resolveFn = resolve;
			this.open();
		});
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("engram-sync-preview-modal");

		if (this.state.view === "preview") {
			this.renderPreview();
		} else {
			this.renderConfirm();
		}
	}

	private renderPreview(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Engram sync — preview" });

		const identity = contentEl.createDiv({ cls: "engram-sync-preview-identity" });
		identity.createEl("span", {
			text: `Vault: ${this.plan.vaultName}`,
			cls: "engram-sync-preview-vault-name",
		});
		identity.createEl("span", {
			text: ` → ${this.opts.serverUrl}`,
			cls: "engram-sync-preview-server-url",
		});

		const stats = contentEl.createDiv({ cls: "engram-sync-preview-stats" });
		stats.createEl("p", {
			text: `Local: ${this.plan.localNoteCount} notes · ${this.plan.localAttachmentCount} attachments`,
		});
		stats.createEl("p", {
			text: `Remote: ${this.plan.serverNoteCount} notes`,
		});
		stats.createEl("p", {
			text: `Match: ${computeMatchPercent(this.plan)}% · Conflicts: ${this.plan.conflicts.length}`,
		});

		if (isPlanEmpty(this.plan)) {
			contentEl.createEl("p", {
				cls: "engram-sync-preview-uptodate",
				text: "Everything is in sync. You can close this dialog.",
			});
		}

		const options = contentEl.createDiv({ cls: "engram-sync-preview-options" });
		for (const card of OPTION_CARDS) {
			this.renderOptionCard(options, card);
		}

		const footer = contentEl.createDiv({ cls: "engram-sync-preview-footer" });

		const cancelBtn = footer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.state.cancel());

		if (this.opts.showChangeVault) {
			const changeBtn = footer.createEl("button", { text: "Change vault" });
			changeBtn.addEventListener("click", () => this.state.changeVault());
		}
	}

	private renderOptionCard(
		parent: HTMLElement,
		card: (typeof OPTION_CARDS)[number],
	): void {
		const btn = parent.createEl("button", {
			text: card.label,
			cls: card.cssClass,
		});
		const subtitle = parent.createEl("p", {
			text: card.subtitle(this.plan),
			cls: "engram-sync-preview-option-subtitle",
		});
		// Sample paths disclosure
		const b = optionBreakdown(this.plan, card.choice);
		if (b.samplePaths.length > 0) {
			const details = parent.createEl("details", {
				cls: "engram-sync-preview-sample",
			});
			details.createEl("summary", { text: "Sample paths" });
			const ul = details.createEl("ul");
			for (const p of b.samplePaths) {
				ul.createEl("li", { text: p });
			}
		} else {
			subtitle.addClass("engram-sync-preview-no-sample");
		}
		btn.addEventListener("click", () => {
			this.state.pickOption(card.choice);
			this.render();
		});
	}

	private renderConfirm(): void {
		const { contentEl } = this;
		const choice = this.state.pendingChoice;
		if (choice == null) return; // defensive — shouldn't happen

		contentEl.createEl("h2", { text: "Confirm destructive sync" });

		const b = optionBreakdown(this.plan, choice);
		const summary = contentEl.createDiv({ cls: "engram-sync-preview-confirm-summary" });
		summary.createEl("p", { text: "You are about to:" });
		const ul = summary.createEl("ul");
		if (b.deleteLocalCount > 0) {
			ul.createEl("li", { text: `Delete ${b.deleteLocalCount} local files` });
		}
		if (b.deleteRemoteCount > 0) {
			ul.createEl("li", { text: `Delete ${b.deleteRemoteCount} remote files` });
		}
		if (b.pullCount > 0) {
			ul.createEl("li", { text: `Download ${b.pullCount} files from server` });
		}
		if (b.pushCount > 0) {
			ul.createEl("li", { text: `Upload ${b.pushCount} files to server` });
		}

		if (b.samplePaths.length > 0) {
			const sample = contentEl.createDiv({ cls: "engram-sync-preview-confirm-sample" });
			sample.createEl("p", { text: "Sample of what gets deleted:" });
			const sampleUl = sample.createEl("ul");
			for (const p of b.samplePaths) {
				sampleUl.createEl("li", { text: p });
			}
		}

		contentEl.createEl("p", {
			cls: "engram-sync-preview-warning",
			text: "This cannot be undone.",
		});
		contentEl.createEl("p", { text: "Type DELETE to confirm:" });

		const input = contentEl.createEl("input", {
			type: "text",
			cls: "engram-sync-preview-confirm-input",
		});
		input.addEventListener("input", () => {
			this.state.typeConfirm(input.value);
			confirmBtn.disabled = !this.state.canSubmitConfirm();
		});

		const footer = contentEl.createDiv({ cls: "engram-sync-preview-footer" });
		const backBtn = footer.createEl("button", { text: "Back" });
		backBtn.addEventListener("click", () => {
			this.state.goBack();
			this.render();
		});

		const confirmBtn = footer.createEl("button", {
			text: "Confirm",
			cls: "engram-sync-preview-confirm-btn",
		});
		confirmBtn.disabled = true;
		confirmBtn.addEventListener("click", () => this.state.submitConfirm());

		input.focus();
	}
}
```

- [ ] **Step 5.4: Run tests, verify they pass**

```bash
bun test tests/sync-preview-modal.test.ts
```

Expected: all green.

- [ ] **Step 5.5: Run full test suite**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 5.6: Type-check**

```bash
bun run build
```

Expected: clean compile.

- [ ] **Step 5.7: Commit**

```bash
git add src/sync-preview-modal.ts tests/sync-preview-modal.test.ts
git commit -m "feat(ui): SyncPreviewModal + pure SyncPreviewState"
```

---

## Task 6: Add `EngramSyncPlugin.runSyncFromChoice(choice)`

**Files:**
- Modify: `src/main.ts` (add new public method)

This method takes a `SyncChoice` and dispatches to the right `SyncEngine` method. Centralizing the dispatch lets every trigger site (settings save, Sync Center) call the same code.

- [ ] **Step 6.1: Add the method to `EngramSyncPlugin`**

Insert into `src/main.ts` near the existing `doSyncWithFirstSyncCheck` method (let's say right before it):

```ts
	/** Dispatch a user's SyncChoice to the appropriate engine method.
	 *  Returns true if a sync ran (regardless of success); false if the choice
	 *  was a no-op (`cancel`, `change-vault`). Caller is responsible for the
	 *  side effects of `change-vault` (clearing vaultId + reopening the picker). */
	async runSyncFromChoice(choice: SyncChoice): Promise<boolean> {
		switch (choice) {
			case "cancel":
			case "change-vault":
				return false;

			case "smart-merge": {
				const { pulled, pushed } = await this.syncEngine.fullSync();
				new Notice(`Engram Sync: pulled ${pulled}, pushed ${pushed}`);
				return true;
			}

			case "pull-all-delete-local": {
				const pulled = await this.syncEngine.pullAll({ deleteLocalExtras: true });
				new Notice(`Engram Sync: pulled ${pulled} (local extras deleted)`);
				return true;
			}

			case "pull-all-keep-local": {
				const pulled = await this.syncEngine.pullAll({ deleteLocalExtras: false });
				new Notice(`Engram Sync: pulled ${pulled}`);
				return true;
			}

			case "push-all-delete-remote": {
				const pushed = await this.syncEngine.pushAll({ deleteRemoteExtras: true });
				new Notice(`Engram Sync: pushed ${pushed} (remote extras deleted)`);
				return true;
			}

			case "push-all-keep-remote": {
				const pushed = await this.syncEngine.pushAll({ deleteRemoteExtras: false });
				new Notice(`Engram Sync: pushed ${pushed}`);
				return true;
			}
		}
	}
```

Also add an import at the top of `src/main.ts`:

```ts
import type { SyncChoice } from "./types";
```

(If `types.ts` is already imported with other types, add `SyncChoice` to the existing import block instead of duplicating.)

- [ ] **Step 6.2: Type-check**

```bash
bun run build
```

Expected: clean compile. The switch is exhaustive over `SyncChoice` — TypeScript will fail this step if any case is missing.

- [ ] **Step 6.3: Run tests**

```bash
bun test
```

Expected: all pass — no test changes, just adding code.

- [ ] **Step 6.4: Commit**

```bash
git add src/main.ts
git commit -m "feat(plugin): runSyncFromChoice dispatcher"
```

---

## Task 7: Rewrite `doSyncWithFirstSyncCheck` to always use `SyncPreviewModal`

**Files:**
- Modify: `src/main.ts:635-670` (`doSyncWithFirstSyncCheck` body) and the imports

- [ ] **Step 7.1: Replace the method body**

Replace the existing `doSyncWithFirstSyncCheck` implementation with:

```ts
	/** Compute a sync plan and show SyncPreviewModal. Used after every
	 *  saveSettings once auth + vault are configured. Replaces the old
	 *  isFirstSync()-only branch — first-sync is now just one case of the
	 *  preview UX. */
	async doSyncWithFirstSyncCheck(): Promise<void> {
		try {
			const plan = await this.syncEngine.computeSyncPlan("full");
			const modal = new SyncPreviewModal(this.app, plan, {
				serverUrl: this.settings.apiUrl,
				showChangeVault: true,
			});
			const choice = await modal.awaitChoice();

			if (choice === "change-vault") {
				// Clear the vault selection and reopen the settings UI so the
				// vault picker dropdown is visible again. We deliberately do
				// NOT preselect a tab — the user landed in whichever tab they
				// were using and we want to keep them there.
				this.settings.vaultId = null;
				this.api.setVaultId(null);
				await this.savePluginData(this.syncEngine.getLastSync());
				const setting = (
					this.app as unknown as {
						setting: { open(): void; openTabById(id: string): void };
					}
				).setting;
				setting.open();
				setting.openTabById(this.manifest.id);
				return;
			}

			await this.runSyncFromChoice(choice);
		} catch (e) {
			// biome-ignore lint/suspicious/noConsole: error boundary
			console.error("Engram Sync: sync preview failed", e);
			new Notice("Engram sync: preview failed — check connection");
			rlog().error("lifecycle", `Sync preview failed: ${errMsg(e)}`);
		}
	}
```

- [ ] **Step 7.2: Drop the now-unused `FirstSyncModal` import**

At the top of `src/main.ts`, remove:

```ts
import { FirstSyncModal } from "./first-sync-modal";
```

Add (if not already present):

```ts
import { SyncPreviewModal } from "./sync-preview-modal";
```

- [ ] **Step 7.3: Type-check + build**

```bash
bun run build
```

Expected: clean compile. TypeScript should flag any stale references to `FirstSyncModal`.

- [ ] **Step 7.4: Run tests**

```bash
bun test
```

Expected: all pass. `doSyncWithFirstSyncCheck` has no direct unit tests, but its surface area is otherwise unchanged.

- [ ] **Step 7.5: Manual smoke test**

```bash
bun run build
cp main.js manifest.json styles.css "/home/open-claw/Obsidian Vault/.obsidian/plugins/engram-vault-sync/"
```

Restart Obsidian. Go to Settings → Engram → Cloud (or Self-hosted), pick a vault, expect: SyncPreviewModal appears with counts + 5 option cards + Cancel/Change vault footer. Pick Cancel → modal closes, no sync runs. Re-open settings, pick vault again, pick Smart merge → modal closes, normal sync runs.

- [ ] **Step 7.6: Commit**

```bash
git add src/main.ts
git commit -m "feat(plugin): always show SyncPreviewModal after vault select"
```

---

## Task 8: Consolidate Sync Center handlers behind `SyncPreviewModal`

**Files:**
- Modify: `src/sync-center-render.ts:75-129` (the three `makeActionButton` flows)

- [ ] **Step 8.1: Replace the three action buttons with one**

Replace the entire `renderActions` function in `src/sync-center-render.ts` (lines ~75–129) with:

```ts
function renderActions(parent: HTMLElement, plugin: EngramSyncPlugin, refresh: () => void): void {
	const strip = parent.createDiv({ cls: "engram-sync-center-actions" });

	makeActionButton(strip, "Sync...", async () => {
		try {
			const plan = await plugin.syncEngine.computeSyncPlan("full");
			const modal = new SyncPreviewModal(plugin.app, plan, {
				serverUrl: plugin.settings.apiUrl,
				showChangeVault: false,
			});
			const choice = await modal.awaitChoice();
			await plugin.runSyncFromChoice(choice);
		} catch (e) {
			new Notice(`Engram Sync: ${e instanceof Error ? e.message : "sync failed"}`);
		}
		refresh();
	});

	makeActionButton(strip, "Refresh", () => refresh());
}
```

- [ ] **Step 8.2: Update imports at the top of `sync-center-render.ts`**

Remove:

```ts
import { PreSyncModal, WipeConfirmModal } from "./pre-sync-modal";
```

Add:

```ts
import { SyncPreviewModal } from "./sync-preview-modal";
```

- [ ] **Step 8.3: Type-check + build**

```bash
bun run build
```

Expected: clean compile.

- [ ] **Step 8.4: Run tests**

```bash
bun test
```

Expected: all pass.

- [ ] **Step 8.5: Manual smoke test**

```bash
bun run build
cp main.js manifest.json styles.css "/home/open-claw/Obsidian Vault/.obsidian/plugins/engram-vault-sync/"
```

Restart Obsidian. Settings → Engram → Sync Center tab. Click "Sync..." button — expect SyncPreviewModal appears, Change vault button hidden, all five direction options work, Cancel and Refresh do what they say.

- [ ] **Step 8.6: Commit**

```bash
git add src/sync-center-render.ts
git commit -m "feat(ui): SyncCenter uses SyncPreviewModal for all sync flows"
```

---

## Task 9: Delete `first-sync-modal.ts`, `pre-sync-modal.ts`, and their tests

**Files:**
- Delete: `src/first-sync-modal.ts`
- Delete: `src/pre-sync-modal.ts`
- Delete: `tests/pre-sync-modal.test.ts`
- Modify: `src/sync.ts` (drop `wipePullAll` if no callers remain)

Before deleting `wipePullAll`, verify there are no remaining callers:

- [ ] **Step 9.1: Confirm no callers**

```bash
grep -rn "wipePullAll\|FirstSyncModal\|PreSyncModal\|WipeConfirmModal\|from \"./pre-sync-modal\"\|from \"./first-sync-modal\"" src tests
```

Expected: no matches outside the files themselves. If matches show up, fix them first — Task 7 (main.ts) and Task 8 (sync-center-render.ts) should already have removed the production uses.

- [ ] **Step 9.2: Delete the obsolete files**

```bash
git rm src/first-sync-modal.ts src/pre-sync-modal.ts tests/pre-sync-modal.test.ts
```

- [ ] **Step 9.3: Remove `wipePullAll` from `sync.ts`**

Find the `wipePullAll` method (added in Task 4 as a thin wrapper, originally lived at lines ~891–894) and delete it. If any tests still reference `wipePullAll`, update them to call `pullAll({ deleteLocalExtras: true })` directly.

```bash
grep -n "wipePullAll" src tests
```

Expected after edits: no matches. Re-grep to be sure.

- [ ] **Step 9.4: Type-check + run tests**

```bash
bun run build
bun test
```

Expected: clean compile, all tests pass. Total test count should be roughly 757 - 12 (deleted pre-sync-modal tests) + the new tests added in Tasks 2–5 = mid 770s.

- [ ] **Step 9.5: Commit**

```bash
git add -A
git commit -m "refactor: remove obsolete sync-confirmation modals"
```

---

## Task 10: Add minimal CSS for the new modal classes

**Files:**
- Modify: `styles.css` (append a small block at the end)

The modal uses several new CSS classes (see Task 5). Add basic styling so the modal looks intentional. Keep it minimal — Obsidian's default styles handle most things, we just need spacing + the destructive button color.

- [ ] **Step 10.1: Append to `styles.css`**

```css
/* SyncPreviewModal */
.engram-sync-preview-modal h2 {
	margin-top: 0;
}

.engram-sync-preview-identity {
	font-size: 0.9em;
	color: var(--text-muted);
	margin-bottom: 0.75em;
}

.engram-sync-preview-stats {
	background: var(--background-secondary);
	padding: 0.5em 0.75em;
	border-radius: 4px;
	margin-bottom: 1em;
}

.engram-sync-preview-stats p {
	margin: 0.2em 0;
}

.engram-sync-preview-options {
	display: flex;
	flex-direction: column;
	gap: 0.75em;
}

.engram-sync-preview-option {
	width: 100%;
	text-align: left;
}

.engram-sync-preview-option-subtitle {
	margin: 0.2em 0 0.5em 0;
	font-size: 0.85em;
	color: var(--text-muted);
}

.engram-sync-preview-destructive {
	background: var(--background-modifier-error);
	color: var(--text-on-accent);
}

.engram-sync-preview-sample summary {
	cursor: pointer;
	font-size: 0.85em;
	color: var(--text-muted);
}

.engram-sync-preview-footer {
	display: flex;
	justify-content: flex-end;
	gap: 0.5em;
	margin-top: 1.5em;
}

.engram-sync-preview-warning {
	color: var(--text-error);
	font-weight: 600;
}

.engram-sync-preview-confirm-input {
	width: 100%;
	padding: 0.4em;
	font-family: monospace;
}

.engram-sync-preview-uptodate {
	color: var(--text-success, var(--text-accent));
	font-style: italic;
}
```

- [ ] **Step 10.2: Build + manual smoke test**

```bash
bun run build
cp main.js manifest.json styles.css "/home/open-claw/Obsidian Vault/.obsidian/plugins/engram-vault-sync/"
```

Restart Obsidian. Trigger the modal from both Settings → Cloud and Settings → Sync Center. Verify destructive buttons are visibly red, stats grid is visually distinct, footer buttons land on the right, sample disclosure expands/collapses.

- [ ] **Step 10.3: Commit**

```bash
git add styles.css
git commit -m "style: SyncPreviewModal CSS"
```

---

## Task 11: Version bump to 1.4.0 and final verification

**Files:**
- Modify: `package.json`, `manifest.json`, `versions.json` (via `npm version`)

- [ ] **Step 11.1: Ensure a clean tree**

```bash
git status
```

Expected: nothing to commit. `npm version` refuses to run otherwise.

- [ ] **Step 11.2: Bump version**

```bash
npm version minor
```

Expected output: `1.4.0`. This runs the `version` script (`node version-bump.mjs && git add manifest.json versions.json`) and commits.

- [ ] **Step 11.3: Run full verification**

```bash
bun run build
bun test
```

Expected: clean build, all tests pass (count = pre-PR count + new test count − deleted test count, roughly mid-770s).

- [ ] **Step 11.4: Push branch + open PR**

```bash
git push -u origin feat/sync-preview-modal
gh pr create --title "feat: sync preview modal with verbose plan + 6 directions" --body "$(cat <<'EOF'
## Summary
- New SyncPreviewModal replaces FirstSyncModal + PreSyncModal + WipeConfirmModal. Fires after every vault-select (via doSyncWithFirstSyncCheck) and from the Sync Center action buttons.
- Six sync direction options: smart-merge (default), pull-all+delete-local, pull-all+keep-local, push-all+delete-remote, push-all+keep-remote, plus Cancel and Change vault footers.
- Destructive options (pull+delete-local, push+delete-remote) gated behind a typed-DELETE confirm view.
- Engine extensions: `pullAll({ deleteLocalExtras })` and `pushAll({ deleteRemoteExtras })`. `wipePullAll` removed (no callers).
- Pure helpers (`isPlanEmpty`, `formatPlanSummary`, `computeMatchPercent`, `optionBreakdown`, ...) moved to new `src/sync-plan-format.ts` and tested directly.
- State machine extracted into `SyncPreviewState` for unit-testable choice resolution.

## Test plan
- [ ] `bun test` — all green
- [ ] `bun run build` — clean TypeScript
- [ ] Manual: post-vault-select shows modal; Cancel does nothing; Smart merge runs full sync.
- [ ] Manual: destructive options route through typed-DELETE; Confirm disabled until exact match.
- [ ] Manual: Sync Center "Sync..." button opens modal with Change-vault button hidden.
- [ ] Manual: Change vault clears vaultId and reopens settings on the right tab.

Design spec: docs/superpowers/specs/2026-05-16-sync-preview-modal-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 11.5: Verify CI passes**

Watch `gh pr checks --watch` or the PR page. Required: `build-and-test`, `version-check`, `backend/e2e` all green.

If `version-check` fails, the most likely cause is that `package.json`, `manifest.json`, and `versions.json` are out of sync — re-run `node version-bump.mjs` and amend the version commit.

---

## Self-Review Notes

- **Spec coverage:** every section of the spec maps to at least one task (types → T1, helpers → T2, engine methods → T3+T4, modal → T5, dispatch → T6, settings trigger → T7, sync center trigger → T8, deletions → T9, CSS → T10, version bump + PR → T11).
- **No placeholders.** Every step contains actual code or an exact command.
- **Type consistency.** `SyncChoice` values appear identically in T1, T5, T6, T7, T8. `optionBreakdown` field names (`pullCount`, `pushCount`, `conflictCount`, `deleteLocalCount`, `deleteRemoteCount`, `samplePaths`) appear identically in T2 (definition), T5 (consumer), test files. `pullAll({ deleteLocalExtras })` / `pushAll({ deleteRemoteExtras })` signatures match between T3, T4, T6, and engine bodies.
- **Open questions resolved during planning:** the spec listed "after vault selection in account-tab / self-hosted-tab" as separate trigger points. In practice both tabs already lead to `saveSettings()` → `doSyncWithFirstSyncCheck()`, so adding the modal there would fire twice. T7 hooks the single existing path; tab files are not modified.
