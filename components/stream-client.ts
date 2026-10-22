"use client";

import { giveConsent, hasConsent } from "@/lib/privacy";
import { applyEvent, startProgress, type Progress, type Stats, type StreamEvent, type Task } from "@/lib/stream-progress";

const statsKey = (task: Task) => `resume-tailor-${task}-stats`;
const ACCESS_KEY = "resume-tailor-access-code";

function readAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_KEY) ?? "";
  } catch {
    return "";
  }
}

function withAccessCode(init: RequestInit): RequestInit {
  const code = readAccessCode();
  if (!code) return init;
  const headers = new Headers(init.headers);
  headers.set("x-access-code", code);
  return { ...init, headers };
}

/** Asks for the app's access code (when the owner has locked it) and remembers it in this browser. */
function askForAccessCode(retry: boolean): boolean {
  const code = window.prompt(retry ? "That access code isn't right. Try again:" : "This app is private. Enter the access code you were given:");
  if (!code?.trim()) return false;
  try {
    localStorage.setItem(ACCESS_KEY, code.trim());
  } catch {
    /* fine: it will be asked again next time */
  }
  return true;
}

/** A request rejected before streaming started; `data` is the server's JSON body. */
export class StreamRequestError extends Error {
  constructor(
    message: string,
    public data: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function loadStats(task: Task): Stats {
  try {
    const s = JSON.parse(localStorage.getItem(statsKey(task)) ?? "null");
    if (s && Array.isArray(s.durations) && Array.isArray(s.chars)) return s;
  } catch {
    /* unavailable or corrupt: fall back to defaults */
  }
  return { durations: [], chars: [] };
}

function recordStats(task: Task, duration: number, chars: number) {
  try {
    const s = loadStats(task);
    localStorage.setItem(statsKey(task), JSON.stringify({ durations: [...s.durations, duration].slice(-5), chars: [...s.chars, chars].slice(-5) }));
  } catch {
    /* estimates just stay at their defaults */
  }
}

/** Reads newline-delimited JSON events from a streamed response. */
async function* readEvents<D>(res: Response): AsyncGenerator<StreamEvent<D>> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as StreamEvent<D>;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as StreamEvent<D>;
}

/**
 * Calls a streaming API route, reporting progress as it goes, and resolves with the final result.
 * Throws an Error with a user-facing message on failure.
 */
export async function runStream<D>(task: Task, url: string, init: RequestInit, onProgress: (p: Progress) => void): Promise<D> {
  // Covers every path that sends data to the AI (e.g. restoring a backup, then adding a job without visiting Upload).
  if (!hasConsent()) {
    const ok = window.confirm(
      "Your resume and job descriptions are sent to Anthropic's Claude AI to be analysed. They aren't stored on this site's server, and your saved work stays in this browser.\n\nContinue?",
    );
    if (!ok) throw new Error("Cancelled. Nothing was sent.");
    giveConsent();
  }
  const started = Date.now();
  let current = startProgress(started);
  onProgress(current);

  let res = await fetch(url, { method: "POST", ...withAccessCode(init) });
  // A locked app answers 401: ask for the code and retry (twice at most, so a wrong code doesn't loop forever).
  for (let attempt = 0; res.status === 401 && attempt < 2; attempt++) {
    const data = await res.clone().json().catch(() => ({}));
    if (!data.needsAccessCode || !askForAccessCode(attempt > 0 || !!readAccessCode())) break;
    res = await fetch(url, { method: "POST", ...withAccessCode(init) });
  }
  // Validation errors and rate limits come back as plain JSON before any streaming starts.
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new StreamRequestError(data.error ?? "Request failed.", data);
  }
  for await (const e of readEvents<D>(res)) {
    if (e.type === "error") throw new Error(e.message);
    if (e.type === "done") {
      recordStats(task, Date.now() - started, current.chars);
      return e.data;
    }
    current = applyEvent(current, e, Date.now());
    onProgress(current);
  }
  throw new Error("The connection closed before it finished. Please retry.");
}
