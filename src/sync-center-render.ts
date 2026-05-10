/** Shared renderer for the Sync Center UI.
 *
 *  Used by both `SyncCenterView` (the right-sidebar workspace leaf) and the
 *  Sync Center settings tab so they stay byte-for-byte identical without a
 *  base class or shared subclass. The caller passes a `refresh` callback so
 *  in-pane button clicks can re-render the same surface they were clicked
 *  from.
 */
import { Notice, normalizePath } from "obsidian";
import type EngramSyncPlugin from "./main";
import type { SyncIssue, SyncIssueCategory } from "./types";

const CATEGORY_LABEL: Record<SyncIssueCategory, string> = {
	too_large: "Too large — server max 5 MB",
	auth: "Auth failure — token invalid or expired",
	server: "Server error",
	network: "Network failure",
	conflict: "Unresolved conflict",
	other: "Other failure",
};

const CATEGORY_ORDER: SyncIssueCategory[] = [
	"too_large",
	"conflict",
	"auth",
	"server",
	"network",
	"other",
];

export function renderSyncCenter(
	parent: HTMLElement,
	plugin: EngramSyncPlugin,
	refresh: () => void,
): void {
	parent.empty();
	parent.addClass("engram-sync-center");
	renderHeader(parent, plugin);
	renderActions(parent, plugin, refresh);
	renderIssues(parent, plugin, refresh);
	renderIgnored(parent, plugin, refresh);
	renderPlaceholder(parent, "Activity", "Live activity feed lands in a follow-up phase.");
	renderPlaceholder(parent, "Stats", "Local/server counts land in a follow-up phase.");
}

function renderHeader(parent: HTMLElement, plugin: EngramSyncPlugin): void {
	const header = parent.createDiv({ cls: "engram-sync-center-header" });
	const status = plugin.syncEngine.getStatus();
	const issueCount = plugin.syncEngine.issues.count();
	const ignoredCount = plugin.syncEngine.ignoredFiles.size();

	const dot = header.createSpan({ cls: `engram-sync-center-dot is-${status.state}` });
	dot.setText("●");

	const title = header.createSpan({ cls: "engram-sync-center-title" });
	title.setText(`Engram Sync — ${status.state}`);

	if (issueCount > 0) {
		const badge = header.createSpan({ cls: "engram-sync-center-issue-badge" });
		badge.setText(`${issueCount} issue${issueCount === 1 ? "" : "s"}`);
	}
	if (ignoredCount > 0) {
		const badge = header.createSpan({ cls: "engram-sync-center-ignored-badge" });
		badge.setText(`${ignoredCount} ignored`);
	}
}

function renderActions(parent: HTMLElement, plugin: EngramSyncPlugin, refresh: () => void): void {
	const strip = parent.createDiv({ cls: "engram-sync-center-actions" });

	makeActionButton(strip, "Sync now", async () => {
		new Notice("Engram Sync: syncing...");
		try {
			const { pulled, pushed } = await plugin.syncEngine.fullSync();
			new Notice(`Engram Sync: pulled ${pulled}, pushed ${pushed}`);
		} catch (e) {
			new Notice(`Engram Sync: ${e instanceof Error ? e.message : "sync failed"}`);
		}
		refresh();
	});

	makeActionButton(strip, "Push all", async () => {
		try {
			const count = await plugin.syncEngine.pushAll();
			new Notice(`Engram Sync: pushed ${count} files`);
		} catch (e) {
			new Notice(`Engram Sync: ${e instanceof Error ? e.message : "push failed"}`);
		}
		refresh();
	});

	makeActionButton(strip, "Refresh", () => refresh());
}

function makeActionButton(
	parent: HTMLElement,
	text: string,
	handler: () => void | Promise<void>,
): void {
	const btn = parent.createEl("button", { text, cls: "engram-sync-center-action-btn" });
	btn.addEventListener("click", () => {
		void handler();
	});
}

function renderIssues(parent: HTMLElement, plugin: EngramSyncPlugin, refresh: () => void): void {
	const section = parent.createDiv({ cls: "engram-sync-center-section" });
	section.createEl("h3", { text: `Issues (${plugin.syncEngine.issues.count()})` });

	const issues = plugin.syncEngine.issues.all();
	if (issues.length === 0) {
		section.createEl("p", {
			cls: "engram-sync-center-empty",
			text: "No sync failures. Everything pushed cleanly.",
		});
		return;
	}

	const grouped = plugin.syncEngine.issues.byCategory();
	for (const category of CATEGORY_ORDER) {
		const list = grouped[category];
		if (!list || list.length === 0) continue;
		renderCategoryGroup(section, plugin, refresh, category, list);
	}
}

