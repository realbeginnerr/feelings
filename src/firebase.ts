import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  runTransaction,
} from "firebase/firestore";
import {
  emptyQuote,
  normalize,
  validateQuote,
  type Quote,
  type Tag,
  type ImportRow,
} from "./domain";
const e = import.meta.env;
export const configured = Boolean(
  e.VITE_FIREBASE_API_KEY &&
  e.VITE_FIREBASE_AUTH_DOMAIN &&
  e.VITE_FIREBASE_PROJECT_ID &&
  e.VITE_FIREBASE_APP_ID,
);
const app = configured
  ? initializeApp({
      apiKey: e.VITE_FIREBASE_API_KEY,
      authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: e.VITE_FIREBASE_PROJECT_ID,
      appId: e.VITE_FIREBASE_APP_ID,
    })
  : null;
export const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
export const ADMIN_EMAIL = "hijmjo@gmail.com";
export async function login() {
  if (!auth) throw new Error("Firebase 연결 설정이 필요해요.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    login_hint: ADMIN_EMAIL,
    prompt: "select_account",
  });
  const result = await signInWithPopup(auth, provider);
  if (result.user.email !== ADMIN_EMAIL || !result.user.emailVerified) {
    await signOut(auth);
    throw new Error("지정된 관리자 계정만 로그인할 수 있어요.");
  }
}
export async function logout() {
  if (auth) await signOut(auth);
}
export async function loadData(
  admin = false,
): Promise<{ quotes: Quote[]; tags: Tag[] }> {
  if (!db) {
    if (!import.meta.env.DEV) throw new Error("Firebase 연결 설정이 필요해요.");
    const { preview } = await import("./preview");
    return preview;
  }
  const qs = collection(db, "counselQuotes"),
    ts = collection(db, "counselTags");
  const [q, t] = await Promise.all([
    getDocs(
      admin
        ? qs
        : query(
            qs,
            where("status", "==", "published"),
            where("copyrightStatus", "==", "approved"),
          ),
    ),
    getDocs(admin ? ts : query(ts, where("isActive", "==", true))),
  ]);
  return {
    quotes: q.docs.map((d) => ({ ...d.data(), id: d.id }) as Quote),
    tags: t.docs.map((d) => ({ ...d.data(), id: d.id }) as Tag),
  };
}
function database() {
  if (!db) throw new Error("Firebase 설정 후 관리자 기능을 사용할 수 있어요.");
  return db;
}
async function digest(s: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function saveQuote(q: Quote, remove = false) {
  validateQuote(remove ? { ...q, status: "draft" } : q);
  const store = database(),
    ref = doc(store, "counselQuotes", q.id);
  const keyRef = doc(
    store,
    "counselQuoteKeys",
    await digest(normalize(q.originalText)),
  );
  await runTransaction(store, async (tx) => {
    const old = await tx.get(ref),
      key = await tx.get(keyRef);
    const oldKeyRef = old.exists()
      ? doc(
          store,
          "counselQuoteKeys",
          await digest(normalize(old.data().originalText)),
        )
      : null;
    const before = old.exists() ? (old.data().emotionTagIds as string[]) : [],
      after = remove ? [] : [...new Set(q.emotionTagIds)],
      ids = [...new Set([...before, ...after])];
    const snapshots = await Promise.all(
      ids.map((id) => tx.get(doc(store, "counselTags", id))),
    );
    if (
      !remove &&
      key.exists() &&
      key.data().active &&
      key.data().quoteId !== q.id
    )
      throw new Error("동일한 문장이 이미 있어요.");
    snapshots.forEach((snap, i) => {
      if (!snap.exists())
        throw new Error(
          "삭제된 감정이 있어요. 새로고침 후 다시 시도해 주세요.",
        );
      const delta =
        Number(after.includes(ids[i])) - Number(before.includes(ids[i]));
      if (delta)
        tx.update(snap.ref, {
          quoteCount: Math.max(0, (snap.data().quoteCount || 0) + delta),
        });
    });
    if (oldKeyRef && (remove || oldKeyRef.id !== keyRef.id))
      tx.set(oldKeyRef, { quoteId: q.id, active: false });
    if (remove) tx.delete(ref);
    else {
      tx.set(keyRef, { quoteId: q.id, active: true });
      tx.set(ref, {
        ...q,
        emotionTagIds: after,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}
export async function saveTag(t: Tag, remove = false) {
  const store = database();
  const ref = doc(store, "counselTags", t.id);
  await runTransaction(store, async (tx) => {
    const current = await tx.get(ref);
    if (remove) {
      if (current.exists() && current.data().quoteCount > 0)
        throw new Error("연결된 문장의 감정을 먼저 재지정해 주세요.");
      tx.delete(ref);
    } else
      tx.set(ref, {
        ...t,
        nameKo: t.nameKo.trim(),
        nameEn: t.nameEn.trim(),
        quoteCount: current.exists() ? current.data().quoteCount : 0,
      });
  });
}
export async function importRows(
  rows: ImportRow[],
  _quotes: Quote[],
  _tags: Tag[],
  languages: Record<number, string>,
) {
  const store = database(),
    fresh = await loadData(true),
    existing = new Set(fresh.quotes.map((q) => normalize(q.originalText))),
    allTags = [...fresh.tags];
  const candidates: { q: Quote; key: string }[] = [];
  for (const row of rows) {
    if (row.issues.length || existing.has(normalize(row.text))) continue;
    existing.add(normalize(row.text));
    const ids: string[] = [];
    for (const name of row.names) {
      let t = allTags.find((t) => t.nameKo === name);
      if (!t) {
        t = {
          id: "import-" + (await digest(name)),
          nameKo: name,
          nameEn: "",
          big3Ids: [],
          isActive: true,
          quoteCount: 0,
        };
        allTags.push(t);
      }
      ids.push(t.id);
    }
    const q = {
      ...emptyQuote(),
      originalText: row.text,
      originalLanguage: languages[row.line] || "",
      emotionTagIds: ids,
      importedBig3Ids: row.big3,
      status: ids.length ? "published" : "draft",
      copyrightStatus: "approved",
    } as Quote;
    validateQuote(q);
    candidates.push({ q, key: await digest(normalize(row.text)) });
  }
  if (!candidates.length) throw new Error("등록할 새 문장이 없어요.");
  const usedTags = allTags.filter((t) =>
    candidates.some((c) => c.q.emotionTagIds.includes(t.id)),
  );
  if (candidates.length * 2 + usedTags.length > 450)
    throw new Error(
      "파일을 더 작게 나눠서 가져와 주세요. 한 번에 약 150개를 권장해요.",
    );
  return runTransaction(store, async (tx) => {
    const keys = await Promise.all(
      candidates.map((c) => tx.get(doc(store, "counselQuoteKeys", c.key))),
    );
    const tagDocs = await Promise.all(
      usedTags.map((t) => tx.get(doc(store, "counselTags", t.id))),
    );
    const accepted = candidates.filter(
      (_, i) => !keys[i].exists() || !keys[i].data()?.active,
    );
    if (!accepted.length)
      throw new Error("이미 등록된 문장이에요. 중복 등록하지 않았어요.");
    for (const t of usedTags) {
      const index = usedTags.indexOf(t),
        snapshot = tagDocs[index],
        count = accepted.filter((c) => c.q.emotionTagIds.includes(t.id)).length;
      if (count)
        tx.set(snapshot.ref, {
          ...(snapshot.exists() ? snapshot.data() : t),
          quoteCount:
            (snapshot.exists() ? snapshot.data().quoteCount : 0) + count,
        });
    }
    for (const { q, key } of accepted) {
      tx.set(doc(store, "counselQuotes", q.id), q);
      tx.set(doc(store, "counselQuoteKeys", key), {
        quoteId: q.id,
        active: true,
      });
    }
    return accepted.length;
  });
}
