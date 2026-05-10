import { ItemView, type WorkspaceLeaf } from "obsidian";
import type EngramSyncPlugin from "./main";
import { renderSyncCenter } from "./sync-center-render";

export const SYNC_CENTER_VIEW_TYPE = "engram-sync-center";

/** Right-sidebar workspace leaf wrapper around the shared Sync Center renderer.
 *  All rendering logic lives in `sync-center-render.ts` so the settings page
 *  can mount the same UI inside its tab. */
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

	render(): void {
		renderSyncCenter(this.contentEl, this.plugin, () => this.render());
	}
}
