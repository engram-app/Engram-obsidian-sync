import { Notice, Setting, setIcon } from "obsidian";
import { applyApiUrlChange } from "../auth-state";
import { VaultSwitchModal } from "../vault-switch-modal";
import type { TabContext } from "./types";
import { ENGRAM_CLOUD_URL } from "./urls";

export function renderSelfHostedTab(ctx: TabContext): void {
	const { containerEl, plugin, redisplay } = ctx;

	// Lock the tab when the user is signed into Engram Cloud — both modes share
	// the same auth fields, so showing the auth UI here would let them sign out
	// of Cloud from the wrong tab. Sign-out has to happen via the Cloud tab.
	const isOnCloud = plugin.settings.apiUrl === ENGRAM_CLOUD_URL;
	const hasAuth = !!plugin.settings.apiKey || !!plugin.settings.refreshToken;
	if (isOnCloud && hasAuth) {
		renderCloudLockBanner(containerEl);
		return;
	}

	// ── Setup ──
	new Setting(containerEl).setName("Setup").setHeading();

	const repoSetting = new Setting(containerEl)
		.setName("Engram server")
		.setDesc("Engram is the backend that powers sync and semantic search. Run it yourself:");
	repoSetting.descEl.createEl("br");
	repoSetting.descEl.createEl("a", {
		text: "github.com/Rasbandit/engram",
		href: "https://github.com/Rasbandit/engram",
	});

	new Setting(containerEl)
		.setName("Engram URL")
		.setDesc("Full URL to your Engram instance (e.g. http://10.0.20.214:8000).")
		.addText((text) =>
			text
				.setPlaceholder("http://localhost:8000")
				.setValue(plugin.settings.apiUrl)
				.onChange(async (value) => {
					const cleared = await applyApiUrlChange(
						{
							settings: plugin.settings,
							api: plugin.api,
							noteStream: plugin.noteStream,
						},
						value,
						() => plugin.saveSettings(),
					);
					if (cleared) {
						new Notice("Engram backend changed — sign in again to continue.");
						redisplay();
					}
				}),
		);

	renderAuthSection(ctx);
	renderVaultSection(ctx);
	renderTestConnection(ctx);
	renderSupportSection(ctx);
}

/** Render the "you're on Cloud" banner that replaces the entire Self-hosted
 *  body when the active backend is Cloud. Keeps the user from bypassing the
 *  Cloud tab to manage Cloud auth. */
function renderCloudLockBanner(containerEl: HTMLElement): void {
	const banner = containerEl.createDiv({ cls: "engram-mode-lock-banner" });
	banner.createEl("p", { text: "You're connected to Engram Cloud." });
	banner.createEl("p", {
		text: "To set up a self-hosted Engram server, sign out from the Cloud tab first. That will release the connection so you can point the plugin at your own server.",
	});
}

/** Render the "Test connection" row. Hidden when no auth is configured —
 *  there is nothing to test against an empty backend. */
export function renderTestConnection(ctx: TabContext): void {
	const { containerEl, plugin } = ctx;
	const hasAuth = !!plugin.settings.refreshToken || !!plugin.settings.apiKey;
	if (!hasAuth) return;

	new Setting(containerEl)
		.setName("Test connection")
		.setDesc("Check if Engram is reachable and credentials are valid.")
		.addButton((btn) =>
			btn.setButtonText("Test").onClick(async () => {
				const { ok, error } = await plugin.api.ping();
				new Notice(ok ? "Engram: connected!" : `Engram: ${error}`);
			}),
		);
}

/** Render Authentication section — OAuth status / API key / sign-in CTAs.
 *
 *  States:
 *    - Unauth: both Sign-in row and API-key row visible, separated by an "or"
 *      divider. API-key field uses a buffered Save button (no per-keystroke
 *      writes).
 *    - OAuth locked: only the signed-in row + Sign out.
 *    - API key locked: only the "Using API key" row + Clear / Switch to sign in. */
export function renderAuthSection(ctx: TabContext): void {
	const { containerEl, plugin, redisplay, startDeviceFlow } = ctx;

	const isOAuth = !!plugin.settings.refreshToken;
	const hasApiKey = !!plugin.settings.apiKey;

	new Setting(containerEl).setName("Authentication").setHeading();

	if (isOAuth) {
		new Setting(containerEl)
			.setName(`Signed in as ${plugin.settings.userEmail ?? "unknown"}`)
			.setDesc("Authenticated via Engram account (OAuth).")
			.addButton((btn) =>
				btn.setButtonText("Sign out").onClick(async () => {
					await plugin.clearOAuthTokens();
					redisplay();
				}),
			);
		return;
	}

	if (hasApiKey) {
		new Setting(containerEl)
			.setName("Using API key")
			.setDesc("Authenticated via manual API key.")
			.addButton((btn) =>
				btn
					.setButtonText("Clear key")
					.setWarning()
					.onClick(async () => {
						plugin.settings.apiKey = "";
						await plugin.saveSettings();
						redisplay();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Switch to sign in")
					.setCta()
					.onClick(async () => {
						plugin.settings.apiKey = "";
						await plugin.saveSettings();
						startDeviceFlow();
					}),
			);
		return;
	}

	// Unauth — show both methods side-by-side via stacked rows + divider.
	new Setting(containerEl)
		.setName("Sign in with Engram")
		.setDesc("Links your Obsidian vault to your Engram account. Opens a browser window.")
		.addButton((btn) =>
			btn
				.setButtonText("Sign in")
				.setCta()
				.onClick(() => startDeviceFlow()),
		);

	containerEl.createDiv({ cls: "engram-auth-divider", text: "or" });

	let pendingKey = "";
	new Setting(containerEl)
		.setName("API key")
		.setDesc("Bearer token from Engram (starts with engram_).")
		.addText((text) => {
			text.setPlaceholder("engram_abc123...").onChange((value) => {
				pendingKey = value;
			});
			text.inputEl.type = "password";
			text.inputEl.addClass("engram-api-key-input");
		})
		.addButton((btn) =>
			btn
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					const trimmed = pendingKey.trim();
					if (!trimmed) {
						new Notice("Enter an API key first");
						return;
					}
					plugin.settings.apiKey = trimmed;
					await plugin.saveSettings();
					redisplay();
				}),
		);
}

