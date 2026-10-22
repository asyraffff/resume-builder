"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "./ui";

/**
 * In-page replacements for window.confirm / window.prompt. The native ones can be silently blocked: some in-app
 * browsers and embedded views make confirm() return false without showing anything, and Chrome lets people turn
 * a page's dialogs off. Usable from any code: `if (await confirmDialog({...})) ...`.
 */

type Request = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for actions that delete things. */
  danger?: boolean;
  /** Ask for text instead of yes/no. */
  input?: { label: string; type?: "text" | "password" };
};
type Pending = Request & { id: number; resolve: (value: string | boolean | null) => void };

let current: Pending | null = null;
let nextId = 0;
const queue: Pending[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

function open(req: Request): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    queue.push({ ...req, id: ++nextId, resolve });
    if (!current) next();
  });
}
function next() {
  current = queue.shift() ?? null;
  emit();
}
function settle(value: string | boolean | null) {
  current?.resolve(value);
  next();
}

export const confirmDialog = (req: Omit<Request, "input">) => open(req) as Promise<boolean>;
export const promptDialog = (req: Request & { input: NonNullable<Request["input"]> }) => open(req) as Promise<string | null>;

/** Renders whichever dialog is open. Mounted once, in the root layout. */
export function DialogHost() {
  const req = useSyncExternalStore(subscribe, () => current, () => null);
  return req ? <DialogView key={req.id} req={req} /> : null;
}

function DialogView({ req }: { req: Pending }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const cancelValue = req.input ? null : false;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal(); // modal: traps focus, Esc cancels, the page behind is inert
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        settle(cancelValue);
      }}
      onClick={(e) => e.target === ref.current && settle(cancelValue)} // click on the backdrop
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form
        method="dialog"
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (req.input && !text.trim()) return;
          settle(req.input ? text.trim() : true);
        }}
      >
        <h2 id="dialog-title" className="font-semibold">
          {req.title}
        </h2>
        {req.message ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{req.message}</p> : null}
        {req.input ? (
          <label className="mt-4 block text-sm">
            <span className="text-muted">{req.input.label}</span>
            <input
              autoFocus
              type={req.input.type ?? "text"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => settle(cancelValue)}>
            {req.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="submit"
            size="sm"
            autoFocus={!req.input}
            disabled={!!req.input && !text.trim()}
            className={req.danger ? "!bg-bad" : ""}
          >
            {req.confirmLabel ?? "OK"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
