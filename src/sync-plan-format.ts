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

/** Single-string newline-joined summary. Kept for testability and future use. */
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

	const localOnly = plan.toPush.notes.length;
	const intersection = Math.max(0, local - localOnly); // notes present on both sides
	const union = local + Math.max(0, remote - intersection);
	if (union === 0) return 100;
	return Math.round((intersection / union) * 100);
}

/** First `limit` entries — useful for "sample of paths about to be deleted". */
export function samplePaths(paths: string[], limit: number): string[] {
	return paths.slice(0, limit);
}

export type DeletionTreeRow =
	| { kind: "folder"; depth: number; label: string }
	| { kind: "file"; depth: number; label: string };

/** Build a folder/file tree from a flat list of vault paths. Folders are
 *  emitted once even when they contain multiple deleted files, so the result
 *  reads like an indented directory listing rather than a wall of repeats.
 *
 *  Each file row is rendered as the leaf name (e.g. "scratch.md") at the
 *  depth of its parent directory plus one. Folder rows are rendered as the
 *  directory name with a trailing slash. The output preserves the input's
 *  natural sort order so callers don't need to pre-sort. */
export function buildDeletionTree(paths: string[]): DeletionTreeRow[] {
	const sorted = [...paths].sort();
	const rows: DeletionTreeRow[] = [];
	const emittedFolders = new Set<string>();

	for (const path of sorted) {
		const parts = path.split("/");
		const folders = parts.slice(0, -1);
		const file = parts[parts.length - 1] ?? "";

		let prefix = "";
		for (let i = 0; i < folders.length; i++) {
			const folder = folders[i] ?? "";
			prefix = prefix ? `${prefix}/${folder}` : folder;
			if (!emittedFolders.has(prefix)) {
				emittedFolders.add(prefix);
				rows.push({ kind: "folder", depth: i, label: `${folder}/` });
			}
		}

		rows.push({ kind: "file", depth: folders.length, label: file });
	}

	return rows;
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
 *  numbers without the caller re-deriving them.
 *
 *  Counts are total files (notes + attachments) to match what the engine
 *  actually moves. Conflict count stays notes-only because the conflict
 *  modal only handles text content. */
export function optionBreakdown(plan: SyncPlan, choice: SyncChoice): OptionBreakdown {
	switch (choice) {
		case "smart-merge":
			return {
				pullCount: plan.toPull.notes.length + plan.toPull.attachments.length,
				pushCount: plan.toPush.notes.length + plan.toPush.attachments.length,
				conflictCount: plan.conflicts.length,
				deleteLocalCount: 0,
				deleteRemoteCount: 0,
				samplePaths: samplePaths(plan.conflicts, 5),
			};

		case "pull-all-delete-local": {
			const localOnly = [...plan.toPush.notes, ...plan.toPush.attachments];
			return {
				pullCount: plan.serverNoteCount + plan.serverAttachmentCount,
				pushCount: 0,
				conflictCount: 0,
				deleteLocalCount: localOnly.length,
				deleteRemoteCount: 0,
				samplePaths: samplePaths(localOnly, 5),
			};
		}

		case "pull-all-keep-local":
			return {
				pullCount: plan.serverNoteCount + plan.serverAttachmentCount,
				pushCount: 0,
				conflictCount: 0,
				deleteLocalCount: 0,
				deleteRemoteCount: 0,
				samplePaths: samplePaths(
					[...plan.toPull.notes, ...plan.toPull.attachments],
					5,
				),
			};

		case "push-all-delete-remote": {
			const remoteOnly = [...plan.toPull.notes, ...plan.toPull.attachments];
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
				samplePaths: samplePaths(
					[...plan.toPush.notes, ...plan.toPush.attachments],
					5,
				),
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
