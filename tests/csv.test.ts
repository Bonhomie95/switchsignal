import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("passes plain values through", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(null)).toBe("");
  });

  it("quotes commas, quotes, and newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("produces RFC-4180 output with CRLF", () => {
    const csv = toCsv(["id", "text"], [[1, 'a,"b"'], [2, "plain"]]);
    expect(csv).toBe('id,text\r\n1,"a,""b"""\r\n2,plain\r\n');
  });
});
