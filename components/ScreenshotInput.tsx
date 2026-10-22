"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGES = 5;
/** Uploads must stay under the host's 4.5 MB request limit, so screenshots are shrunk and capped in total. */
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const SHRINK_ABOVE_BYTES = 700 * 1024;
const MAX_WIDTH = 1600; // wide enough to keep small text legible; very tall screenshots keep their full height

/** Re-encodes a large screenshot as a smaller JPEG; returns the original if that doesn't help or fails. */
async function shrink(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
}

const noSubscribe = () => () => {};

/** Pulls image files out of a paste or drop. */
export function imagesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((f) => f.type.startsWith("image/"));
}

export function ScreenshotInput({ images, onChange }: { images: File[]; onChange: (files: File[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The platform never changes; the server snapshot (false) keeps the first render identical to the server's.
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  const pasteKey = mac ? "⌘V" : "Ctrl+V";
  const snipKey = mac ? "⌃⇧⌘4" : "Win+Shift+S";

  // Keep the latest images for the window-level paste handler without re-subscribing on every change.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  async function add(files: File[]) {
    setNotice(null);
    const problems: string[] = [];
    const accepted = files.filter((f) => {
      if (ACCEPTED.includes(f.type)) return true;
      problems.push(`${f.name || "That file"} isn't a PNG, JPG, WebP or GIF.`);
      return false;
    });
    const room = MAX_IMAGES - imagesRef.current.length;
    if (accepted.length > room) problems.push(`Only ${MAX_IMAGES} screenshots per job, so the extra ones weren't added.`);
    const shrunk = await Promise.all(accepted.slice(0, Math.max(0, room)).map(shrink));
    // Keep adding while the total stays under the upload limit.
    let total = imagesRef.current.reduce((n, f) => n + f.size, 0);
    const fits: File[] = [];
    for (const f of shrunk) {
      if (total + f.size > MAX_TOTAL_BYTES) {
        problems.push(`${f.name || "A screenshot"} would go over the 4 MB upload limit, so it wasn't added. Try a smaller crop.`);
        continue;
      }
      total += f.size;
      fits.push(f);
    }
    if (problems.length) setNotice(problems.join(" "));
    if (fits.length) onChange([...imagesRef.current, ...fits]);
  }

  // Ctrl/⌘+V anywhere on the page adds the screenshot while this tab is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFrom(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        add(files);
      } else if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setNotice(`There's no image on your clipboard. Take a screenshot with ${snipKey}, then paste it here.`);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // add/onChange read the latest values through imagesRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snipKey]);

  async function pasteFromButton() {
    setNotice(null);
    // The async Clipboard API needs permission and isn't available everywhere; fall back to the keyboard shortcut.
    if (!navigator.clipboard?.read) {
      setNotice(`Press ${pasteKey} to paste your screenshot.`);
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `screenshot-${Date.now()}.${type.split("/")[1]}`, { type }));
      }
      if (files.length) add(files);
      else setNotice(`There's no image on your clipboard. Take a screenshot with ${snipKey}, then try again.`);
    } catch {
      setNotice(`Your browser blocked clipboard access. Press ${pasteKey} instead.`);
    }
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        add(imagesFrom(e.dataTransfer));
      }}
      className={`rounded-lg border-2 border-dashed p-4 transition ${dragging ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionTile
          title="Paste screenshot"
          hint={`or press ${pasteKey}`}
          disabled={full}
          onClick={pasteFromButton}
          icon={<path d="M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6.5A1.5 1.5 0 0 0 5 7.5v11A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6H16M9 13h6M12 10v6" />}
        />
        <ActionTile
          title="Upload image"
          hint="PNG, JPG or WebP"
          disabled={full}
          onClick={() => fileRef.current?.click()}
          icon={<path d="M12 16V5m0 0-4 4m4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <p className="mt-3 text-center text-xs text-muted">
        You can also drag images here. Tip: {snipKey} takes a screenshot straight to your clipboard. Up to {MAX_IMAGES} images; a long posting can span several.
      </p>

      {notice && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn" role="status">
          {notice}
        </p>
      )}

      {images.length > 0 && <Thumbnails images={images} onRemove={(i) => onChange(images.filter((_, j) => j !== i))} />}
    </div>
  );
}

function ActionTile({ title, hint, icon, onClick, disabled }: { title: string; hint: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left transition hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {icon}
        </svg>
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

function Thumbnails({ images, onRemove }: { images: File[]; onRemove: (i: number) => void }) {
  const urls = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Added screenshots">
      {images.map((f, i) => (
        <li key={urls[i]} className="group relative overflow-hidden rounded-md border border-border bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable asset */}
          <img src={urls[i]} alt={`Screenshot ${i + 1}`} className="h-20 w-full object-cover object-top" />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">{i + 1}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove screenshot ${i + 1}`}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-80 hover:bg-bad hover:opacity-100"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
