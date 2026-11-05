// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { emptyQuote, type Quote, type Tag } from "../src/domain";
const service = vi.hoisted(() => ({
  loadData: vi.fn(),
  saveQuote: vi.fn(),
  saveTag: vi.fn(),
  importRows: vi.fn(),
}));
vi.mock("../src/firebase", () => ({
  ...service,
  auth: null,
  configured: false,
  ADMIN_EMAIL: "hijmjo@gmail.com",
  login: vi.fn(),
  logout: vi.fn(),
}));
import { App, Admin } from "../src/main";
const tags: Tag[] = [
  {
    id: "a",
    nameKo: "불안",
    nameEn: "",
    isActive: true,
    big3Ids: [],
    quoteCount: 1,
  },
  {
    id: "b",
    nameKo: "조급함",
    nameEn: "",
    isActive: true,
    big3Ids: [],
    quoteCount: 0,
  },
];
const q: Quote = {
  ...emptyQuote(),
  id: "q",
  originalText: "지금의 마음을 살펴보세요.",
  emotionTagIds: ["a"],
  status: "published",
  copyrightStatus: "approved",
};
beforeEach(() => {
  location.hash = "";
  vi.clearAllMocks();
  service.loadData.mockResolvedValue({ quotes: [q], tags });
  service.saveQuote.mockResolvedValue(undefined);
  service.saveTag.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe("visitor flow", () => {
  it("requires a selection, allows multi-selection and opens a scrollable reading view", async () => {
    render(<App />);
    const start = await screen.findByRole("button", {
      name: /나에게 맞는 문장/,
    });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "불안" }));
    fireEvent.click(screen.getByRole("button", { name: "조급함" }));
    expect(screen.getByText("2개의 감정을 골랐어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /조급함/ }));
    fireEvent.click(start);
    expect(screen.getByText(q.originalText)).toBeTruthy();
    expect(document.querySelectorAll("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /감정 다시 선택/ }));
    expect(screen.getByText("1개의 감정을 골랐어요.")).toBeTruthy();
  });
  it("shows a genuine empty result instead of unrelated quotes", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "조급함" }));
    fireEvent.click(screen.getByRole("button", { name: /나에게 맞는 문장/ }));
    expect(screen.getByText("아직 어울리는 문장이 없어요.")).toBeTruthy();
  });
  it("does not offer editable admin controls before login", async () => {
    location.hash = "#admin";
    render(<App />);
    expect(await screen.findByText("문장을 돌보는 공간")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "문장 등록 +" })).toBeNull();
  });
});
function mountAdmin() {
  return render(
    <Admin
      quotes={[q]}
      tags={tags}
      busy={false}
      action={async (fn) => {
        await fn();
      }}
      refresh={async () => {}}
      notify={() => {}}
    />,
  );
}
describe("administrator flow", () => {
  it("edits and saves a quote while preserving its ID", async () => {
    mountAdmin();
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("원문"), {
      target: { value: "수정한 문장" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(service.saveQuote).toHaveBeenCalledWith(
        expect.objectContaining({ id: "q", originalText: "수정한 문장" }),
      ),
    );
  });
  it("cancels an edit without writing to Firebase", () => {
    mountAdmin();
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(service.saveQuote).not.toHaveBeenCalled();
  });
  it("lets admin assign Big3 later and blocks deletion of linked tags", async () => {
    mountAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "감정 태그" }));
    const deletes = screen.getAllByRole("button", { name: "삭제" });
    expect((deletes[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    fireEvent.click(screen.getByLabelText("Balance"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(service.saveTag).toHaveBeenCalledWith(
        expect.objectContaining({ big3Ids: ["Balance"] }),
      ),
    );
  });
});
