import { type App, Modal } from "obsidian";
import {
	type OptionBreakdown,
	computeMatchPercent,
	isDestructiveChoice,
	isPlanEmpty,
	optionBreakdown,
} from "./sync-plan-format";
import type { SyncChoice, SyncPlan, SyncPreviewContext } from "./types";

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
	emoji: string;
	label: string;
	subtitle: (b: OptionBreakdown) => string;
	cssClass: string;
}> = [
	{
		choice: "smart-merge",
		emoji: "✨",
		label: "Smart merge (recommended)",
		subtitle: (b) =>
			`Pull ${b.pullCount}, push ${b.pushCount}, merge ${b.conflictCount} conflicts`,
		cssClass: "engram-sync-preview-option mod-cta",
	},
	{
		choice: "pull-all-keep-local",
		emoji: "⬇️",
		label: "Pull all + keep local extras",
		subtitle: (b) => `Download ${b.pullCount}, keep all local`,
		cssClass: "engram-sync-preview-option",
	},
	{
		choice: "pull-all-delete-local",
		emoji: "⚠️",
		label: "Pull all + delete local extras",
		subtitle: (b) => `Download ${b.pullCount}, delete ${b.deleteLocalCount} local`,
		cssClass: "engram-sync-preview-option engram-sync-preview-destructive",
	},
	{
		choice: "push-all-keep-remote",
		emoji: "⬆️",
		label: "Push all + keep remote extras",
		subtitle: (b) => `Upload ${b.pushCount}, keep all remote`,
		cssClass: "engram-sync-preview-option",
	},
	{
		choice: "push-all-delete-remote",
		emoji: "⚠️",
		label: "Push all + delete remote extras",
		subtitle: (b) => `Upload ${b.pushCount}, delete ${b.deleteRemoteCount} remote`,
		cssClass: "engram-sync-preview-option engram-sync-preview-destructive",
	},
];

const HEADER_BY_CONTEXT: Record<SyncPreviewContext, string> = {
	"first-time": "Set up sync for this vault",
	"vault-switch": "New vault detected",
	review: "Sync preview",
};

export interface SyncPreviewOptions {
	/** Server URL string. Host portion is shown beneath the vault name. */
	serverUrl: string;
	/** When true the footer shows a "Change vault" button. Off for triggers
	 *  outside the vault picker (e.g. Sync Center). */
	showChangeVault: boolean;
	/** Drives header copy. Defaults to "review" when not provided. */
	context?: SyncPreviewContext;
}

/** Extract host (no scheme, no path) from a server URL, with graceful
 *  fallback to the raw string when the value isn't a parseable URL. */
function hostOf(url: string): string {
	if (!url) return "";
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

export class SyncPreviewModal extends Modal {
	private state: SyncPreviewState;
	private resolvedChoice: SyncChoice | null = null;
	private resolveFn: ((c: SyncChoice) => void) | null = null;

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

	onOpen(): void {
		this.contentEl.addClass("engram-sync-preview-modal");
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

		if (this.state.view === "preview") {
			this.renderPreview();
		} else {
			this.renderConfirm();
		}
	}

	private renderPreview(): void {
		const { contentEl } = this;
		const empty = isPlanEmpty(this.plan);
		const context = this.opts.context ?? "review";

		this.renderHeader(contentEl, empty ? "up-to-date" : context);
		this.renderIdentity(contentEl);
		this.renderComparison(contentEl);

		if (empty) {
			const footer = contentEl.createDiv({ cls: "engram-sync-preview-footer" });
			const closeBtn = footer.createEl("button", {
				text: "Close",
				cls: "mod-cta",
			});
			closeBtn.addEventListener("click", () => this.state.cancel());
			return;
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

	private renderHeader(parent: HTMLElement, context: SyncPreviewContext | "up-to-date"): void {
		if (context === "up-to-date") {
			const h = parent.createEl("h2", {
				cls: "engram-sync-preview-header engram-sync-preview-header-success",
			});
			h.createSpan({ text: "✅ ", cls: "engram-sync-preview-header-emoji" });
			h.createSpan({ text: "Everything is in sync" });
			return;
		}
		parent.createEl("h2", {
			text: HEADER_BY_CONTEXT[context],
			cls: "engram-sync-preview-header",
		});
	}

	private renderIdentity(parent: HTMLElement): void {
		const identity = parent.createDiv({ cls: "engram-sync-preview-identity" });
		identity.createEl("div", {
			text: this.plan.vaultName,
			cls: "engram-sync-preview-vault-name",
		});
		const host = hostOf(this.opts.serverUrl);
		if (host) {
			identity.createEl("div", {
				text: host,
				cls: "engram-sync-preview-server-host",
			});
		}
	}

	private renderComparison(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: "engram-sync-preview-compare" });

		this.renderCompareCard(wrap, {
			emoji: "💻",
			label: "This vault",
			notes: this.plan.localNoteCount,
			attachments: this.plan.localAttachmentCount,
		});
		this.renderCompareCard(wrap, {
			emoji: "☁️",
			label: "Engram server",
			notes: this.plan.serverNoteCount,
			attachments: this.plan.serverAttachmentCount,
		});

		const match = computeMatchPercent(this.plan);
		const conflicts = this.plan.conflicts.length;
		const meta = parent.createDiv({ cls: "engram-sync-preview-meta" });
		const matchPill = meta.createSpan({
			text: `🔗 Match: ${match}%`,
			cls: "engram-sync-preview-meta-item",
		});
		if (match === 100) matchPill.addClass("is-perfect");
		if (conflicts > 0) {
			const conflictPill = meta.createSpan({
				text: `⚡ Conflicts: ${conflicts}`,
				cls: "engram-sync-preview-meta-item is-warning",
			});
			void conflictPill;
		}
	}

	private renderCompareCard(
		parent: HTMLElement,
		card: { emoji: string; label: string; notes: number; attachments: number },
	): void {
		const el = parent.createDiv({ cls: "engram-sync-preview-compare-card" });
		const header = el.createDiv({ cls: "engram-sync-preview-compare-card-header" });
		header.createSpan({ text: card.emoji, cls: "engram-sync-preview-compare-emoji" });
		header.createSpan({ text: card.label, cls: "engram-sync-preview-compare-label" });
		const body = el.createDiv({ cls: "engram-sync-preview-compare-card-body" });
		body.createDiv({
			text: `📄 ${card.notes} notes`,
			cls: "engram-sync-preview-compare-row",
		});
		body.createDiv({
			text: `📎 ${card.attachments} attachments`,
			cls: "engram-sync-preview-compare-row",
		});
	}

	private renderOptionCard(parent: HTMLElement, card: (typeof OPTION_CARDS)[number]): void {
		const b = optionBreakdown(this.plan, card.choice);
		const wrap = parent.createDiv({ cls: "engram-sync-preview-option-wrap" });
		const btn = wrap.createEl("button", { cls: card.cssClass });
		btn.createSpan({ text: card.emoji, cls: "engram-sync-preview-option-emoji" });
		btn.createSpan({ text: card.label, cls: "engram-sync-preview-option-label" });
		const subtitle = wrap.createEl("p", {
			text: card.subtitle(b),
			cls: "engram-sync-preview-option-subtitle",
		});
		if (b.samplePaths.length > 0) {
			const details = wrap.createEl("details", {
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
		if (choice == null) return;

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

		input.addEventListener("input", () => {
			this.state.typeConfirm(input.value);
			confirmBtn.disabled = !this.state.canSubmitConfirm();
		});

		input.focus();
	}
}
