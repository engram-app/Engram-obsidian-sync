// Diagnostic file for the Obsidian Community dashboard validator.
//
// Goal: determine whether the validator sandbox can resolve `obsidian`
// package types. If this file scans clean (0 warnings), source-level
// fixes are viable for the rest of the codebase. If it still flags
// warnings, the sandbox has broken type resolution and no source change
// can satisfy the rules.
//
// Delete this file once the diagnostic question is answered.

import type { App, TFile, Vault, Workspace } from "obsidian";

export function probeGetFiles(app: App): readonly TFile[] {
	const vault: Vault = app.vault;
	return vault.getFiles();
}

export function probeActiveFile(app: App): TFile | null {
	const workspace: Workspace = app.workspace;
	return workspace.getActiveFile();
}

export function probeFileName(file: TFile): string {
	return file.name;
}
