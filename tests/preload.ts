import { mock } from "bun:test";
import * as obsidianMock from "./__mocks__/obsidian";

// Obsidian plugin code uses window.setInterval/setTimeout/clearInterval/clearTimeout
// (required by obsidianmd/prefer-window-timers for popout window compat). Bun's test
// runtime is Node-like and lacks `window`, so shim it to the global timer functions.
const g = globalThis as unknown as {
	window?: typeof globalThis;
	activeDocument?: typeof globalThis.document;
	document?: typeof globalThis.document;
};
if (!g.window) g.window = globalThis;
if (!g.activeDocument && g.document) g.activeDocument = g.document;

mock.module("obsidian", () => ({
	...obsidianMock,
	requestUrl: mock(obsidianMock.requestUrl),
}));
