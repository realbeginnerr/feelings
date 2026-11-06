import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  auth,
  configured,
  ADMIN_EMAIL,
  login,
  logout,
  loadData,
  saveQuote,
  saveTag,
  importRows,
} from "./firebase";
import {
  BIG3,
  emptyQuote,
  parseCsv,
  recommend,
  type Quote,
  type Tag,
  type ImportRow,
} from "./domain";
import "./style.css";

export function App() {
  const [motion, setMotion] = useState<"forward" | "back" | null>(null);
  const transitionRef = useRef<ViewTransition | null>(null);
  const [page, setPage] = useState(
      location.hash === "#admin" ? "admin" : "home",
    ),
    [user, setUser] = useState<User | null>(null),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [tags, setTags] = useState<Tag[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [results, setResults] = useState<Quote[]>([]),
    [fallback, setFallback] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const admin = !!user && user.email === ADMIN_EMAIL && user.emailVerified;
  async function refresh() {
    setLoading(true);
    try {
      const d = await loadData(admin);
      setQuotes(d.quotes);
      setTags(d.tags);
    } catch {
      setError(
        "데이터를 불러오지 못했어요. 연결과 Firebase 권한 설정을 확인해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (auth)
      return onAuthStateChanged(auth, (u) => {
        setUser(u);
        setResults([]);
        setQuotes([]);
        setTags([]);
      });
  }, []);
  useEffect(() => {
    void refresh();
  }, [admin]);
  useEffect(() => {
    const h = () => setPage(location.hash === "#admin" ? "admin" : "home");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "작업에 실패했어요. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  function changePage(next: string, prepare = () => {}) {
    const direction =
      page === "home" && next === "viewer"
        ? "forward"
        : page === "viewer" && next === "home"
          ? "back"
          : null;
    transitionRef.current?.skipTransition();
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const update = () => {
      flushSync(() => {
        prepare();
        setPage(next);
      });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    if (!direction || reduced || !document.startViewTransition) {
      setMotion(reduced ? null : direction);
      update();
      return;
    }
    setMotion(null);
    document.documentElement.dataset.pageDirection = direction;
    const transition = document.startViewTransition(update);
    transitionRef.current = transition;
    void transition.finished
      .catch(() => {})
      .finally(() => {
        if (transitionRef.current === transition) {
          transitionRef.current = null;
          delete document.documentElement.dataset.pageDirection;
        }
      });
  }
  function navigate(next: string) {
    setError("");
    setNotice("");
    changePage(next);
    location.hash = next === "admin" ? "admin" : "";
  }
  function start() {
    const r = recommend(quotes, tags, selected);
    changePage("viewer", () => {
      setResults(r.quotes);
      setFallback(r.fallback);
    });
  }
  return (
    <>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          칠은영 상담소
          <span className="brand-dot" />
        </a>
        <nav aria-label="주요 메뉴">
          <button
            className={page !== "admin" ? "nav active" : "nav"}
            onClick={() => navigate("home")}
          >
            문장 만나기
          </button>
          <button
            className={page === "admin" ? "nav active" : "nav"}
            onClick={() => navigate("admin")}
          >
            관리자
          </button>
          {admin && (
            <button className="nav" onClick={() => void action(logout)}>
              로그아웃
            </button>
          )}
        </nav>
      </header>
      {!configured && (
        <div className="preview-note">
          {import.meta.env.DEV
            ? "미리보기 · 실제 CSV의 공개 문장 69개를 보고 있어요."
            : "Firebase 연결을 준비하고 있어요."}{" "}
          Firebase 연결 후 관리자 기능을 사용할 수 있어요.
        </div>
      )}
      {error && (
        <div className="message error" role="alert">
          {error}
          <button className="text-button" onClick={() => void refresh()}>
            다시 불러오기
          </button>
        </div>
      )}
      {notice && (
        <div className="message" role="status">
          {notice}
        </div>
      )}
      <div className="page-viewport">
        <div
          key={page}
          className="page-stage"
          data-motion={motion || undefined}
          onAnimationEnd={() => setMotion(null)}
        >
          {loading ? (
            <main className="empty" role="status">
              문장을 불러오고 있어요.
            </main>
          ) : page === "admin" ? (
            <main className="admin-shell">
              {!admin ? (
                <section className="login">
                  <p className="eyebrow">ADMIN</p>
                  <h1>문장을 돌보는 공간</h1>
                  <p>관리자 계정으로 로그인해 주세요.</p>
                  <p className="muted">{ADMIN_EMAIL}</p>
                  <button
                    disabled={!configured || busy}
                    className="primary"
                    onClick={() => void action(login)}
                  >
                    Google 계정으로 로그인 <span>↗</span>
                  </button>
                  {!configured && (
                    <p className="muted">
                      Firebase 연결 설정을 기다리고 있어요.
                    </p>
                  )}
                </section>
              ) : (
                <Admin
                  quotes={quotes}
                  tags={tags}
                  busy={busy}
                  action={action}
                  refresh={refresh}
                  notify={setNotice}
                />
              )}
            </main>
          ) : page === "viewer" ? (
            <>
              <div className="viewer-toolbar">
                <button
                  className="text-button"
                  onClick={() => navigate("home")}
                >
                  ← 감정 다시 선택
                </button>
                <span>{results.length}개의 문장</span>
              </div>
              {fallback && (
                <p className="message">
                  정확히 일치하는 문장이 없어 관련된 감정의 문장을 골랐어요.
                </p>
              )}
              {!results.length ? (
                <main className="empty">
                  <h1>아직 어울리는 문장이 없어요.</h1>
                  <p>다른 감정을 골라 다시 만나볼까요?</p>
                  <button className="primary" onClick={() => navigate("home")}>
                    감정 선택하기
                  </button>
                </main>
              ) : (
                <main className="reading">
                  {results.map((q, i) => (
                    <article className="quote-page" key={q.id}>
                      <div className="quote-number">
                        {String(i + 1).padStart(2, "0")}{" "}
                        <span>/ {String(results.length).padStart(2, "0")}</span>
                      </div>
                      <div>
                        <p
                          className="quote-text"
                          lang={q.originalLanguage || undefined}
                        >
                          {q.originalText}
                        </p>
                        {q.translationKo &&
                          q.translationKo !== q.originalText && (
                            <p className="translation">{q.translationKo}</p>
                          )}
                        {(q.author || q.sourceTitle) && (
                          <p className="source">
                            {[q.author, q.sourceTitle]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        {/^https?:\/\//.test(q.sourceUrl) && (
                          <a
                            className="text-button"
                            href={q.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            출처 보기 ↗
                          </a>
                        )}
                      </div>
                      <div className="reading-bottom">
                        <div className="small-tags">
                          {q.emotionTagIds
                            .map((id) => tags.find((t) => t.id === id))
                            .filter((t): t is Tag => !!t && t.isActive)
                            .map((t) => (
                              <span key={t.id}>{t.nameKo}</span>
                            ))}
                        </div>
                        <span className="muted">
                          {i < results.length - 1
                            ? "아래로 내려 다음 문장 만나기 ↓"
                            : "오늘의 문장은 여기까지예요."}
                        </span>
                      </div>
                    </article>
                  ))}
                </main>
              )}
            </>
          ) : (
            <main>
              <section className="hero">
                <p className="eyebrow">칠은영 상담소</p>
                <h1>
                  지금 어떤 감정을
                  <br />
                  느끼고 있나요?
                </h1>
                <p className="intro">
                  잠시 마음을 들여다봐요.
                  <br />
                  지금의 당신에게 어울리는 문장을 함께 찾아볼게요.
                </p>
              </section>
              <section className="selection" aria-labelledby="feel-label">
                <div className="section-heading">
                  <h2 id="feel-label">마음에 가까운 감정을 골라 주세요.</h2>
                  <span className="muted">여러 개를 선택해도 괜찮아요.</span>
                </div>
                <div className="tag-grid">
                  {tags
                    .filter((t) => t.isActive)
                    .sort((a, b) => a.nameKo.localeCompare(b.nameKo, "ko"))
                    .map((t) => (
                      <button
                        key={t.id}
                        className={
                          "chip " + (selected.includes(t.id) ? "selected" : "")
                        }
                        aria-pressed={selected.includes(t.id)}
                        onClick={() =>
                          setSelected((s) =>
                            s.includes(t.id)
                              ? s.filter((id) => id !== t.id)
                              : [...s, t.id],
                          )
                        }
                      >
                        {t.nameKo}
                        {selected.includes(t.id) && (
                          <span aria-hidden="true">✓</span>
                        )}
                      </button>
                    ))}
                </div>
                {!tags.filter((t) => t.isActive).length && (
                  <p className="muted">
                    아직 등록된 감정이 없어요. 관리자가 첫 문장을 준비하고
                    있어요.
                  </p>
                )}
                <div className="selection-footer">
                  <span className="muted" aria-live="polite">
                    {selected.length
                      ? `${selected.length}개의 감정을 골랐어요.`
                      : "천천히, 지금의 마음을 골라 보세요."}
                  </span>
                  <button
                    className="primary"
                    disabled={
                      !selected.some((id) =>
                        tags.some((t) => t.id === id && t.isActive),
                      )
                    }
                    onClick={start}
                  >
                    나에게 맞는 문장 만나기 <span>↗</span>
                  </button>
                </div>
              </section>
              <section className="closing">
                <span>마음을 위한 작은 여백</span>
                <p>
                  정답을 찾기보다,
                  <br />내 마음을 알아가는 시간.
                </p>
              </section>
            </main>
          )}
        </div>
      </div>
      <footer>
        <span>칠은영 상담소</span>
        <span>당신의 마음에, 한 문장.</span>
      </footer>
    </>
  );
}

type AdminProps = {
  quotes: Quote[];
  tags: Tag[];
  busy: boolean;
  action: (f: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
};
export function Admin({
  quotes,
  tags,
  busy,
  action,
  refresh,
  notify,
}: AdminProps) {
  const [tab, setTab] = useState("quotes"),
    [edit, setEdit] = useState<Quote | null>(null),
    [tagEdit, setTagEdit] = useState<Tag | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [tagFilter, setTagFilter] = useState(""),
    [rows, setRows] = useState<ImportRow[]>([]),
    [excluded, setExcluded] = useState<number[]>([]),
    [languages, setLanguages] = useState<Record<number, string>>({}),
    [file, setFile] = useState("");
  const modalOpen = Boolean(edit || tagEdit);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      if (e.key === "Escape" && !busy) {
        setEdit(null);
        setTagEdit(null);
      }
      if (e.key === "Tab") {
        const items = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
          ),
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modalOpen, busy]);
  const list = quotes.filter(
    (q) =>
      (filter === "all" || q.status === filter) &&
      (!tagFilter || q.emotionTagIds.includes(tagFilter)) &&
      (q.originalText.toLowerCase().includes(search.toLowerCase()) ||
        q.emotionTagIds.some((id) =>
          tags.find((t) => t.id === id)?.nameKo.includes(search),
        )),
  );
  async function commitQuote() {
    if (!edit) return;
    if (
      quotes.some(
        (q) =>
          q.id !== edit.id &&
          q.originalText.trim().replace(/\s+/g, " ") ===
            edit.originalText.trim().replace(/\s+/g, " "),
      )
    )
      throw new Error("동일한 문장이 이미 있어요.");
    await saveQuote(edit);
    setEdit(null);
    await refresh();
    notify("문장을 저장했어요.");
  }
  async function readFile(f: File) {
    if (f.size > 5 * 1024 * 1024)
      throw new Error("5MB 이하의 CSV 파일을 선택해 주세요.");
    setRows([]);
    setFile("");
    const data = parseCsv(await f.text(), quotes, tags);
    setRows(data);
    setExcluded([]);
    setLanguages({});
    setFile(f.name);
  }
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">ADMIN</p>
          <h1>문장 관리</h1>
        </div>
        <p className="muted">
          문장 {quotes.length}개 · 공개{" "}
          {quotes.filter((q) => q.status === "published").length}개
        </p>
      </div>
      <div className="tabs" role="tablist" aria-label="관리 메뉴">
        {[
          ["quotes", "문장"],
          ["tags", "감정 태그"],
          ["import", "CSV 가져오기"],
        ].map(([id, name]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => {
              setTab(id);
              setEdit(null);
              setTagEdit(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "quotes" && (
        <>
          <div className="tools">
            <label className="search-label">
              문장 검색
              <input
                aria-label="문장 검색"
                placeholder="문장 또는 감정 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              공개 상태
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">전체 상태</option>
                <option value="published">공개</option>
                <option value="draft">비공개</option>
              </select>
            </label>
            <label>
              감정
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">전체 감정</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameKo}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" onClick={() => setEdit(emptyQuote())}>
              문장 등록 +
            </button>
          </div>
          <div className="records">
            {list.map((q) => (
              <div className="record" key={q.id}>
                <div>
                  <span className={"badge " + q.status}>
                    {q.status === "published" ? "공개" : "비공개"}
                  </span>
                  <p className="record-text">{q.originalText}</p>
                  <div className="small-tags">
                    {q.emotionTagIds.map((id) => (
                      <span key={id}>
                        {tags.find((t) => t.id === id)?.nameKo || "삭제된 감정"}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className="secondary"
                    onClick={() => setEdit({ ...q })}
                  >
                    수정
                  </button>
                  <button
                    disabled={busy}
                    className="text-button danger"
                    onClick={() => {
                      if (
                        confirm(
                          "이 문장을 삭제할까요? 삭제 후 복구할 수 없어요.",
                        )
                      )
                        void action(async () => {
                          await saveQuote(q, true);
                          await refresh();
                        });
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
            {!list.length && <p className="empty">표시할 문장이 없어요.</p>}
          </div>
        </>
      )}
      {tab === "tags" && (
        <>
          <div className="tools">
            <p className="muted">
              Big 3는 나중에 지정할 수 있어요. 연결된 문장이 있으면 감정을 먼저
              재지정해 주세요.
            </p>
            <button
              className="primary"
              onClick={() =>
                setTagEdit({
                  id: crypto.randomUUID(),
                  nameKo: "",
                  nameEn: "",
                  big3Ids: [],
                  isActive: true,
                  quoteCount: 0,
                })
              }
            >
              감정 추가 +
            </button>
          </div>
          <div className="records">
            {tags
              .sort((a, b) => a.nameKo.localeCompare(b.nameKo, "ko"))
              .map((t) => (
                <div className="record" key={t.id}>
                  <div>
                    <h3>
                      {t.nameKo} <span className="muted">{t.nameEn}</span>
                    </h3>
                    <p className="muted">
                      {t.big3Ids.join(" · ") || "Big 3 미지정"} · 문장{" "}
                      {t.quoteCount}개 · {t.isActive ? "활성" : "비활성"}
                    </p>
                  </div>
                  <div className="row-actions">
                    <button
                      className="secondary"
                      onClick={() => setTagEdit({ ...t })}
                    >
                      수정
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy || t.quoteCount > 0}
                      title={
                        t.quoteCount
                          ? "연결된 문장의 감정을 먼저 재지정해 주세요."
                          : undefined
                      }
                      onClick={() => {
                        if (confirm(`‘${t.nameKo}’ 감정을 삭제할까요?`))
                          void action(async () => {
                            await saveTag(t, true);
                            await refresh();
                          });
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}
      {tab === "import" && (
        <section className="import-panel">
          <h2>CSV에서 문장 가져오기</h2>
          <p className="muted">
            문장과 감정 키워드를 그대로 가져와요. 감정이 있으면 바로 공개하고,
            감정이 없으면 비공개 초안으로 저장해요.
          </p>
          <label className="file-box">
            CSV 파일 선택
            <input
              disabled={busy}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void action(() => readFile(f));
                e.target.value = "";
              }}
            />
          </label>
          <p className="muted">
            UTF-8 CSV · 최대 5MB · XLSX 지원은 다음 단계에서 추가해요.
          </p>
          {rows.length > 0 && (
            <>
              <div className="import-summary">
                <h3>{file}</h3>
                <p>
                  총 {rows.length}개 · 오류{" "}
                  {rows.filter((r) => r.issues.length).length}개 · 경고{" "}
                  {
                    rows.filter((r) => !r.issues.length && r.warning.length)
                      .length
                  }
                  개
                </p>
                <p className="muted">
                  매핑: 문장 → 원문 / 해소 대상 감정 → 감정 태그
                  <br />새 감정의 Big 3와 영어 이름은 미지정으로 두어요. 원문
                  언어는 아래에서 확인해 주세요.
                </p>
              </div>
              <div className="import-rows">
                {rows.map((r) => (
                  <div
                    className={
                      "import-row " + (r.issues.length ? "invalid" : "")
                    }
                    key={r.line}
                  >
                    <label className="check">
                      <input
                        type="checkbox"
                        disabled={!!r.issues.length || busy}
                        checked={!excluded.includes(r.line) && !r.issues.length}
                        onChange={() =>
                          setExcluded((a) =>
                            a.includes(r.line)
                              ? a.filter((n) => n !== r.line)
                              : [...a, r.line],
                          )
                        }
                      />
                      {r.line}행
                    </label>
                    <div>
                      <p className="record-text">{r.text}</p>
                      <p className="muted">
                        {r.names.join(" · ") || "감정 없음"}
                      </p>
                      {r.big3.length > 0 && (
                        <p className="muted">원본 Big 3: {r.big3.join(", ")}</p>
                      )}
                      <p className={r.issues.length ? "danger" : "muted"}>
                        {[...r.issues, ...r.warning].join(" / ") || "정상"}
                      </p>
                    </div>
                    <label>
                      원문 언어
                      <select
                        disabled={busy}
                        value={languages[r.line] || ""}
                        onChange={(e) =>
                          setLanguages((l) => ({
                            ...l,
                            [r.line]: e.target.value,
                          }))
                        }
                      >
                        <option value="">미확인</option>
                        <option value="ko">한국어</option>
                        <option value="en">영어</option>
                        <option value="other">기타</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              <div className="import-confirm">
                <p>
                  선택한{" "}
                  {
                    rows.filter(
                      (r) => !r.issues.length && !excluded.includes(r.line),
                    ).length
                  }
                  개 문장을 등록해요. 언어 미확인 문장은 원문 그대로 표시해요.
                </p>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !rows.some(
                      (r) => !r.issues.length && !excluded.includes(r.line),
                    )
                  }
                  onClick={() =>
                    void action(async () => {
                      const count = await importRows(
                        rows.filter((r) => !excluded.includes(r.line)),
                        quotes,
                        tags,
                        languages,
                      );
                      setRows([]);
                      await refresh();
                      notify(`${count}개의 문장을 등록했어요.`);
                    })
                  }
                >
                  {busy ? "등록 중…" : "확인 후 등록"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {edit && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-edit-title"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(commitQuote);
              }}
            >
              <h2 id="quote-edit-title">
                문장 {quotes.some((q) => q.id === edit.id) ? "수정" : "등록"}
              </h2>
              <label>
                원문
                <textarea
                  required
                  autoFocus
                  rows={5}
                  maxLength={20000}
                  value={edit.originalText}
                  onChange={(e) =>
                    setEdit({ ...edit, originalText: e.target.value })
                  }
                />
              </label>
              <label>
                원문 언어
                <select
                  value={edit.originalLanguage}
                  onChange={(e) =>
                    setEdit({ ...edit, originalLanguage: e.target.value })
                  }
                >
                  <option value="">미확인</option>
                  <option value="ko">한국어</option>
                  <option value="en">영어</option>
                  <option value="other">기타</option>
                </select>
              </label>
              {(
                [
                  "translationKo",
                  "translationEn",
                  "author",
                  "sourceTitle",
                  "sourceUrl",
                ] as const
              ).map((key, i) => (
                <label key={key}>
                  {
                    [
                      "한국어 번역",
                      "영어 번역",
                      "저자 / 발언자",
                      "출처명",
                      "출처 URL",
                    ][i]
                  }
                  <input
                    type={key === "sourceUrl" ? "url" : "text"}
                    value={edit[key]}
                    onChange={(e) =>
                      setEdit({ ...edit, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <fieldset>
                <legend>감정 태그</legend>
                <div className="tag-grid">
                  {tags.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className={
                        "chip " +
                        (edit.emotionTagIds.includes(t.id) ? "selected" : "")
                      }
                      aria-pressed={edit.emotionTagIds.includes(t.id)}
                      onClick={() =>
                        setEdit({
                          ...edit,
                          emotionTagIds: edit.emotionTagIds.includes(t.id)
                            ? edit.emotionTagIds.filter((id) => id !== t.id)
                            : [...edit.emotionTagIds, t.id],
                        })
                      }
                    >
                      {t.nameKo}
                      {!t.isActive ? " (비활성)" : ""}
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="muted">
                원본 Big 3: {edit.importedBig3Ids.join(" · ") || "없음"}
              </p>
              <label>
                공개 허용
                <select
                  value={edit.copyrightStatus}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      copyrightStatus: e.target
                        .value as Quote["copyrightStatus"],
                    })
                  }
                >
                  <option value="unreviewed">미확인</option>
                  <option value="approved">공개 허용</option>
                  <option value="restricted">공개 제한</option>
                </select>
              </label>
              <label>
                공개 상태
                <select
                  value={edit.status}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      status: e.target.value as Quote["status"],
                    })
                  }
                >
                  <option value="draft">비공개</option>
                  <option value="published">공개</option>
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="secondary"
                  onClick={() => setEdit(null)}
                >
                  취소
                </button>
                <button disabled={busy} className="primary" type="submit">
                  {busy ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {tagEdit && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tag-edit-title"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  if (!tagEdit.nameKo.trim())
                    throw new Error("감정 이름을 입력해 주세요.");
                  if (
                    tags.some(
                      (t) =>
                        t.id !== tagEdit.id &&
                        (t.nameKo.trim() === tagEdit.nameKo.trim() ||
                          (tagEdit.nameEn.trim() &&
                            t.nameEn.toLowerCase() ===
                              tagEdit.nameEn.trim().toLowerCase())),
                    )
                  )
                    throw new Error("이미 등록된 감정 이름이에요.");
                  await saveTag(tagEdit);
                  setTagEdit(null);
                  await refresh();
                  notify("감정을 저장했어요.");
                });
              }}
            >
              <h2 id="tag-edit-title">감정 태그 편집</h2>
              <label>
                한국어 이름
                <input
                  required
                  autoFocus
                  value={tagEdit.nameKo}
                  onChange={(e) =>
                    setTagEdit({ ...tagEdit, nameKo: e.target.value })
                  }
                />
              </label>
              <label>
                영어 이름
                <input
                  value={tagEdit.nameEn}
                  onChange={(e) =>
                    setTagEdit({ ...tagEdit, nameEn: e.target.value })
                  }
                />
              </label>
              <fieldset>
                <legend>Big 3 연결</legend>
                {BIG3.map((b) => (
                  <label className="check" key={b}>
                    <input
                      type="checkbox"
                      checked={tagEdit.big3Ids.includes(b)}
                      onChange={() =>
                        setTagEdit({
                          ...tagEdit,
                          big3Ids: tagEdit.big3Ids.includes(b)
                            ? tagEdit.big3Ids.filter((v) => v !== b)
                            : [...tagEdit.big3Ids, b],
                        })
                      }
                    />
                    {b}
                  </label>
                ))}
              </fieldset>
              <label className="check">
                <input
                  type="checkbox"
                  checked={tagEdit.isActive}
                  onChange={(e) =>
                    setTagEdit({ ...tagEdit, isActive: e.target.checked })
                  }
                />
                활성 · 사용자에게 표시
              </label>
              <p className="muted">연결된 문장 {tagEdit.quoteCount}개</p>
              <div className="modal-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="secondary"
                  onClick={() => setTagEdit(null)}
                >
                  취소
                </button>
                <button className="primary" disabled={busy}>
                  저장
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
