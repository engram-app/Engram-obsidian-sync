import { beforeEach, describe, expect, test } from "bun:test";
import { IgnoredFiles } from "../src/ignored-files";

describe("IgnoredFiles", () => {
	let store: IgnoredFiles;

	beforeEach(() => {
		store = new IgnoredFiles();
	});

	test("starts empty", () => {
		expect(store.all()).toEqual([]);
		expect(store.size()).toBe(0);
		expect(store.has("any.md")).toBe(false);
	});

	test("add + has + size", () => {
		store.add("a.pdf");
		store.add("b.md");
		expect(store.size()).toBe(2);
		expect(store.has("a.pdf")).toBe(true);
		expect(store.has("b.md")).toBe(true);
		expect(store.has("c.md")).toBe(false);
	});

	test("add is idempotent", () => {
		store.add("a.pdf");
		store.add("a.pdf");
		expect(store.size()).toBe(1);
	});

	test("remove deletes", () => {
		store.add("a.pdf");
		store.add("b.md");
		store.remove("a.pdf");
		expect(store.has("a.pdf")).toBe(false);
		expect(store.size()).toBe(1);
	});

	test("remove of unknown path is a noop", () => {
		store.add("a.pdf");
		store.remove("ghost.md");
		expect(store.size()).toBe(1);
	});

	test("clear empties", () => {
		store.add("a.pdf");
		store.add("b.md");
		store.clear();
		expect(store.size()).toBe(0);
	});

	test("all returns sorted paths (stable display)", () => {
		store.add("zeta.md");
		store.add("alpha.md");
		store.add("middle.pdf");
		expect(store.all()).toEqual(["alpha.md", "middle.pdf", "zeta.md"]);
	});

	test("serialize round-trips through hydrate", () => {
		store.add("a.pdf");
		store.add("b.md");
		const json = store.serialize();
		const next = new IgnoredFiles();
		next.hydrate(json);
		expect(next.all()).toEqual(["a.pdf", "b.md"]);
	});

	test("hydrate is tolerant of malformed input", () => {
		expect(() => store.hydrate(undefined)).not.toThrow();
		expect(() => store.hydrate(null)).not.toThrow();
		expect(() => store.hydrate("garbage")).not.toThrow();
		expect(() => store.hydrate({ wat: 1 })).not.toThrow();
		expect(store.all()).toEqual([]);
	});

	test("hydrate filters out non-string entries", () => {
		store.hydrate(["good.md", 42, null, "also-good.pdf", { x: 1 }]);
		expect(store.all()).toEqual(["also-good.pdf", "good.md"]);
	});
});