function renderCategoryGroup(
	parent: HTMLElement,
	plugin: EngramSyncPlugin,
	refresh: () => void,
	category: SyncIssueCategory,
	issues: SyncIssue[],
): void {
	const group = parent.createDiv({ cls: "engram-sync-center-group" });
	const groupHead = group.createEl("h4", {
		cls: "engram-sync-center-group-head",
		text: `${CATEGORY_LABEL[category]} (${issues.length})`,
	});
	groupHead.createSpan({ cls: "engram-sync-center-group-toggle", text: " ▾" });

	const list = group.createDiv({ cls: "engram-sync-center-issue-list" });
	groupHead.addEventListener("click", () => list.classList.toggle("is-collapsed"));

	for (const issue of issues) {
		renderIssueRow(list, plugin, refresh, issue);
	}
}

function renderIssueRow(
	parent: HTMLElement,
	plugin: EngramSyncPlugin,
	refresh: () => void,
	issue: SyncIssue,
): void {
	const row = parent.createDiv({ cls: "engram-sync-center-issue-row" });

	const main = row.createDiv({ cls: "engram-sync-center-issue-main" });
	main.createEl("div", { cls: "engram-sync-center-issue-path", text: issue.path });

	const meta = main.createDiv({ cls: "engram-sync-center-issue-meta" });
	const parts: string[] = [];
	if (issue.sizeBytes !== undefined) parts.push(formatBytes(issue.sizeBytes));
	if (issue.status !== undefined) parts.push(`HTTP ${issue.status}`);
	parts.push(`${issue.attempts} attempt${issue.attempts === 1 ? "" : "s"}`);
	parts.push(formatRelative(issue.lastFailedAt));
	meta.setText(parts.join(" · "));

	const actions = row.createDiv({ cls: "engram-sync-center-issue-actions" });

	const openBtn = actions.createEl("button", { text: "Open", cls: "mod-cta" });
	openBtn.addEventListener("click", () => openFile(plugin, issue.path));

	const ignoreBtn = actions.createEl("button", { text: "Ignore" });
	ignoreBtn.addEventListener("click", () => {
		void ignoreFilePermanently(plugin, issue.path, refresh);
	});
}

function renderIgnored(parent: HTMLElement, plugin: EngramSyncPlugin, refresh: () => void): void {
	const ignored = plugin.syncEngine.ignoredFiles.all();
	const section = parent.createDiv({ cls: "engram-sync-center-section" });
	section.createEl("h3", { text: `Ignored (${ignored.length})` });

	if (ignored.length === 0) {
		section.createEl("p", {
			cls: "engram-sync-center-empty",
			text: "No files ignored. Use the Ignore button on a failure row to stop syncing it.",
		});
		return;
	}

	const list = section.createDiv({ cls: "engram-sync-center-issue-list" });
	for (const path of ignored) {
		renderIgnoredRow(list, plugin, refresh, path);
	}
}

function renderIgnoredRow(
	parent: HTMLElement,
	plugin: EngramSyncPlugin,
	refresh: () => void,
	path: string,
): void {
	const row = parent.createDiv({ cls: "engram-sync-center-issue-row" });

	const main = row.createDiv({ cls: "engram-sync-center-issue-main" });
	main.createEl("div", { cls: "engram-sync-center-issue-path", text: path });

	const actions = row.createDiv({ cls: "engram-sync-center-issue-actions" });

	const openBtn = actions.createEl("button", { text: "Open" });
	openBtn.addEventListener("click", () => openFile(plugin, path));

	const restoreBtn = actions.createEl("button", { text: "Restore", cls: "mod-cta" });
	restoreBtn.addEventListener("click", () => {
		void restoreFile(plugin, path, refresh);
	});
}

function openFile(plugin: EngramSyncPlugin, path: string): void {
	const file = plugin.app.vault.getFileByPath(normalizePath(path));
	if (!file) {
		new Notice(`File not found locally: ${path}`);
		return;
	}
	void plugin.app.workspace.openLinkText(path, "");
}

async function ignoreFilePermanently(
	plugin: EngramSyncPlugin,
	path: string,
	refresh: () => void,
): Promise<void> {
	plugin.syncEngine.ignoredFiles.add(path);
	plugin.syncEngine.issues.clear(path);
	await plugin.persistEngineState();
	new Notice(`Ignored ${path} — won't sync until restored from Sync Center.`);
	refresh();
	plugin.refreshSyncCenter();
}

async function restoreFile(
	plugin: EngramSyncPlugin,
	path: string,
	refresh: () => void,
): Promise<void> {
	plugin.syncEngine.ignoredFiles.remove(path);
	await plugin.persistEngineState();
	new Notice(`Restored ${path} — will sync on next push.`);
	refresh();
	plugin.refreshSyncCenter();
}

function renderPlaceholder(parent: HTMLElement, title: string, text: string): void {
	const section = parent.createDiv({ cls: "engram-sync-center-section" });
	section.createEl("h3", { text: title });
	section.createEl("p", { cls: "engram-sync-center-empty", text });
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelative(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}
