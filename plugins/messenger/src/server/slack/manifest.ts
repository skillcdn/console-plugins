// The Slack app the plugin makes and keeps: its names in the workspace's one language, the bot,
// the shortcut that opens the leave form, to request leave and cancel it, while HR is there to
// take it (one of the five global shortcuts an app has, kept for HR alone), the addresses of the
// plugin's two endpoints, and the scopes, each needed by a row of the design. The scopes never
// change with the shortcut, `commands` among them from the start, so that adding or taking the
// shortcut away asks nobody to install the app again.
import type { Language } from "../../shared/contracts.js";
import { serverWords } from "../words.js";

/** The callback a global shortcut's press and a form's submission carry back. */
export const LEAVE_SHORTCUT = "leave-request";

/**
 * What the app may do in Slack: post (to a public channel without joining it, under a person's
 * name and picture), offer a shortcut, list the channels for a route, read the members and their
 * addresses for the matching, and open a direct or a group conversation for a thread.
 */
export const SCOPES = [
  "chat:write",
  "chat:write.public",
  "chat:write.customize",
  "commands",
  "channels:read",
  "groups:read",
  "users:read",
  "users:read.email",
  "im:write",
  "mpim:write",
] as const;

/** The names the app shows in Slack: those someone chose, else the language's own. */
export function appNamesOf(
  language: Language,
  chosen: { readonly appName: string | null; readonly botName: string | null },
): { readonly app: string; readonly bot: string } {
  const words = serverWords(language).app;
  return { app: chosen.appName ?? words.name, bot: chosen.botName ?? words.botName };
}

export interface ManifestInput {
  readonly language: Language;
  /** The app's name and its bot's as someone chose them; the language's own where null. */
  readonly appName: string | null;
  readonly botName: string | null;
  /** The address Slack posts what people do to: the endpoint `slack`. */
  readonly requestUrl: string;
  /** The address Slack sends the installer back to: the endpoint `slack-oauth`. */
  readonly redirectUrl: string;
  readonly shortcut: boolean;
}

export function appManifest(input: ManifestInput): Record<string, unknown> {
  const words = serverWords(input.language).app;
  const names = appNamesOf(input.language, input);
  return {
    _metadata: { major_version: 1, minor_version: 1 },
    display_information: {
      name: names.app,
      description: words.description.slice(0, 140),
      background_color: "#1f2937",
    },
    features: {
      bot_user: { display_name: names.bot, always_online: true },
      ...(input.shortcut
        ? {
            shortcuts: [
              {
                name: [...words.shortcutName].slice(0, 24).join(""),
                type: "global",
                callback_id: LEAVE_SHORTCUT,
                description: words.shortcutDescription.slice(0, 150),
              },
            ],
          }
        : {}),
    },
    oauth_config: {
      redirect_urls: [input.redirectUrl],
      scopes: { bot: [...SCOPES] },
    },
    settings: {
      interactivity: { is_enabled: true, request_url: input.requestUrl },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
}

/**
 * A short digest of a manifest, to tell whether the one Slack holds is the one wanted without
 * keeping it whole: FNV-1a over its JSON, the keys in order.
 */
export function digestOf(manifest: unknown): string {
  const text = canonical(manifest);
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Slack's address that installs the app, with the state the endpoint checks when it comes back. */
export function authorizeUrlOf(clientId: string, redirectUrl: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    scope: SCOPES.join(","),
    redirect_uri: redirectUrl,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${query.toString()}`;
}
