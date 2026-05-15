import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Compliance test: our self-hosted runner does NOT have the `gh` CLI installed.
 * Every workflow currently runs on `[self-hosted, ...]`. Use curl + the GitHub
 * REST API instead. See .github/workflows/rc-release.yml for the canonical
 * pattern.
 *
 * Background: release.yml silently broke for two weeks because `gh release create`
 * failed with "command not found" only at merge-to-main time, never in PR CI.
 * This test catches the same class of bug at PR review.
 *
 * If/when `gh` gets installed on the runner, delete this test.
 */
import { Glob } from "bun";

const repoRoot = join(import.meta.dir, "..");

function loadWorkflows(): { file: string; content: string }[] {
	const glob = new Glob("**/*.yml");
	return Array.from(glob.scanSync({ cwd: join(repoRoot, ".github", "workflows") }), (file) => ({
		file: `.github/workflows/${file}`,
		content: readFileSync(join(repoRoot, ".github", "workflows", file), "utf8"),
	}));
}

function stripComments(yaml: string): string {
	return yaml
		.split("\n")
		.map((line) => line.replace(/(^|\s)#.*$/, ""))
		.join("\n");
}

describe("self-hosted runner tool availability", () => {
	const workflows = loadWorkflows();

	test("at least one workflow exists", () => {
		expect(workflows.length).toBeGreaterThan(0);
	});

	test.each(workflows)("$file uses only self-hosted runners", ({ content }) => {
		const runsOn = content.matchAll(/runs-on:\s*(\[[^\]]+\]|\S+)/g);
		for (const match of runsOn) {
			expect(match[1]).toContain("self-hosted");
		}
	});

	test.each(workflows)("$file does not invoke the gh CLI", ({ content }) => {
		const stripped = stripComments(content);
		const ghCalls = stripped.match(
			/(?<![\w./-])gh\s+(?:auth|api|release|pr|issue|repo|run|workflow)\b/g,
		);
		expect(ghCalls ?? []).toEqual([]);
	});
});
