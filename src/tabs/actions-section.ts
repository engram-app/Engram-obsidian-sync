import { Setting } from "obsidian";
import type { TabContext } from "./types";

/** Render the "Sync actions moved" hint with a button to open the Sync Center.
 *  Replaced the old Sync / Push all / Pull all triplet that used to live on
 *  the Cloud and Self-hosted tabs. All preview + execution now happens in the
 *  Sync Center (sidebar leaf or settings-tab mirror). */
export function renderSyncCenterCta(ctx: TabContext): void {
	const { containerEl, plugin } = ctx;

	const hasAuth = !!plugin.settings.apiKey || !!plugin.settings.refreshToken;
	if (!hasAuth) return;

	new Setting(containerEl).setName("Actions").setHeading();

	new Setting(containerEl)
		.setName("Sync Center")
		.setDesc("Sync, Push all, and Pull all live here now. Opens in the sidebar.")
		.addButton((btn) =>
			btn
				.setButtonText("Open Sync Center")
				.setCta()
				.onClick(() => {
					void plugin.openSyncCenter();
				}),
		);
}
