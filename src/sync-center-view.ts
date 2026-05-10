import { ItemView, type WorkspaceLeaf } from "obsidian";
import type EngramSyncPlugin from "./main";
import { renderSyncCenter } from "./sync-center-render";

export const SYNC_CENTER_VIEW_TYPE = "engram-sync-center";

/** Right-sidebar workspace leaf wrapper around the shared Sync Center renderer.
 *  All rendering logic lives in `sync-center-render.ts` so the settings page
 *  can mount the same UI inside its tab. */
export class SyncCenterView extends ItemView {
	private plugin: EngramSyncPlugin;
	private unsubscribeLog: (() => void) | null = null;

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
		// Live-refresh on every log entry so the Activity feed stays current
		// during a long pushAll without the user clicking Refresh.
		this.unsubscribeLog = this.plugin.syncLog.subscribe(() => this.render());
	}

	async onClose(): Promise<void> {
		this.unsubscribeLog?.();
		this.unsubscribeLog = null;
		this.contentEl.empty();
	}

	render(): void {
		renderSyncCenter(this.contentEl, this.plugin, () => this.render());
	}
}
