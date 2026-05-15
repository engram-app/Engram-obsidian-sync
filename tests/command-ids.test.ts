import { describe, expect, test } from "bun:test";
/**
 * Compliance test: Obsidian community guidelines forbid including the plugin ID
 * in command IDs since Obsidian auto-prefixes them. We extend that to the brand
 * segment ("engram") since plugin id is "engram-sync" — any leading "engram" is
 * redundant once Obsidian prepends "engram-sync:".
 *
 * Scans every src/**\/*.ts file so addCommand calls outside main.ts are caught.
 *
 * https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const repoRoot = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8")) as {
	id: string;
};

function extractCommandIds(source: string): string[] {
	const regex = /addCommand\(\s*\{[^}]*?\bid\s*:\s*["']([^"']+)["']/gs;
	return Array.from(source.matchAll(regex), (m) => m[1]);
}

function collectAllCommandIds(): { file: string; id: string }[] {
	const glob = new Glob("src/**/*.ts");
	const found: { file: string; id: string }[] = [];
	for (const file of glob.scanSync({ cwd: repoRoot })) {
		const src = readFileSync(join(repoRoot, file), "utf8");
		for (const id of extractCommandIds(src)) found.push({ file, id });
	}
	return found;
}

describe("command ID compliance", () => {
	const entries = collectAllCommandIds();

	test("at least one command is registered across src/", () => {
		expect(entries.length).toBeGreaterThan(0);
	});

	test.each(entries)("$file: '$id' does not start with full plugin ID", ({ id }) => {
		expect(id.startsWith(manifest.id)).toBe(false);
	});

	test.each(entries)("$file: '$id' does not start with brand prefix 'engram'", ({ id }) => {
		expect(id.toLowerCase().startsWith("engram")).toBe(false);
	});

	test.each(entries)("$file: '$id' uses kebab-case", ({ id }) => {
		expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
	});
});
