import { Notice, Setting } from "obsidian";
import { PreSyncModal, WipeConfirmModal } from "../pre-sync-modal";
import type { TabContext } from "./types";

/** Render the Sync now / Push all / Pull all action group. No-op when no
 *  auth is configured — the actions all hit the server, so they only make
 *  sense once the plugin can reach a backend. */
export function renderActionsSection(ctx: TabContext): void {
	const { containerEl, app, plugin, openProgressModal } = ctx;

	const hasAuth = !!plugin.settings.apiKey || !!plugin.settings.refreshToken;
	if (!hasAuth) return;

	new Setting(containerEl).setName("Actions").setHeading();

	new Setting(containerEl)
		.setName("Sync now")
		.setDesc("Pull remote changes and push local changes.")
		.addButton((btn) =>
			btn.setButtonText("Sync").onClick(async () => {
				try {
					btn.setDisabled(true);
					const plan = await plugin.syncEngine.computeSyncPlan("full");
					const confirmed = await new PreSyncModal(app, plan).awaitConfirmation();
					if (!confirmed) {
						btn.setDisabled(false);
						return;
					}
					const progressModal = await openProgressModal();
					const { pulled, pushed } = await plugin.syncEngine.fullSync();
					const errors = plugin.syncEngine.syncLog?.errorCount() ?? 0;
					progressModal.update({
						phase: "complete",
						current: pulled + pushed,
						total: pulled + pushed,
						failed: errors,
					});
				} catch (e) {
					new Notice(`Engram Sync: ${e instanceof Error ? e.message : "sync failed"}`);
				} finally {
					btn.setDisabled(false);
				}
			}),
		);

	new Setting(containerEl)
		.setName("Push entire vault")
		.setDesc("Push all syncable files to Engram. Only needed for initial import.")
		.addButton((btn) =>
			btn
				.setButtonText("Push all")
				.setWarning()
				.onClick(async () => {
					try {
						btn.setDisabled(true);
						const plan = await plugin.syncEngine.computeSyncPlan("push-all");
						const confirmed = await new PreSyncModal(app, plan).awaitConfirmation();
						if (!confirmed) {
							btn.setDisabled(false);
							return;
						}
						await openProgressModal();
						await plugin.syncEngine.pushAll();
					} catch (e) {
						new Notice(
							`Engram Sync: ${e instanceof Error ? e.message : "push failed"}`,
						);
					} finally {
						btn.setDisabled(false);
					}
				}),
		);

	new Setting(containerEl)
		.setName("Pull all from server")
		.setDesc(
			"Pull every note and attachment from the server. Wipe & pull deletes all local files first.",
		)
		.addButton((btn) =>
			btn
				.setButtonText("Pull all")
				.setWarning()
				.onClick(async () => {
					try {
						btn.setDisabled(true);
						const plan = await plugin.syncEngine.computeSyncPlan("pull-all");
						const action = await new PreSyncModal(app, plan, true).awaitPullAction();
						if (action === "cancel") {
							btn.setDisabled(false);
							return;
						}
						if (action === "wipe-pull") {
							const confirmed = await new WipeConfirmModal(
								app,
								plan.localNoteCount,
								plan.localAttachmentCount,
								plan.serverNoteCount,
							).awaitConfirmation();
							if (!confirmed) {
								btn.setDisabled(false);
								return;
							}
							await openProgressModal();
							await plugin.syncEngine.wipePullAll();
							return;
						}
						await openProgressModal();
						await plugin.syncEngine.pullAll();
					} catch (e) {
						new Notice(
							`Engram Sync: ${e instanceof Error ? e.message : "pull failed"}`,
						);
					} finally {
						btn.setDisabled(false);
					}
				}),
		);
}
