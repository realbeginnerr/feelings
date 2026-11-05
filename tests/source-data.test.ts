import { readFileSync, existsSync } from "node:fs";
import { expect, it } from "vitest";
import { parseCsv } from "../src/domain";
import { preview } from "../src/preview";
it.skipIf(!existsSync(new URL("../01.csv", import.meta.url)))("preserves real CSV texts and tags, with 9 untagged rows excluded from public preview", () => {
  const rows = parseCsv(
    readFileSync(new URL("../01.csv", import.meta.url), "utf8"),
    [],
    [],
  );
  expect(rows).toHaveLength(78);
  expect(rows.filter((r) => !r.names.length)).toHaveLength(9);
  expect(rows.filter((r) => r.issues.length)).toHaveLength(0);
  expect(preview.quotes).toHaveLength(69);
  expect(preview.tags).toHaveLength(31);
  expect(preview.tags.every((t) => t.big3Ids.length === 0)).toBe(true);
  for (const q of preview.quotes) {
    const row = rows.find((r) => r.text === q.originalText);
    expect(row).toBeTruthy();
    expect(
      q.emotionTagIds
        .map((id) => preview.tags.find((t) => t.id === id)?.nameKo)
        .sort(),
    ).toEqual(row!.names.sort());
  }
});
