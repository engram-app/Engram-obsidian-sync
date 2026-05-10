import { renderSyncCenter } from "../sync-center-render";
import type { TabContext } from "./types";

/** Settings-page mirror of the Sync Center sidebar pane. Same renderer, so
 *  the two surfaces never drift. Refreshing this tab re-renders in place; the
 *  side pane re-renders independently via plugin.refreshSyncCenter(). */
export function renderSyncCenterTab(ctx: TabContext): void {
	const { containerEl, plugin } = ctx;
	const refresh = () => renderSyncCenter(containerEl, plugin, refresh);
	refresh();
}
