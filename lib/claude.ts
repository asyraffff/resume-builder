import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Reading resumes and job postings is extraction work, done well (and at about half the cost) by Sonnet.
 * Matching writes the suggestions people act on, so it stays on Opus.
 */
export const MODELS = { reading: "claude-sonnet-5-5", matching: "claude-opus-5-5" } as const;
export type ModelRole = keyof typeof MODELS;

let client: Anthropic | null = null;
function getClient() {
  if (!client) {
    try {
      client = new Anthropic();
    } catch {
      throw new AiError("Claude API key is missing. Copy .env.example to .env.local and set ANTHROPIC_API_KEY.", 500);
    }
  }
  return client;
}

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

type CallOptions<S extends z.ZodType> = {
  role: ModelRole;
  schema: S;
  system: string;
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  effort?: Effort;
  maxTokens?: number;
};

function buildParams<S extends z.ZodType>(opts: CallOptions<S>, defaultMaxTokens: number) {
  return {
    model: MODELS[opts.role],
    max_tokens: opts.maxTokens ?? defaultMaxTokens,
    // The instructions are identical for every request, so they're cached (reads cost ~10% of normal input).
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: opts.content }],
    output_config: {
      effort: opts.effort ?? "medium",
      format: betaZodOutputFormat(opts.schema),
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
}

/** Maps SDK errors to user-facing messages. Logs the error type only, never request content (resumes contain personal data). */
function toAiError(err: unknown): unknown {
  if (err instanceof AiError) return err;
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (cause: ${err.cause.name}: ${err.cause.message})` : "";
    console.error(`Claude call failed: ${err.name}: ${err.message}${cause}`);
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("Claude API key is missing or invalid. Set ANTHROPIC_API_KEY in .env.local.", 500);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("The AI service is busy right now. Please try again in a moment.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AiError(`The AI request was rejected: ${err.message}`, 400);
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError(`AI service error (${err.status ?? "network"}). Please retry.`, 502);
  }
  // The SDK throws a plain Error when no credentials are configured at all.
  if (err instanceof Error && /could not resolve authentication method/i.test(err.message)) {
    return new AiError("Claude API key is missing. Copy .env.example to .env.local and set ANTHROPIC_API_KEY.", 500);
  }
  return err;
}

function checkResult<T>(response: Anthropic.Beta.Messages.BetaMessage & { parsed_output?: T | null }, maxTokens: number): T {
  if (process.env.NODE_ENV !== "production") {
    const u = response.usage;
    console.info(
      `Claude usage (${response.model}): ${u.input_tokens} in + ${u.cache_read_input_tokens ?? 0} cache read + ${u.cache_creation_input_tokens ?? 0} cache write / ${u.output_tokens} out (max ${maxTokens})`,
    );
  }
  if (response.stop_reason === "refusal") {
    throw new AiError("The AI declined to process this content. Try different input.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("The response was too long and got cut off. Try a shorter document.", 413);
  }
  if (response.parsed_output == null) {
    throw new AiError("The AI returned an unexpected format. Please retry.", 502);
  }
  return response.parsed_output;
}

/**
 * Single entry point for short Claude calls: typed structured output, explicit effort,
 * server-side refusal fallbacks, and stop-reason checks.
 */
export async function callStructured<S extends z.ZodType>(opts: CallOptions<S>): Promise<z.infer<S>> {
  const params = buildParams(opts, 16000);
  let response;
  try {
    response = await getClient().beta.messages.parse(params);
  } catch (err) {
    throw toAiError(err);
  }
  return checkResult<z.infer<S>>(response, params.max_tokens);
}

export type StreamProgress =
  | { phase: "analyzing" }
  | { phase: "writing"; chars: number; text: string };

/**
 * Streaming variant for long calls. Reports progress as Claude works: "analyzing" while it reasons,
 * then "writing" with the JSON written so far. Streaming also avoids HTTP timeouts on large outputs.
 */
export async function callStructuredStream<S extends z.ZodType>(
  opts: CallOptions<S>,
  onProgress: (p: StreamProgress) => void,
): Promise<z.infer<S>> {
  const params = buildParams(opts, 32000);
  try {
    const stream = getClient().beta.messages.stream(params);
    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "thinking") onProgress({ phase: "analyzing" });
    });
    stream.on("text", (_delta, snapshot) => onProgress({ phase: "writing", chars: snapshot.length, text: snapshot }));
    const response = await stream.finalMessage();
    return checkResult<z.infer<S>>(response, params.max_tokens);
  } catch (err) {
    throw toAiError(err);
  }
}
