import type { EngramSyncSettings } from "./types";

/** Returns scheme+host+port for a URL that looks like a *finished* origin
 *  (localhost, IPv4, or a domain with a real-looking TLD). Returns null for
 *  empty / unparseable / mid-typing URLs (e.g. `https://engr`). Returning null
 *  here is what stops `isBackendChange` from clearing auth on every keystroke. */
function completeOrigin(url: string): string | null {
	if (!url) return null;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = parsed.hostname;
	const isLocalhost = host === "localhost";
	const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
	const hasTld = /\.[a-z]{2,}$/i.test(host);
	if (!isLocalhost && !isIPv4 && !hasTld) return null;
	return `${parsed.protocol}//${parsed.host}`.toLowerCase();
}

/** Returns true only when both URLs parse to a *complete-looking* origin AND
 *  those origins differ. Path, query, trailing slash, and case differences in
 *  host do NOT count. Partial URLs (mid-keystroke) and empty URLs return false. */
export function isBackendChange(oldUrl: string, newUrl: string): boolean {
	const oldO = completeOrigin(oldUrl);
	const newO = completeOrigin(newUrl);
	if (!oldO || !newO) return false;
	return oldO !== newO;
}

/** Returns a copy of settings with all backend-scoped auth state cleared.
 *  Preserves clientId (stable per-install), apiUrl (caller sets it separately),
 *  and unrelated user prefs (ignorePatterns, debounceMs, etc.). */
export function withClearedAuth(settings: EngramSyncSettings): EngramSyncSettings {
	return {
		...settings,
		apiKey: "",
		refreshToken: undefined,
		userEmail: undefined,
		authMethod: null,
		vaultId: null,
	};
}

/** Minimal plugin surface needed to apply an apiUrl change. Defined here so
 *  the orchestration helper can be unit-tested without dragging in the full
 *  plugin / Obsidian DOM stack. */
export interface ApiUrlSwitchTarget {
	settings: EngramSyncSettings;
	api: { setAuthProvider: (provider: null) => void };
	noteStream: { disconnect: () => void } | null;
}

/** Update `target.settings.apiUrl` and, if the new URL points at a different
 *  backend origin, wipe backend-scoped auth state, null out the API auth
 *  provider, and disconnect the live note stream — then persist via `save`.
 *  Returns true when auth was cleared. Mutates `target.settings` in place so
 *  external references (SyncEngine, etc.) keep observing the same object. */
export async function applyApiUrlChange(
	target: ApiUrlSwitchTarget,
	newUrl: string,
	save: () => Promise<void>,
): Promise<boolean> {
	const cleared = isBackendChange(target.settings.apiUrl, newUrl);
	if (cleared) {
		// Mutate in place — withClearedAuth is the single source of truth for
		// which fields are backend-scoped, so any future addition stays one-place.
		Object.assign(target.settings, withClearedAuth(target.settings));
		target.api.setAuthProvider(null);
		target.noteStream?.disconnect();
	}
	target.settings.apiUrl = newUrl;
	await save();
	return cleared;
}
