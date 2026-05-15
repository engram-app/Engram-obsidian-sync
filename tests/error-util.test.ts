import { describe, expect, test } from "bun:test";
import { errMsg } from "../src/error-util";

describe("errMsg", () => {
	test("Error instance → its message", () => {
		expect(errMsg(new Error("boom"))).toBe("boom");
	});

	test("string → itself", () => {
		expect(errMsg("oops")).toBe("oops");
	});

	test("number → string form", () => {
		expect(errMsg(42)).toBe("42");
	});

	test("plain object → JSON", () => {
		expect(errMsg({ code: 500, msg: "server" })).toBe('{"code":500,"msg":"server"}');
	});

	test("null → string form", () => {
		expect(errMsg(null)).toBe("null");
	});

	test("undefined → 'undefined'", () => {
		expect(errMsg(undefined)).toBe("undefined");
	});

	test("circular object → falls back to String()", () => {
		const o: { self?: unknown } = {};
		o.self = o;
		expect(errMsg(o)).toBe("[object Object]");
	});

	test("subclass of Error preserves message", () => {
		class MyErr extends Error {}
		expect(errMsg(new MyErr("specific"))).toBe("specific");
	});
});
