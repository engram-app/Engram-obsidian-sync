// ESLint config — mirrors the QuickAdd plugin pattern.
//
// Background: the Obsidian dashboard validator runs eslint in a sandbox where
// `obsidian` package types resolved as `any`, which when combined with the
// type-checked rule preset (recommendedTypeChecked) produced ~600 false
// `no-unsafe-*` warnings. QuickAdd (100k+ users, live in directory) avoids
// this entirely by using bare typescript-eslint without the type-checked
// preset and explicitly turning off the no-unsafe-* family. We do the same.
//
// Type safety is still enforced by `tsc --noEmit` in the build step.
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslintPlugin,
			obsidianmd,
		},
		rules: {
			...tseslintPlugin.configs.recommended.rules,
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"no-prototype-builtins": "off",
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
];
