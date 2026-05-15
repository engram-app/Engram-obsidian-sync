// ESLint config — mirrors the entire-vc/evc-local-sync-plugin pattern,
// which passes the Obsidian community dashboard validator cleanly.
//
// Background: per ClareMacrae [OBSD] in Discord #plugin-dev (2026-03-01):
// "Obsidian ignores the per-plugin eslint config, to prevent people by-
// passing the system by disabling rules." Disabling no-unsafe-* family
// is officially discouraged. Instead, fix unsafe access at the source
// via `as Type` assertions on deserialization boundaries.
//
// Type safety is enforced both by `tsc --noEmit` in the build step AND
// by the dashboard validator's own embedded lint pass.
import tsparser from "@typescript-eslint/parser";
import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					enforceCamelCaseLower: true,
					brands: [
						"Engram",
						"Obsidian",
						"GitHub",
						"OAuth",
						"Ollama",
						"Qdrant",
						"BRAT",
					],
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
