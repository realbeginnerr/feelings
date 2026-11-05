import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { parseCsv } from "../src/domain";
const target = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("firebase/app", async (original) => ({
  ...(await original<typeof import("firebase/app")>()),
  initializeApp: () => ({}),
}));
vi.mock("firebase/auth", async (original) => ({
  ...(await original<typeof import("firebase/auth")>()),
  getAuth: () => null,
}));
vi.mock("firebase/firestore", async (original) => ({
  ...(await original<typeof import("firebase/firestore")>()),
  getFirestore: () => target.db,
}));
let env: RulesTestEnvironment, repo: typeof import("../src/firebase");
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-feelings",
    firestore: {
      host: "127.0.0.1",
      port: 8085,
      rules: await readFile("firestore.rules", "utf8"),
    },
  });
  await env.clearFirestore();
  const compat = env
    .authenticatedContext("admin", {
      email: "hijmjo@gmail.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  target.db = (compat as unknown as { _delegate: Firestore })._delegate;
  for (const key of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID"])
    vi.stubEnv("VITE_FIREBASE_" + key, "test");
  repo = await import("../src/firebase");
}, 20000);
afterAll(async () => {
  await env?.cleanup();
  vi.unstubAllEnvs();
});
it("imports actual 78 rows atomically and excludes the 9 private drafts from visitor queries", async () => {
  const rows = parseCsv(await readFile("01.csv", "utf8"), [], []);
  expect(await repo.importRows(rows, [], [], {})).toBe(78);
  const all = await repo.loadData(true),
    publicData = await repo.loadData(false);
  expect(all.quotes).toHaveLength(78);
  expect(publicData.quotes).toHaveLength(69);
  expect(all.tags).toHaveLength(31);
  for (const t of all.tags)
    expect(t.quoteCount).toBe(
      all.quotes.filter((q) => q.emotionTagIds.includes(t.id)).length,
    );
}, 20000);
it("rejects repeat imports without duplicate documents", async () => {
  const rows = parseCsv(await readFile("01.csv", "utf8"), [], []);
  await expect(repo.importRows(rows, [], [], {})).rejects.toThrow(
    "등록할 새 문장",
  );
  expect((await repo.loadData(true)).quotes).toHaveLength(78);
});
it("preserves ID on edit, updates tag counts and removes deleted quotes", async () => {
  const all = await repo.loadData(true),
    q = all.quotes.find((q) => q.status === "published")!;
  await repo.saveQuote({
    ...q,
    originalText: q.originalText + " (테스트 편집)",
  });
  expect(
    (await getDoc(doc(target.db!, "counselQuotes", q.id))).data()?.originalText,
  ).toContain("(테스트 편집)");
  await repo.saveQuote(q, true);
  expect((await getDoc(doc(target.db!, "counselQuotes", q.id))).exists()).toBe(
    false,
  );
  const updated = await repo.loadData(true);
  for (const t of updated.tags)
    expect(t.quoteCount).toBe(
      updated.quotes.filter((q) => q.emotionTagIds.includes(t.id)).length,
    );
});
it("blocks deleting linked tags and allows later Big3 assignment", async () => {
  const all = await repo.loadData(true),
    t = all.tags.find((t) => t.quoteCount > 0)!;
  await expect(repo.saveTag(t, true)).rejects.toThrow("먼저 재지정");
  await repo.saveTag({ ...t, big3Ids: ["Balance"] });
  expect(
    (await getDoc(doc(target.db!, "counselTags", t.id))).data()?.big3Ids,
  ).toEqual(["Balance"]);
});
it("resolves concurrent duplicate submissions to exactly one imported document", async () => {
  const rows = parseCsv(
    "문장,해소 대상 감정\n동시 등록 검증 문장,불안",
    [],
    [],
  );
  const results = await Promise.allSettled([
    repo.importRows(rows, [], [], {}),
    repo.importRows(rows, [], [], {}),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const data = await repo.loadData(true);
  expect(
    data.quotes.filter((q) => q.originalText === "동시 등록 검증 문장"),
  ).toHaveLength(1);
  for (const t of data.tags)
    expect(t.quoteCount).toBe(
      data.quotes.filter((q) => q.emotionTagIds.includes(t.id)).length,
    );
}, 20000);