/** Render Vault selection section. No-op when no auth is configured.
 *
 *  Two modes:
 *    - First-time (no vaultId): dropdown directly so the user can pick.
 *    - Locked-in (vaultId set): read-only "Vault Selection: <name>" + Change button
 *      that opens VaultSwitchModal. Vault switching is destructive (retargets
 *      sync at a different server vault), so it lives behind a confirm modal. */
export function renderVaultSection(ctx: TabContext): void {
	const { containerEl, app, plugin, redisplay } = ctx;

	if (!plugin.settings.apiKey && !plugin.settings.refreshToken) return;

	new Setting(containerEl).setName("Vault").setHeading();

	const setting = new Setting(containerEl)
		.setName("Vault Selection")
		.setDesc("Select which vault this plugin syncs with.");

	const placeholderEl = setting.controlEl.createSpan({ text: "Loading vaults..." });

	plugin.api
		.listVaults()
		.then((vaults) => {
			placeholderEl.remove();

			if (vaults.length === 0) {
				setting.controlEl.createSpan({
					text: "No vaults found — first sync will create one",
				});
				return;
			}

			const currentId = plugin.settings.vaultId;
			const current = currentId ? vaults.find((v) => String(v.id) === currentId) : undefined;

			// First-time picker: render the dropdown directly so the user can
			// choose without going through the warning modal.
			if (!current) {
				setting.addDropdown((dropdown) => {
					if (currentId) {
						// Vault id set but no longer exists on server — surface it.
						dropdown.addOption(
							"",
							`Pick a vault (previous: id ${currentId} not found)`,
						);
					} else {
						dropdown.addOption("", "Pick a vault");
					}
					for (const v of vaults) {
						const label = v.is_default ? `${v.name} (default)` : v.name;
						dropdown.addOption(String(v.id), label);
					}
					dropdown.onChange(async (value) => {
						if (await applyVaultSwitch(plugin, value)) redisplay();
					});
				});
				return;
			}

			// Locked-in display: vault name + Change button → confirm modal.
			const nameEl = setting.controlEl.createSpan({
				cls: "engram-vault-current-name",
				text: current.is_default ? `${current.name} (default)` : current.name,
			});
			nameEl.setAttribute("title", `Vault id: ${current.id}`);

			setting.addButton((btn) =>
				btn.setButtonText("Change").onClick(async () => {
					const newId = await new VaultSwitchModal(
						app,
						vaults,
						currentId,
					).waitForChoice();
					if (newId && (await applyVaultSwitch(plugin, newId))) redisplay();
				}),
			);
		})
		.catch((e: unknown) => {
			placeholderEl.remove();
			setting.controlEl.createSpan({ text: describeListVaultsError(e) });
		});
}

/** Render the GitHub Sponsors support section. */
export function renderSupportSection(ctx: TabContext): void {
	const { containerEl } = ctx;

	new Setting(containerEl).setName("Support development").setHeading();

	const supportSetting = new Setting(containerEl).setDesc(
		"If this plugin saves you time, consider supporting development.",
	);

	const sponsorLink = supportSetting.controlEl.createEl("a", {
		cls: "engram-sponsor-button",
		href: "https://github.com/sponsors/Rasbandit",
		attr: { target: "_blank", rel: "noopener" },
	});
	const iconSpan = sponsorLink.createSpan({ cls: "engram-sponsor-icon" });
	setIcon(iconSpan, "heart");
	sponsorLink.createSpan({ text: "Sponsor on GitHub" });
}

/** Map a `listVaults()` rejection to a short human label suitable for a
 *  dropdown placeholder. Distinguishes 401/403, timeouts, and 5xx from the
 *  legacy "swallow → empty list" behavior. Pure for testing. */
export function describeListVaultsError(e: unknown): string {
	const err = e as { status?: number; message?: string };
	const status = err?.status;
	if (status === 401 || status === 403) return "Sign-in required to load vaults";
	if (status && status >= 500) return `Server error (${status}) — check Engram logs`;
	if (status && status >= 400) return `Request failed (${status})`;
	return "Could not reach Engram — check connection";
}

/** Subset of EngramSyncPlugin used by `applyVaultSwitch`. Defined here so the
 *  helper is unit-testable without dragging in the Obsidian DOM stack. */
export interface VaultSwitchTarget {
	settings: { vaultId: string | null };
	api: { setVaultId: (id: string | null) => void };
	saveSettings: () => Promise<void>;
}

/** Apply a user-driven vault switch. Returns `true` if the active vault
 *  actually changed (caller should redisplay). */
export async function applyVaultSwitch(plugin: VaultSwitchTarget, value: string): Promise<boolean> {
	if (!value || value === plugin.settings.vaultId) return false;
	plugin.settings.vaultId = value;
	plugin.api.setVaultId(value);
	await plugin.saveSettings();
	return true;
}
