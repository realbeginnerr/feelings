import { describe, it, expect } from "vitest";
import {
  parseCsv,
  recommend,
  emptyQuote,
  validateQuote,
  type Tag,
  type Quote,
} from "../src/domain";
const tag = (
  id: string,
  big3Ids: Tag["big3Ids"] = ["Balance"],
  isActive = true,
): Tag => ({ id, nameKo: id, nameEn: "", big3Ids, isActive, quoteCount: 0 });
const quote = (
  id: string,
  ids: string[],
  status: Quote["status"] = "published",
): Quote => ({
  ...emptyQuote(),
  id,
  originalText: id,
  emotionTagIds: ids,
  status,
  copyrightStatus: "approved",
});
describe("recommendation", () => {
  it("ranks intersection count and excludes private and nonmatching quotes", () => {
    expect(
      recommend(
        [
          quote("one", ["a"]),
          quote("two", ["a", "b"]),
          quote("private", ["a", "b"], "draft"),
          quote("none", ["c"]),
        ],
        [tag("a"), tag("b")],
        ["a", "b"],
      ).quotes.map((q) => q.id),
    ).toEqual(["two", "one"]);
  });
  it("uses unique Big3 intersection only when no direct match", () => {
    const r = recommend([quote("related", ["b"])], [tag("a"), tag("b")], ["a"]);
    expect(r.fallback).toBe(true);
    expect(r.quotes).toHaveLength(1);
  });
  it("does not guess missing Big3 or use inactive tags", () => {
    expect(
      recommend([quote("q", ["b"])], [tag("a", []), tag("b")], ["a"]).quotes,
    ).toHaveLength(0);
    expect(
      recommend([quote("q", ["a"])], [tag("a", [], false)], ["a"]).quotes,
    ).toHaveLength(0);
  });
  it("randomizes ties without mutating sources", () => {
    const qs = [quote("a", ["x"]), quote("b", ["x"])];
    expect(recommend(qs, [tag("x")], ["x"], () => 0).quotes[0].id).toBe("b");
    expect(qs[0].id).toBe("a");
  });
});
describe("CSV import", () => {
  it("preserves quoted commas, newlines and tag internal spaces", () => {
    const rows = parseCsv(
      '문장,해소 대상 감정\n"hello,\nworld","성과 압박, 불안, 불안"',
      [],
      [],
    );
    expect(rows[0].text).toBe("hello,\nworld");
    expect(rows[0].names).toEqual(["성과 압박", "불안"]);
  });
  it("supports original PRD columns and preserves Big3 without deriving tag mappings", () => {
    const r = parseCsv(
      '문장 내용,림빅맵 중 어디에 해당하는지,구체적 키워드\nx,"Balance, Dominance",불안',
      [],
      [],
    )[0];
    expect(r.big3).toEqual(["Balance", "Dominance"]);
    expect(r.warning).toContain("신규 감정 · Big 3 미지정");
  });
  it("detects normalized duplicates, including within a file", () => {
    const r = parseCsv(
      '문장,해소 대상 감정\n" a  b ",불안\n"a b",불안',
      [quote("a b", [])],
      [],
    );
    expect(r.every((x) => x.duplicate)).toBe(true);
  });
  it("keeps missing emotion rows as draft candidates and rejects malformed headers/encoding", () => {
    expect(parseCsv("문장,해소 대상 감정\nx,", [], [])[0].warning).toContain(
      "감정 없음 · 비공개 초안",
    );
    expect(() => parseCsv("wrong,header\nx,y", [], [])).toThrow();
    expect(() => parseCsv("문장,해소 대상 감정\n�,a", [], [])).toThrow();
  });
  it("reports unknown Big3 and malformed quoted CSV", () => {
    expect(
      parseCsv(
        "문장 내용,구체적 키워드,림빅맵 중 어디에 해당하는지\nx,a,unknown",
        [],
        [],
      )[0].issues,
    ).toContain("알 수 없는 Big 3");
    expect(() =>
      parseCsv('문장,해소 대상 감정\n"unclosed,a', [], []),
    ).toThrow();
  });
});
describe("quote validation", () => {
  it("blocks publication without tags or approval, and unsafe links", () => {
    expect(() => validateQuote(quote("x", []))).toThrow();
    expect(() =>
      validateQuote({ ...quote("x", ["a"]), copyrightStatus: "unreviewed" }),
    ).toThrow();
    expect(() =>
      validateQuote({ ...quote("x", ["a"]), sourceUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() => validateQuote(quote("x", [], "draft"))).not.toThrow();
  });
});
