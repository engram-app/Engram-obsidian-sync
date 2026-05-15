/**
 * Compliance test: LICENSE file.
 *
 * Obsidian Developer policies require:
 *   "Include a LICENSE file and clearly indicate the license"
 *
 * Mirrors `obsidianmd/validate-license` ESLint rule:
 *   - copyright holder must not be "Dynalist Inc." (template leftover)
 *   - copyright year should include the current year
 *
 * Source rule:
 *   node_modules/eslint-plugin-obsidianmd/dist/lib/rules/validateLicense.js
 *
 * Note: the upstream rule only matches the exact "Copyright (C) YYYY by NAME"
 * pattern. Our LICENSE uses MIT's "Copyright (c) YYYY NAME" form, which the
 * upstream rule silently skips. We codify a stricter check here that catches
 * both forms so a stale year cannot slip through.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const licenseText = readFileSync(join(import.meta.dir, "..", "LICENSE"), "utf8");

const CURRENT_YEAR = new Date().getFullYear();
// Match both "Copyright (C) 2025-2026 by Name" and "Copyright (c) 2025 Name"
const COPYRIGHT_RE = /^[ \t]*Copyright \([Cc]\) (\d{4})(?:-(\d{4}))?(?: by)? (.+)$/m;

describe("LICENSE — exists and is non-empty", () => {
	test("file is non-empty", () => {
		expect(licenseText.trim().length).toBeGreaterThan(0);
	});
});

describe("LICENSE — license type is named", () => {
	test("mentions a recognized license (MIT, Apache, GPL, BSD, ISC, MPL)", () => {
		expect(licenseText).toMatch(/\b(MIT|Apache|GPL|LGPL|AGPL|BSD|ISC|MPL|Mozilla)\b/);
	});
});

describe("LICENSE — copyright notice (validate-license parity)", () => {
	const match = licenseText.match(COPYRIGHT_RE);

	test("contains a parseable copyright notice", () => {
		expect(match).not.toBeNull();
	});

	test("copyright holder is not 'Dynalist Inc.'", () => {
		if (!match) return;
		const holder = match[3].trim();
		expect(holder).not.toBe("Dynalist Inc.");
	});

	test("copyright holder is non-empty", () => {
		if (!match) return;
		expect(match[3].trim().length).toBeGreaterThan(0);
	});

	test("copyright year (or end-of-range) is the current year", () => {
		if (!match) return;
		const start = Number.parseInt(match[1], 10);
		const end = match[2] ? Number.parseInt(match[2], 10) : start;
		// Allow LICENSE to be one year behind in early January edge cases by
		// requiring end >= CURRENT_YEAR - 0; tighten if/when desired.
		expect(end).toBeGreaterThanOrEqual(CURRENT_YEAR);
	});
});
