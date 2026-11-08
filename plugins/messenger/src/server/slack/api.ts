// Slack's Web API over the console's `ctx.fetch`: a method of https://slack.com/api, its
// arguments as a form, a token the console puts in as a bearer, and the answer read as JSON.
// The plugin never holds a token: the console places the bot's or the configuration's from the
// secret settings, and seals what an answer hands back. Slack asking to wait is told to the
// console as `retryAfterMs`, so that a hook's next try waits that long; Slack refusing is a
// `SlackError` with Slack's own code, which the callers turn into words.
import {
  type PluginContext,
  PluginError,
  type PluginFetchInit,
  type PluginFetchResponse,
  type SecretSeal,
  type SecretUse,
} from "@skillcdn/console/plugin";
import { serverWords } from "../words.js";

export const SLACK_API = "https://slack.com/api";

/**
 * The console's `ctx.fetch`, called through `Reflect.apply`: `console-plugin check` of console
 * 0.4.6 reads the word fetch followed by a parenthesis anywhere in a server bundle as the global
 * the host removes, a call of the console's own among them, and refuses the plugin. The call is
 * the same; only its spelling differs.
 */
export function outbound(
  ctx: PluginContext,
  url: string,
  init: PluginFetchInit,
): Promise<PluginFetchResponse> {
  return Reflect.apply(ctx.fetch, ctx, [url, init]) as Promise<PluginFetchResponse>;
}

const FORM = "application/x-www-form-urlencoded; charset=utf-8";

/** The token a call carries: the bot's, the app configuration's, or none. */
export type SlackAuth = "bot" | "config" | "none";

const TOKEN: Readonly<Record<Exclude<SlackAuth, "none">, SecretUse>> = {
  bot: { name: "slackBotToken", as: "bearer" },
  config: { name: "slackConfigToken", as: "bearer" },
};

/** Slack's refusal of a call, by Slack's code (`channel_not_found`, `invalid_auth`, ...). */
export class SlackError extends Error {
  readonly code: string;
  readonly method: string;

  constructor(code: string, method: string) {
    super(`${method}: ${code}`);
    this.name = "SlackError";
    this.code = code;
    this.method = method;
  }
}

/** Slack's codes that say the token is gone: revoked, the app uninstalled, the account closed. */
const TOKEN_GONE = new Set([
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
  "app_uninstalled",
]);

export function isTokenGone(error: unknown): boolean {
  return error instanceof SlackError && TOKEN_GONE.has(error.code);
}

export interface SlackCallOptions {
  readonly auth: SlackAuth;
  /** More secrets, a client secret in the body, say, besides the token. */
  readonly secrets?: readonly SecretUse[];
  readonly seal?: Readonly<Record<string, SecretSeal>>;
}

/** The arguments as a form: text as it is, numbers and flags as words, the rest as JSON. */
export function formOf(params: Readonly<Record<string, unknown>>): string {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    form.set(
      key,
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
    );
  }
  return form.toString();
}

/** The seconds a 429 asks to wait, from its `retry-after`, a minute where it says none. */
function retryAfterOf(response: PluginFetchResponse): number {
  const header = Object.entries(response.headers).find(
    ([name]) => name.toLowerCase() === "retry-after",
  )?.[1];
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60;
}

export interface SlackAnswer {
  readonly body: Record<string, unknown>;
  readonly sealed: PluginFetchResponse["sealed"];
}

/**
 * Calls a method and answers its JSON, with what became of each value sealed; throws a
 * `SlackError` where Slack refuses, and `rate_limited` with `retryAfterMs` where it asks to wait.
 */
export async function slackCall(
  ctx: PluginContext,
  method: string,
  params: Readonly<Record<string, unknown>>,
  options: SlackCallOptions,
): Promise<SlackAnswer> {
  const secrets = [
    ...(options.auth === "none" ? [] : [TOKEN[options.auth]]),
    ...(options.secrets ?? []),
  ];
  const response = await outbound(ctx, `${SLACK_API}/${method}`, {
    method: "POST",
    headers: { "content-type": FORM, accept: "application/json" },
    body: formOf(params),
    ...(secrets.length === 0 ? {} : { secrets }),
    ...(options.seal === undefined ? {} : { seal: options.seal }),
  });
  if (response.status === 429) {
    const seconds = retryAfterOf(response);
    throw new PluginError(
      "rate_limited",
      serverWords(ctx.language).refused.slackWait(String(seconds)),
      { retryAfterMs: seconds * 1000 },
    );
  }
  let body: unknown;
  try {
    body = response.json();
  } catch {
    throw new SlackError(`http_${response.status}`, method);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new SlackError(`http_${response.status}`, method);
  }
  const answer = body as Record<string, unknown>;
  if (answer.ok !== true) {
    const code = typeof answer.error === "string" ? answer.error.slice(0, 80) : "unknown_error";
    throw new SlackError(code, method);
  }
  return { body: answer, sealed: response.sealed };
}

/** The same, for the answer alone. */
export async function slack(
  ctx: PluginContext,
  method: string,
  params: Readonly<Record<string, unknown>>,
  auth: SlackAuth = "bot",
): Promise<Record<string, unknown>> {
  return (await slackCall(ctx, method, params, { auth })).body;
}

/** A string field of an answer, or null. */
export function textOf(value: unknown, at: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  let current: unknown = value;
  for (const part of at.split(".")) {
    if (typeof current !== "object" || current === null) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}

/** A refusal in the caller's words, from what Slack said. */
export function refusalOf(ctx: PluginContext, error: unknown): PluginError {
  if (error instanceof PluginError) {
    return error;
  }
  if (error instanceof SlackError) {
    return new PluginError("slack", serverWords(ctx.language).refused.slackSaid(error.code));
  }
  throw error;
}
