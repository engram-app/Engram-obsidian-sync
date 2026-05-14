// ESLint config for Obsidian community reviewer rules only.
//
// Biome handles formatting + general lint; this config narrowly enforces
// eslint-plugin-obsidianmd so the obsidian-releases ReviewBot's checks
// run identically in our own CI.
//
// We intentionally do NOT extend the plugin's `recommended` config because
// it bundles typescript-eslint:recommendedTypeChecked + microsoft/sdl, which
// adds ~150 type-strictness errors that reviewers don't actually enforce.
// Only obsidianmd/* rules are reproduced below.
//
// Run: `bun run lint:obsidian`
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		files: ["src/**/*.ts"],
		plugins: { obsidianmd },
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},
		rules: {
			// Mirrors `obsidianmd/no-nodejs-modules` (which exists in the plugin's
			// master branch but is not published in v0.3.0 yet). Blocks Node.js
			// builtins to keep the plugin mobile-safe (manifest.isDesktopOnly:false).
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["node:*"],
							message:
								"Do not import Node.js built-in modules. Not available on mobile (isDesktopOnly:false). Use Obsidian APIs or guard with Platform.isDesktop + dynamic import.",
						},
					],
					paths: [
						"fs",
						"fs/promises",
						"path",
						"os",
						"crypto",
						"child_process",
						"stream",
						"http",
						"https",
						"net",
						"tls",
						"util",
						"url",
						"querystring",
						"zlib",
						"buffer",
						"events",
						"assert",
						"module",
					].map((m) => ({
						name: m,
						message:
							"Node.js built-in not available on mobile (isDesktopOnly:false). Use Obsidian APIs or guard with Platform.isDesktop + dynamic import.",
					})),
				},
			],
			"obsidianmd/commands/no-command-in-command-id": "error",
			"obsidianmd/commands/no-command-in-command-name": "error",
			"obsidianmd/commands/no-default-hotkeys": "error",
			"obsidianmd/commands/no-plugin-id-in-command-id": "error",
			"obsidianmd/commands/no-plugin-name-in-command-name": "error",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/vault/iterate": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/editor-drop-paste": "error",
			"obsidianmd/hardcoded-config-path": "error",
			"obsidianmd/no-forbidden-elements": "error",
			"obsidianmd/no-global-this": "error",
			"obsidianmd/no-plugin-as-component": "error",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/no-tfile-tfolder-cast": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/no-unsupported-api": "error",
			"obsidianmd/no-view-references-in-plugin": "error",
			"obsidianmd/object-assign": "error",
			"obsidianmd/platform": "error",
			"obsidianmd/prefer-abstract-input-suggest": "error",
			"obsidianmd/prefer-active-doc": "warn",
			"obsidianmd/prefer-file-manager-trash-file": "warn",
			"obsidianmd/prefer-get-language": "error",
			"obsidianmd/prefer-instanceof": "error",
			"obsidianmd/prefer-window-timers": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/sample-names": "error",
			"obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }],
		},
	},
	{
		ignores: [
			"tests/**",
			"node_modules/**",
			"main.js",
			"version-bump.mjs",
			"esbuild.config.mjs",
			"eslint.config.mjs",
		],
	},
];
