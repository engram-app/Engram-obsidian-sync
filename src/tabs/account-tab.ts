import { Notice, Setting } from "obsidian";
import { applyApiUrlChange } from "../auth-state";
import { renderActionsSection } from "./actions-section";
import { renderAuthSection, renderTestConnection, renderVaultSection } from "./self-hosted-tab";
import type { TabContext } from "./types";
import { ENGRAM_CLOUD_URL, ENGRAM_MARKETING_URL } from "./urls";

export { ENGRAM_CLOUD_URL, ENGRAM_MARKETING_URL };

export async function renderAccountTab(ctx: TabContext): Promise<void> {
	const { containerEl, plugin, redisplay } = ctx;

	// Force cloud URL so Account = cloud. If user had a self-hosted URL, this
	// clears auth — caller can re-sign-in here, or switch to the Self-hosted tab.
	const cleared = await applyApiUrlChange(
		{
			settings: plugin.settings,
			api: plugin.api,
			noteStream: plugin.noteStream,
		},
		ENGRAM_CLOUD_URL,
		() => plugin.saveSettings(),
	);
	if (cleared) {
		new Notice("Switched to Engram Cloud — sign in to continue.");
		redisplay();
		return;
	}

	new Setting(containerEl).setName("Engram Cloud").setHeading();

	const aboutSetting = new Setting(containerEl)
		.setName("New to Engram?")
		.setDesc("Create an account, read the docs, and learn more at ");
	aboutSetting.descEl.createEl("a", {
		text: "engram.page",
		href: ENGRAM_MARKETING_URL,
		attr: { target: "_blank", rel: "noopener" },
	});
	aboutSetting.descEl.appendText(".");

	renderAuthSection(ctx);
	renderVaultSection(ctx);
	renderActionsSection(ctx);
	renderTestConnection(ctx);
}
