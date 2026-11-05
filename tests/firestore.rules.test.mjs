import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  deleteDoc,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
const env = await initializeTestEnvironment({
  projectId: "demo-feelings",
  firestore: {
    host: "127.0.0.1",
    port: 8085,
    rules: await readFile(
      new URL("../firestore.rules", import.meta.url),
      "utf8",
    ),
  },
});
const q = {
  id: "public",
  originalText: "테스트 문장",
  originalLanguage: "ko",
  translationKo: "",
  translationEn: "",
  author: "",
  sourceTitle: "",
  sourceUrl: "",
  emotionTagIds: ["tag"],
  importedBig3Ids: [],
  status: "published",
  copyrightStatus: "approved",
  createdAt: "2026-11-04",
  updatedAt: "2026-11-04",
};
const t = {
  id: "tag",
  nameKo: "불안",
  nameEn: "",
  big3Ids: [],
  isActive: true,
  quoteCount: 2,
};
let count = 0;
async function check(name, fn) {
  await fn();
  console.log(`PASS ${++count}: ${name}`);
}
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "counselQuotes/public"), q);
    await setDoc(doc(db, "counselQuotes/private"), {
      ...q,
      id: "private",
      status: "draft",
    });
    await setDoc(doc(db, "counselTags/tag"), t);
    await setDoc(doc(db, "counselTags/inactive"), {
      ...t,
      id: "inactive",
      isActive: false,
      quoteCount: 0,
    });
  });
  const visitor = env.unauthenticatedContext().firestore();
  const admin = env
    .authenticatedContext("admin", {
      email: "hijmjo@gmail.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  const other = env
    .authenticatedContext("other", {
      email: "other@gmail.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  const unverified = env
    .authenticatedContext("unverified", {
      email: "hijmjo@gmail.com",
      email_verified: false,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  const password = env
    .authenticatedContext("password", {
      email: "hijmjo@gmail.com",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    })
    .firestore();
  await check("visitor reads published quotes", () =>
    assertSucceeds(getDoc(doc(visitor, "counselQuotes/public"))),
  );
  await check("visitor cannot read private quote", () =>
    assertFails(getDoc(doc(visitor, "counselQuotes/private"))),
  );
  await check("public filtered query works", () =>
    assertSucceeds(
      getDocs(
        query(
          collection(visitor, "counselQuotes"),
          where("status", "==", "published"),
          where("copyrightStatus", "==", "approved"),
        ),
      ),
    ),
  );
  await check("unfiltered visitor query denied", () =>
    assertFails(getDocs(collection(visitor, "counselQuotes"))),
  );
  await check("other account cannot read private quote", () =>
    assertFails(getDoc(doc(other, "counselQuotes/private"))),
  );
  await check("unverified admin email denied", () =>
    assertFails(getDoc(doc(unverified, "counselQuotes/private"))),
  );
  await check("non-Google provider denied", () =>
    assertFails(getDoc(doc(password, "counselQuotes/private"))),
  );
  await check("admin reads private quote", () =>
    assertSucceeds(getDoc(doc(admin, "counselQuotes/private"))),
  );
  await check("visitor write denied", () =>
    assertFails(
      setDoc(doc(visitor, "counselQuotes/hack"), { ...q, id: "hack" }),
    ),
  );
  await check("other account write denied", () =>
    assertFails(setDoc(doc(other, "counselQuotes/hack"), { ...q, id: "hack" })),
  );
  await check("admin creates quote", () =>
    assertSucceeds(
      setDoc(doc(admin, "counselQuotes/new"), { ...q, id: "new" }),
    ),
  );
  await check("public quote without tag denied", () =>
    assertFails(
      updateDoc(doc(admin, "counselQuotes/new"), { emotionTagIds: [] }),
    ),
  );
  await check("public quote without approval denied", () =>
    assertFails(
      updateDoc(doc(admin, "counselQuotes/new"), {
        copyrightStatus: "unreviewed",
      }),
    ),
  );
  await check("unsafe URL denied", () =>
    assertFails(
      updateDoc(doc(admin, "counselQuotes/new"), {
        sourceUrl: "javascript:alert(1)",
      }),
    ),
  );
  await check("empty tag draft allowed", () =>
    assertSucceeds(
      updateDoc(doc(admin, "counselQuotes/new"), {
        status: "draft",
        emotionTagIds: [],
      }),
    ),
  );
  await check("pending Big3 allowed", () =>
    assertSucceeds(
      setDoc(doc(admin, "counselTags/pending"), {
        ...t,
        id: "pending",
        quoteCount: 0,
      }),
    ),
  );
  await check("invalid Big3 denied", () =>
    assertFails(
      updateDoc(doc(admin, "counselTags/pending"), { big3Ids: ["Invalid"] }),
    ),
  );
  await check("visitor cannot read inactive tags", () =>
    assertFails(getDoc(doc(visitor, "counselTags/inactive"))),
  );
  await check("active tag query works", () =>
    assertSucceeds(
      getDocs(
        query(
          collection(visitor, "counselTags"),
          where("isActive", "==", true),
        ),
      ),
    ),
  );
  await check("tag with linked quotes cannot be deleted", () =>
    assertFails(deleteDoc(doc(admin, "counselTags/tag"))),
  );
  await check("unlinked tag deletion allowed", () =>
    assertSucceeds(deleteDoc(doc(admin, "counselTags/pending"))),
  );
  await check("other collections remain inaccessible", () =>
    assertFails(getDocs(collection(admin, "recipes"))),
  );
  console.log(`${count} security checks passed.`);
} finally {
  await env.cleanup();
}
