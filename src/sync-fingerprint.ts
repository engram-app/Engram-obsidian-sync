import type { EngramSyncSettings } from "./types";

/** Fingerprint identifying the current auth + vault combination. Used to
 *  decide whether the SyncPreviewModal must fire. Order matters — keep it
 *  stable across releases or the gate will incorrectly re-fire for everyone. */
export async function computeSyncFingerprint(settings: EngramSyncSettings): Promise<string> {
	// Use refreshToken when present (OAuth) — it survives access-token rotation.
	// Fall back to apiKey for self-hosted / static-key auth.
	const authPart = settings.refreshToken || settings.apiKey || "";
	const vaultPart = settings.vaultId || "";
	const input = `${authPart}|${vaultPart}`;
	if (input === "|") return ""; // Both empty = no fingerprint yet
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
