import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/llm/json";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("parses JSON inside a markdown fence", () => {
    expect(extractJson('Here you go:\n```json\n{"a": [1,2]}\n```\nDone.')).toEqual({
      a: [1, 2],
    });
  });

  it("parses a JSON object embedded in prose", () => {
    expect(
      extractJson('Sure! The result is {"name": "x", "n": 2} as requested.'),
    ).toEqual({ name: "x", n: 2 });
  });

  it("handles nested braces and braces inside strings", () => {
    const raw = 'prefix {"s": "curly } inside", "o": {"k": 1}} suffix';
    expect(extractJson(raw)).toEqual({ s: "curly } inside", o: { k: 1 } });
  });

  it("handles escaped quotes inside strings", () => {
    expect(extractJson('{"s": "say \\"hi\\" now"}')).toEqual({ s: 'say "hi" now' });
  });

  it("parses arrays", () => {
    expect(extractJson("The list: [1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("throws on garbage", () => {
    expect(() => extractJson("no json here at all")).toThrow(/Could not extract/);
  });
});
