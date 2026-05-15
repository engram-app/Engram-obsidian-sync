// ESLint config — mirrors the Obsidian community dashboard validator.
//
// Uses `obsidianmd.configs.recommendedWithLocalesEn` directly so our local
// `bun run lint:obsidian` reports the same errors and warnings the dashboard
// shows. This bundles:
//   - typescript-eslint:recommendedTypeChecked
//   - @microsoft/eslint-plugin-sdl
//   - eslint-plugin-no-unsanitized
//   - eslint-plugin-depend (ban-dependencies for package.json)
//   - all obsidianmd/* rules at recommended severities
//
// The dashboard adds an extra check that disallows `eslint-disable` comments
// for `obsidianmd/ui/sentence-case`. We don't reproduce that locally — instead
// we configure the rule's `brands`, `acronyms`, and `ignoreRegex` options so
// strings pass naturally and no disable comments are needed.
import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommendedWithLocalesEn,
	{
		files: ["src/**/*.ts"],
		rules: {
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					enforceCamelCaseLower: true,
					// Brand names whose canonical casing must be preserved as-is.
					brands: [
						"Engram",
						"Obsidian",
						"GitHub",
						"OAuth",
						"Ollama",
						"Qdrant",
						"BRAT",
					],
					// Skip strings that match any of these patterns (URLs, token examples, etc.)
					ignoreRegex: [
						String.raw`https?://\S+`,
						String.raw`\bgithub\.com/\S+`,
						String.raw`engram_[A-Za-z0-9_]+`,
					],
				},
			],
		},
	},
	globalIgnores([
		"tests/**",
		"node_modules/**",
		"main.js",
		"version-bump.mjs",
		"esbuild.config.mjs",
		"docs/**",
	]),
);
