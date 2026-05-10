import { ItemView, Notice, type WorkspaceLeaf, normalizePath } from "obsidian";
import type EngramSyncPlugin from "./main";
import type { SyncIssue, SyncIssueCategory } from "./types";

export const SYNC_CENTER_VIEW_TYPE = "engram-sync-center";

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

export class SyncCenterView extends ItemView {
	private plugin: EngramSyncPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: EngramSyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return SYNC_CENTER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Engram Sync";
	}

	getIcon(): string {
		return "refresh-cw";
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("engram-sync-center");
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Re-render the entire pane. Cheap — issue list is small (tens, not thousands). */
	render(): void {
		this.contentEl.empty();
		this.renderHeader();
		this.renderActions();
		this.renderIssues();
		this.renderPlaceholder("Activity", "Live activity feed lands in a follow-up phase.");
		this.renderPlaceholder("Stats", "Local/server counts land in a follow-up phase.");
	}

	private renderHeader(): void {
		const header = this.contentEl.createDiv({ cls: "engram-sync-center-header" });
		const status = this.plugin.syncEngine.getStatus();
		const issueCount = this.plugin.syncEngine.issues.count();

		const dot = header.createSpan({ cls: `engram-sync-center-dot is-${status.state}` });
		dot.setText("●");

		const title = header.createSpan({ cls: "engram-sync-center-title" });
		title.setText(`Engram Sync — ${status.state}`);

		if (issueCount > 0) {
			const badge = header.createSpan({ cls: "engram-sync-center-issue-badge" });
			badge.setText(`${issueCount} issue${issueCount === 1 ? "" : "s"}`);
		}
	}

	private renderActions(): void {
		const strip = this.contentEl.createDiv({ cls: "engram-sync-center-actions" });

		this.makeActionButton(strip, "Sync now", async () => {
			new Notice("Engram Sync: syncing...");
			try {
				const { pulled, pushed } = await this.plugin.syncEngine.fullSync();
				new Notice(`Engram Sync: pulled ${pulled}, pushed ${pushed}`);
			} catch (e) {
				new Notice(`Engram Sync: ${e instanceof Error ? e.message : "sync failed"}`);
			}
			this.render();
		});

		this.makeActionButton(strip, "Push all", async () => {
			try {
				const count = await this.plugin.syncEngine.pushAll();
				new Notice(`Engram Sync: pushed ${count} files`);
			} catch (e) {
				new Notice(`Engram Sync: ${e instanceof Error ? e.message : "push failed"}`);
			}
			this.render();
		});

		this.makeActionButton(strip, "Refresh", () => {
			this.render();
		});
	}

	private makeActionButton(
		parent: HTMLElement,
		text: string,
		handler: () => void | Promise<void>,
	): void {
		const btn = parent.createEl("button", {
			text,
			cls: "engram-sync-center-action-btn",
		});
		btn.addEventListener("click", () => {
			void handler();
		});
	}

	private renderIssues(): void {
		const section = this.contentEl.createDiv({ cls: "engram-sync-center-section" });
		const head = section.createDiv({ cls: "engram-sync-center-section-head" });
		const issues = this.plugin.syncEngine.issues.all();
		head.createEl("h3", { text: `Issues (${issues.length})` });

		if (issues.length === 0) {
			section.createEl("p", {
				cls: "engram-sync-center-empty",
				text: "No sync failures. Everything pushed cleanly.",
			});
			return;
		}

		const grouped = this.plugin.syncEngine.issues.byCategory();
		for (const category of CATEGORY_ORDER) {
			const list = grouped[category];
			if (!list || list.length === 0) continue;
			this.renderCategoryGroup(section, category, list);
		}
	}

	private renderCategoryGroup(
		parent: HTMLElement,
		category: SyncIssueCategory,
		issues: SyncIssue[],
	): void {
		const group = parent.createDiv({ cls: "engram-sync-center-group" });
		const groupHead = group.createEl("h4", {
			cls: "engram-sync-center-group-head",
			text: `${CATEGORY_LABEL[category]} (${issues.length})`,
		});
		groupHead.createSpan({
			cls: "engram-sync-center-group-toggle",
			text: " ▾",
		});

		const list = group.createDiv({ cls: "engram-sync-center-issue-list" });

		groupHead.addEventListener("click", () => {
			list.classList.toggle("is-collapsed");
		});

		for (const issue of issues) {
			this.renderIssueRow(list, issue);
		}
	}

	private renderIssueRow(parent: HTMLElement, issue: SyncIssue): void {
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
		openBtn.addEventListener("click", () => this.openFile(issue.path));

		const ignoreBtn = actions.createEl("button", { text: "Ignore" });
		ignoreBtn.addEventListener("click", () => {
			void this.ignoreFile(issue.path);
		});
	}

	private openFile(path: string): void {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!file) {
			new Notice(`File not found locally: ${path}`);
			return;
		}
		void this.app.workspace.openLinkText(path, "");
	}

	private async ignoreFile(path: string): Promise<void> {
		this.plugin.syncEngine.issues.clear(path);
		new Notice(
			`Ignored ${path} for this session. Add to ignorePatterns in settings to ignore permanently.`,
		);
		this.render();
	}

	private renderPlaceholder(title: string, text: string): void {
		const section = this.contentEl.createDiv({ cls: "engram-sync-center-section" });
		section.createEl("h3", { text: title });
		section.createEl("p", { cls: "engram-sync-center-empty", text });
	}
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
