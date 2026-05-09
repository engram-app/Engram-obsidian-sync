import { Notice, Setting } from "obsidian";
import { applyApiUrlChange } from "../auth-state";
import {
	renderAuthSection,
	renderSupportSection,
	renderTestConnection,
	renderVaultSection,
} from "./self-hosted-tab";
import type { TabContext } from "./types";

export const ENGRAM_CLOUD_URL = "https://app.engram.page";

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
	containerEl.createEl("p", {
		text: "Sign in to your Engram Cloud account at app.engram.page.",
	});

	renderTestConnection(ctx);
	renderAuthSection(ctx);
	renderVaultSection(ctx);
	renderSupportSection(ctx);
}
