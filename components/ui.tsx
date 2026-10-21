"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110 disabled:opacity-50",
  secondary: "bg-surface border border-border text-foreground hover:bg-background disabled:opacity-50",
  ghost: "text-muted hover:text-foreground hover:bg-background disabled:opacity-40",
  danger: "text-bad hover:bg-red-50",
};

/** Button styling, shared so links can look like buttons without nesting a <button> inside an <a>. */
export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md", className = "") {
  const sz = size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm";
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed ${sz} ${variants[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface p-5 ${className}`}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad" | "accent"; children: ReactNode }) {
  const tones = {
    neutral: "bg-background text-muted border-border",
    good: "bg-green-50 text-good border-green-200",
    warn: "bg-amber-50 text-warn border-amber-200",
    bad: "bg-red-50 text-bad border-red-200",
    accent: "bg-accent-soft text-accent border-blue-200",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}

export const scoreTone = (n: number) => (n >= 75 ? "good" : n >= 50 ? "warn" : "bad");

export function ScoreRing({ score, label, size = 88 }: { score: number; label?: string; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" }[scoreTone(score)];
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} role="img" aria-label={`${label ?? "Score"}: ${score} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 3.6} fontWeight={600} fill="var(--foreground)">
          {Math.round(score)}
        </text>
      </svg>
      {label ? <span className="text-xs text-muted">{label}</span> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-bad" role="alert">{children}</div>;
}

export async function postForm<T>(url: string, body: FormData | object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    ...(body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
