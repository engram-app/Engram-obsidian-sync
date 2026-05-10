import type { SyncIssue, SyncIssueCategory } from "./types";

/** Persistent store of sync failures keyed by file path.
 *
 *  Lives across plugin reloads so the user always sees "what's broken and why"
 *  in the Sync Center. Failures recorded here are the source of truth for the
 *  Issues panel; the offline queue retries network/server failures, but
 *  terminal failures (e.g. 413 Payload Too Large) are kept here without
 *  re-enqueueing so they don't loop forever.
 */
export class IssueStore {
	private issues: Map<string, SyncIssue> = new Map();

	/** Record a new failure or merge into the existing one for `path`. */
	record(issue: SyncIssue): void {
		const existing = this.issues.get(issue.path);
		if (existing) {
			this.issues.set(issue.path, {
				...issue,
				firstFailedAt: existing.firstFailedAt,
				attempts: existing.attempts + 1,
			});
			return;
		}
		this.issues.set(issue.path, { ...issue });
	}

	/** Remove the issue for `path` (called on successful push/pull). */
	clear(path: string): void {
		this.issues.delete(path);
	}

	clearAll(): void {
		this.issues.clear();
	}

	all(): SyncIssue[] {
		return Array.from(this.issues.values());
	}

	count(category?: SyncIssueCategory): number {
		if (!category) return this.issues.size;
		let n = 0;
		for (const issue of this.issues.values()) {
			if (issue.category === category) n++;
		}
		return n;
	}

	byCategory(): Partial<Record<SyncIssueCategory, SyncIssue[]>> {
		const groups: Partial<Record<SyncIssueCategory, SyncIssue[]>> = {};
		for (const issue of this.issues.values()) {
			const bucket = groups[issue.category] ?? [];
			bucket.push(issue);
			groups[issue.category] = bucket;
		}
		return groups;
	}

	/** Plain-JSON snapshot for persistence. */
	serialize(): SyncIssue[] {
		return this.all();
	}

	/** Rebuild from persisted JSON. Tolerant of unknown/malformed input. */
	hydrate(data: unknown): void {
		this.issues.clear();
		if (!Array.isArray(data)) return;
		for (const raw of data) {
			if (!isPersistedIssue(raw)) continue;
			this.issues.set(raw.path, raw);
		}
	}
}

interface CategorizedError {
	category: SyncIssueCategory;
	status?: number;
	message: string;
	/** If true, the offline queue should NOT retry this — user action required. */
	terminal: boolean;
}

/** Classify a thrown error from a push/pull call. */
export function categorizeError(err: unknown): CategorizedError {
	const status =
		typeof err === "object" && err !== null
			? ((err as { status?: number }).status ?? undefined)
			: undefined;
	const message = err instanceof Error ? err.message : String(err);

	if (status === 413) return { category: "too_large", status, message, terminal: true };
	if (status === 401 || status === 403)
		return { category: "auth", status, message, terminal: false };
	if (status !== undefined && status >= 500)
		return { category: "server", status, message, terminal: false };
	if (status === undefined) return { category: "network", message, terminal: false };
	return { category: "other", status, message, terminal: false };
}

function isPersistedIssue(value: unknown): value is SyncIssue {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.path === "string" &&
		(v.kind === "note" || v.kind === "attachment") &&
		typeof v.category === "string" &&
		typeof v.message === "string" &&
		typeof v.firstFailedAt === "number" &&
		typeof v.lastFailedAt === "number" &&
		typeof v.attempts === "number"
	);
}
