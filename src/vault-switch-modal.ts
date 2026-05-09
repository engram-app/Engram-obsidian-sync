/**
 * Confirmation modal for switching the active sync vault. Vault switches are
 * destructive — they retarget the entire sync engine at a different server-
 * side vault, which can pull unfamiliar files, push files that aren't there,
 * and surface conflicts. The modal forces the user to acknowledge the new
 * target before the change applies.
 */
import { type App, Modal } from "obsidian";
import type { VaultInfo } from "./types";

export class VaultSwitchModal extends Modal {
	private resolve: (newVaultId: string | null) => void = () => {};
	private vaults: VaultInfo[];
	private currentVaultId: string | null;
	private selectedId: string;

	constructor(app: App, vaults: VaultInfo[], currentVaultId: string | null) {
		super(app);
		this.vaults = vaults;
		this.currentVaultId = currentVaultId;
		// Default selection: first vault that isn't the current one, else current.
		const firstOther = vaults.find((v) => String(v.id) !== currentVaultId);
		this.selectedId = String((firstOther ?? vaults[0])?.id ?? "");
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Switch sync vault" });

		const warning = contentEl.createDiv({ cls: "engram-vault-switch-warning" });
		warning.createSpan({ cls: "engram-vault-switch-icon", text: "⚠" });
		const warningText = warning.createDiv();
		warningText.createEl("p", {
			text: "Switching vaults retargets sync at a different server vault.",
		});
		warningText.createEl("p", {
			text: "This can pull unfamiliar files into this Obsidian vault, push your local files into the new server vault, and surface conflicts. Make sure your current vault is fully synced before switching.",
		});

		const select = contentEl.createEl("select", { cls: "engram-vault-switch-select" });
		for (const v of this.vaults) {
			const label = v.is_default ? `${v.name} (default)` : v.name;
			const isCurrent = String(v.id) === this.currentVaultId;
			const opt = select.createEl("option", {
				text: isCurrent ? `${label} — current` : label,
				value: String(v.id),
			});
			if (isCurrent) opt.disabled = true;
			if (String(v.id) === this.selectedId) opt.selected = true;
		}
		select.addEventListener("change", () => {
			this.selectedId = select.value;
			updateSwitchButton();
		});

		const btnRow = contentEl.createDiv({ cls: "engram-button-row-end" });

		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.resolve(null);
			this.close();
		});

		const switchBtn = btnRow.createEl("button", {
			text: "Switch",
			cls: "mod-warning",
		});
		switchBtn.addEventListener("click", () => {
			if (this.selectedId && this.selectedId !== this.currentVaultId) {
				this.resolve(this.selectedId);
				this.close();
			}
		});

		const updateSwitchButton = () => {
			const same = this.selectedId === this.currentVaultId;
			switchBtn.disabled = same || !this.selectedId;
		};
		updateSwitchButton();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Open the modal, return the chosen new vault id, or null on cancel. */
	waitForChoice(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
}
