import { describe, expect, test } from "bun:test";
/**
 * Compliance test: Obsidian community guidelines forbid including the plugin ID
 * in command IDs since Obsidian auto-prefixes them. We extend that to the brand
 * segment ("engram") since plugin id is "engram-sync" — any leading "engram" is
 * redundant once Obsidian prepends "engram-sync:".
 *
 * https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "manifest.json"), "utf8")) as {
	id: string;
};

function extractCommandIds(source: string): string[] {
	const regex = /addCommand\(\s*\{[^}]*?\bid\s*:\s*["']([^"']+)["']/gs;
	return Array.from(source.matchAll(regex), (m) => m[1]);
}

describe("command ID compliance", () => {
	const src = readFileSync(join(import.meta.dir, "..", "src", "main.ts"), "utf8");
	const ids = extractCommandIds(src);

	test("at least one command is registered", () => {
		expect(ids.length).toBeGreaterThan(0);
	});

	test.each(ids)("'%s' does not start with full plugin ID", (id) => {
		expect(id.startsWith(manifest.id)).toBe(false);
	});

	test.each(ids)("'%s' does not start with brand prefix 'engram'", (id) => {
		expect(id.toLowerCase().startsWith("engram")).toBe(false);
	});

	test.each(ids)("'%s' uses kebab-case", (id) => {
		expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
	});
});
