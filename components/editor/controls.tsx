"use client";

/** Small text button used in section and entry toolbars. */
export function ToolButton({ danger, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded px-1.5 py-0.5 text-xs font-normal normal-case tracking-normal ${danger ? "text-muted hover:bg-red-50 hover:text-bad" : "text-muted hover:bg-background hover:text-foreground"} ${className}`}
    />
  );
}

// Literal class strings so Tailwind generates them. Touch screens have no hover, so buttons stay visible there.
const REVEAL = {
  section: "group-hover/section:opacity-100",
  item: "group-hover/item:opacity-100",
  bullet: "group-hover/bullet:opacity-100",
  skill: "group-hover/skill:opacity-100",
  link: "group-hover/link:opacity-100",
} as const;

/** Trash button for one block: appears on hover or keyboard focus. */
export function DeleteButton({
  label,
  onClick,
  reveal,
  size = "md",
  className = "",
}: {
  label: string;
  onClick: () => void;
  reveal: keyof typeof REVEAL;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? 12 : 14;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded text-neutral-400 opacity-0 transition hover:bg-red-50 hover:text-bad focus-visible:opacity-100 [@media(hover:none)]:opacity-60 ${REVEAL[reveal]} ${box} ${className}`}
    >
      <svg width={icon} height={icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.75 7v4M9.25 7v4" />
      </svg>
    </button>
  );
}
