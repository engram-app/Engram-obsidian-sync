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
