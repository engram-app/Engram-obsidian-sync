import { renderSyncCenter } from "../sync-center-render";
import type { TabContext } from "./types";

/** Sync Center settings tab. Refreshing re-renders in place. */
export function renderSyncCenterTab(ctx: TabContext): void {
	const { containerEl, plugin } = ctx;
	const refresh = () => renderSyncCenter(containerEl, plugin, refresh);
	refresh();
}
