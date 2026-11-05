import Papa from "papaparse";
export const BIG3 = ["Balance", "Dominance", "Stimulance"] as const;
export type Big3 = (typeof BIG3)[number];
export type Tag = {
  id: string;
  nameKo: string;
  nameEn: string;
  big3Ids: Big3[];
  isActive: boolean;
  quoteCount: number;
};
export type Quote = {
  id: string;
  originalText: string;
  originalLanguage: string;
  translationKo: string;
  translationEn: string;
  author: string;
  sourceTitle: string;
  sourceUrl: string;
  emotionTagIds: string[];
  importedBig3Ids: Big3[];
  status: "draft" | "published";
  copyrightStatus: "unreviewed" | "approved" | "restricted";
  createdAt: string;
  updatedAt: string;
};
export const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
export const values = (s: string) => [
  ...new Set(
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
export const emptyQuote = (): Quote => ({
  id: crypto.randomUUID(),
  originalText: "",
  originalLanguage: "",
  translationKo: "",
  translationEn: "",
  author: "",
  sourceTitle: "",
  sourceUrl: "",
  emotionTagIds: [],
  importedBig3Ids: [],
  status: "draft",
  copyrightStatus: "unreviewed",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
export function validateQuote(q: Quote) {
  if (!q.originalText.trim()) throw new Error("문장 원문을 입력해 주세요.");
  if (q.originalText.length > 20000)
    throw new Error("문장은 20,000자 이내로 입력해 주세요.");
  if (q.status === "published" && !q.emotionTagIds.length)
    throw new Error("공개하려면 감정을 하나 이상 지정해 주세요.");
  if (q.status === "published" && q.copyrightStatus !== "approved")
    throw new Error("공개하려면 공개 허용 상태를 확인해 주세요.");
  if (q.sourceUrl) {
    let u: URL;
    try {
      u = new URL(q.sourceUrl);
    } catch {
      throw new Error("올바른 출처 URL을 입력해 주세요.");
    }
    if (!["https:", "http:"].includes(u.protocol))
      throw new Error("출처는 HTTP 또는 HTTPS 링크만 사용할 수 있어요.");
  }
}
export function shuffled<T>(list: T[], random = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function recommend(
  quotes: Quote[],
  tags: Tag[],
  selected: string[],
  random = Math.random,
) {
  const active = tags.filter((t) => t.isActive),
    valid = new Set(active.map((t) => t.id));
  const s = new Set(selected.filter((id) => valid.has(id)));
  const published = quotes.filter(
    (q) => q.status === "published" && q.copyrightStatus === "approved",
  );
  const direct = published
    .map((q) => ({
      q,
      score: q.emotionTagIds.filter((id) => s.has(id)).length,
    }))
    .filter((x) => x.score > 0);
  const areas = new Set(
    active.filter((t) => s.has(t.id)).flatMap((t) => t.big3Ids),
  );
  const candidates = direct.length
    ? direct
    : published
        .map((q) => {
          const union = new Set(
            active
              .filter((t) => q.emotionTagIds.includes(t.id))
              .flatMap((t) => t.big3Ids),
          );
          return { q, score: [...union].filter((b) => areas.has(b)).length };
        })
        .filter((x) => x.score > 0);
  return {
    quotes: shuffled(candidates, random)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.q),
    fallback: !direct.length && candidates.length > 0,
  };
}
export type ImportRow = {
  line: number;
  text: string;
  names: string[];
  big3: Big3[];
  issues: string[];
  warning: string[];
  duplicate: boolean;
};
export function parseCsv(
  text: string,
  existing: Quote[],
  tags: Tag[],
): ImportRow[] {
  if (text.includes("\uFFFD"))
    throw new Error(
      "문자 인코딩을 확인해 주세요. UTF-8 CSV로 저장한 뒤 다시 시도해 주세요.",
    );
  const parsed = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    },
  );
  if (parsed.errors.length)
    throw new Error(`CSV 형식을 확인해 주세요: ${parsed.errors[0].message}`);
  const fields = parsed.meta.fields || [];
  const textKey = fields.includes("문장") ? "문장" : "문장 내용",
    tagKey = fields.includes("해소 대상 감정")
      ? "해소 대상 감정"
      : "구체적 키워드";
  if (!fields.includes(textKey) || !fields.includes(tagKey))
    throw new Error(
      "필수 열이 없어요. ‘문장 / 해소 대상 감정’ 또는 ‘문장 내용 / 구체적 키워드’를 사용해 주세요.",
    );
  const seen = new Set(existing.map((q) => normalize(q.originalText))),
    known = new Map(tags.map((t) => [t.nameKo, t]));
  return parsed.data.map((r, i) => {
    const original = r[textKey] || "",
      names = values(r[tagKey] || ""),
      raw = values(r["림빅맵 중 어디에 해당하는지"] || "");
    const issues: string[] = [],
      warning: string[] = [];
    const duplicate = seen.has(normalize(original));
    seen.add(normalize(original));
    if (!original.trim()) issues.push("빈 문장");
    if (original.length > 20000) issues.push("20,000자 초과");
    if (duplicate) issues.push("중복 문장");
    if (raw.some((b) => !BIG3.includes(b as Big3)))
      issues.push("알 수 없는 Big 3");
    if (!names.length) warning.push("감정 없음 · 비공개 초안");
    if (names.some((n) => !known.has(n)))
      warning.push("신규 감정 · Big 3 미지정");
    const big3 = raw.filter((b) => BIG3.includes(b as Big3)) as Big3[];
    if (
      big3.length &&
      names.some((n) => {
        const t = known.get(n);
        return (
          t && [...new Set(t.big3Ids)].sort().join() !== [...big3].sort().join()
        );
      })
    )
      warning.push("원본 Big 3와 태그 분류 불일치");
    return {
      line: i + 2,
      text: original,
      names,
      big3,
      issues,
      warning,
      duplicate,
    };
  });
}
