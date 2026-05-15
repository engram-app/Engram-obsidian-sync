/**
 * Compliance test: Obsidian developer policies require certain disclosures
 * to be in the README before plugins are accepted.
 *
 * https://docs.obsidian.md/Developer+policies
 *
 * For Engram Sync the relevant disclosures are:
 * - Network use (we communicate with the Engram server)
 * - Account required (API key or OAuth)
 * - Server-side telemetry / remote logging (opt-in feature)
 *
 * Catches accidental README rewrites that drop these sections before
 * a re-submission to the community directory.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readme = readFileSync(join(import.meta.dir, "..", "README.md"), "utf8").toLowerCase();

describe("README disclosures", () => {
	test("mentions network use", () => {
		expect(readme).toContain("network use");
	});

	test("mentions account requirement", () => {
		expect(readme).toMatch(/account required|api key|oauth/);
	});

	test("mentions remote logging / telemetry posture", () => {
		expect(readme).toMatch(/telemetry|remote logging|remote-log/);
	});

	test("contains a privacy / data flow section", () => {
		expect(readme).toMatch(/privacy|data flow/);
	});
});
