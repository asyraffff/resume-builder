"use client";

import { useSyncExternalStore } from "react";
import type { StateStorage } from "zustand/middleware";

const STORAGE_EVENT = "resume-tailor-storage";
let saveFailed = false;

function setSaveFailed(failed: boolean) {
  if (failed === saveFailed) return;
  saveFailed = failed;
  // No window during server rendering or tests.
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STORAGE_EVENT));
}

/** True while the latest save to browser storage failed (usually because storage is full). */
export function useSaveFailed() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(STORAGE_EVENT, onChange);
      return () => window.removeEventListener(STORAGE_EVENT, onChange);
    },
    () => saveFailed,
    () => false,
  );
}

// localStorage can be unavailable (private mode, blocked storage) — never let that break the app.
export const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
      setSaveFailed(false);
    } catch {
      // Usually the browser's storage quota. Tell the UI so the user isn't silently losing work.
      setSaveFailed(true);
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
