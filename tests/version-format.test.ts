/**
 * Compliance test: manifest/package version constraints.
 *
 * Obsidian explicitly requires `x.y.z` format for plugin versions
 * (https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).
 * This means RC suffixes (1.3.11-rc.1) are NOT valid for the manifest
 * — RCs may only exist as GitHub release tags, never as the
 * manifest.version field.
 *
 * Also mirrors the version-check.yml CI gate so violations show up
 * locally during `bun test` instead of only at PR review.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8")) as {
	version: string;
};
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
	version: string;
};
const versions = JSON.parse(readFileSync(join(repoRoot, "versions.json"), "utf8")) as Record<
	string,
	string
>;

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

describe("version format", () => {
	test("manifest.json version uses x.y.z format", () => {
		expect(manifest.version).toMatch(SEMVER_RE);
	});

	test("package.json version uses x.y.z format", () => {
		expect(pkg.version).toMatch(SEMVER_RE);
	});

	test("manifest.json and package.json versions match", () => {
		expect(manifest.version).toBe(pkg.version);
	});

	test("versions.json contains an entry for current manifest version", () => {
		expect(Object.keys(versions)).toContain(manifest.version);
	});

	test.each(Object.keys(versions))("versions.json key '%s' uses x.y.z format", (key) => {
		expect(key).toMatch(SEMVER_RE);
	});

	test.each(Object.entries(versions))(
		"versions.json[%s]='%s' minAppVersion uses x.y.z format",
		(_key, minAppVersion) => {
			expect(minAppVersion).toMatch(SEMVER_RE);
		},
	);
});
