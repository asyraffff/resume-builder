import type { StoreApi, UseBoundStore } from "zustand";
import type { Resume } from "@/lib/schemas";
import { STORAGE_PREFIX } from "@/lib/privacy";

/**
 * Keeps the active job's undo/redo history across page reloads. It goes in sessionStorage rather than with the
 * saved resumes: it has its own quota (so history can't crowd out your data), and it clears when the tab closes,
 * which is when people expect undo to start fresh.
 */

const KEY = `${STORAGE_PREFIX}-undo`;
const MAX_STEPS = 30;

type Saved = { workspaceId: string | null; jobId: string | null; editedAt: number; past: Resume[]; future: Resume[] };

type UndoState = {
  activeWorkspaceId: string | null;
  activeJobId: string | null;
  editedAt: number;
  past: Resume[];
  future: Resume[];
};

export function persistUndoHistory<S extends UndoState>(store: UseBoundStore<StoreApi<S>> & { persist: { onFinishHydration: (fn: () => void) => void; hasHydrated: () => boolean } }) {
  const restore = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null;
      const s = store.getState();
      // Only if it belongs to what's open and nothing changed since (e.g. edits made in another tab).
      if (saved && saved.workspaceId === s.activeWorkspaceId && saved.jobId === s.activeJobId && saved.editedAt === s.editedAt) {
        store.setState({ past: saved.past, future: saved.future } as Partial<S>);
      }
    } catch {
      /* nothing to restore */
    }
  };
  if (store.persist.hasHydrated()) restore();
  else store.persist.onFinishHydration(restore);

  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((s, prev) => {
    if (s.past === prev.past && s.future === prev.future && s.activeJobId === prev.activeJobId && s.activeWorkspaceId === prev.activeWorkspaceId) return;
    clearTimeout(timer);
    // Typing changes history constantly; write once things settle.
    timer = setTimeout(() => {
      const cur = store.getState();
      const saved: Saved = {
        workspaceId: cur.activeWorkspaceId,
        jobId: cur.activeJobId,
        editedAt: cur.editedAt,
        past: cur.past.slice(-MAX_STEPS),
        future: cur.future.slice(0, MAX_STEPS),
      };
      try {
        if (!saved.past.length && !saved.future.length) sessionStorage.removeItem(KEY);
        else sessionStorage.setItem(KEY, JSON.stringify(saved));
      } catch {
        /* over quota or unavailable: undo still works until the page reloads */
      }
    }, 400);
  });
}
