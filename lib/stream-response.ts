import "server-only";
import { AiError, type StreamProgress } from "./claude";
import type { StreamEvent } from "./stream-progress";

/**
 * Runs a long AI task and streams newline-delimited JSON progress events, then the result.
 * `describe` turns the JSON written so far into a task-specific count and stage for the UI.
 */
export function ndjsonStream<D>(
  work: (onProgress: (p: StreamProgress) => void) => Promise<D>,
  describe: (text: string) => { count: number; stage: string },
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent<D>) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      let lastSent = 0;
      const onProgress = (p: StreamProgress) => {
        if (p.phase === "analyzing") return send({ type: "phase", phase: "analyzing" });
        // The text snapshot updates many times per second; a few updates per second is plenty for a progress bar.
        const now = Date.now();
        if (now - lastSent < 250) return;
        lastSent = now;
        send({ type: "progress", chars: p.chars, ...describe(p.text) });
      };

      send({ type: "phase", phase: "sending" });
      try {
        send({ type: "done", data: await work(onProgress) });
      } catch (err) {
        if (!(err instanceof AiError)) console.error("Unexpected error:", err instanceof Error ? err.message : "unknown");
        send({ type: "error", message: err instanceof AiError ? err.message : "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
