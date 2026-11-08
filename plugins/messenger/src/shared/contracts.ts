// The shapes the queries answer and the pages read: how the connection stands, the routes, the
// people and their accounts in Slack, and what was sent. Built into both bundles, so that the
// server and the pages read one definition.

/** The languages the plugin speaks: what people read in Slack, the pages, the manifest. */
export const LANGUAGES = ["en", "ko"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The language of a tag, `ko` for `ko-KR`, English for any the plugin does not speak. */
export function languageOf(tag: string | null | undefined): Language {
  const primary = (tag ?? "").toLowerCase().split("-")[0] ?? "";
  return (LANGUAGES as readonly string[]).includes(primary) ? (primary as Language) : "en";
}

/** What a route carries to a channel: a producer's kind, by the producer's key. */
export const ROUTE_KINDS = ["hr:leave-approved"] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

/** Under whose name a channel reads a message: the person it is about, or the app. */
export const ROUTE_AS = ["person", "app"] as const;
export type RouteAs = (typeof ROUTE_AS)[number];

/** The secret settings, in the order an administrator meets them. */
export const SECRETS = [
  "slackConfigToken",
  "slackConfigRefreshToken",
  "slackClientSecret",
  "slackSigningSecret",
  "slackBotToken",
] as const;
export type SecretName = (typeof SECRETS)[number];

export interface SecretView {
  readonly set: boolean;
  readonly setAt: string | null;
  readonly expiresAt: string | null;
  /** `administrator`, or the host it was sealed from; null while unset. */
  readonly source: string | null;
}

/**
 * Whether Slack can reach the console: `ok` for a public https address; `none` where the
 * deployment names no address; `not_https`; `private` for a loopback or private network.
 */
export type AddressState = "ok" | "none" | "not_https" | "private";

/** Where the connection is: the app made in Slack, installed in a workspace, or uninstalled. */
export type Phase = "app" | "connected" | "disconnected";

/**
 * How HR stands for the messenger: `on` reachable in a version this plugin reads; `off` disabled
 * or not installed; `no_capability` HR's api not turned on for this plugin; `outside` a version
 * of HR this plugin was not written for. The role it asks of HR is said beside it.
 */
export type HrState = "on" | "off" | "no_capability" | "outside";

export interface PersonBrief {
  readonly id: string;
  readonly login: string;
  readonly name: string | null;
}

export interface ConnectionView {
  readonly phase: Phase;
  readonly appId: string | null;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly botUserId: string | null;
  /** The language of the names the app shows in Slack, its shortcut's among them. */
  readonly language: Language;
  /** Whether the app's manifest, as last written, holds the leave shortcut. */
  readonly shortcut: boolean;
  readonly manifestAt: string | null;
  readonly connectedAt: string | null;
  readonly connectedBy: PersonBrief | null;
  readonly problem: string | null;
  readonly problemAt: string | null;
  readonly matchedAt: string | null;
  readonly matched: number;
  readonly unmatched: number;
  readonly rotatedAt: string | null;
}

export interface StatusReport {
  readonly address: { readonly url: string | null; readonly state: AddressState };
  readonly secrets: Readonly<Record<SecretName, SecretView>>;
  readonly connection: ConnectionView | null;
  /** Slack's address that installs the app, with a state good for a while; null where none is ready. */
  readonly authorizeUrl: string | null;
  readonly hr: {
    readonly state: HrState;
    readonly version: string | null;
    /** The versions of HR this plugin was written against. */
    readonly range: string;
    /** The roles of HR granted to this plugin, and those it asks. */
    readonly granted: readonly string[];
    readonly asked: readonly string[];
  };
  readonly routes: number;
  /** Deliveries that failed in the last day. */
  readonly failures: number;
}

export interface RouteView {
  readonly id: string;
  readonly kind: RouteKind;
  readonly channelId: string;
  readonly channelName: string;
  readonly language: Language;
  readonly as: RouteAs;
}

export interface ChannelView {
  readonly id: string;
  readonly name: string;
  readonly private: boolean;
  /** Whether the app is in it: a private channel takes posts only then, a public one always. */
  readonly member: boolean;
}

/**
 * How a person stands: `matched` to an account; `no_email`, the console knows no address for
 * them; `no_account`, the last match found no account with their address; `not_checked`, not
 * matched since they joined or since their address changed.
 */
export type MatchState = "matched" | "no_email" | "no_account" | "not_checked";

export interface PersonMatch {
  readonly person: PersonBrief;
  readonly state: MatchState;
  readonly slack: { readonly memberId: string; readonly name: string } | null;
}

export interface PeopleReport {
  readonly connected: boolean;
  readonly matchedAt: string | null;
  readonly counts: Readonly<Record<MatchState, number>>;
  readonly people: readonly PersonMatch[];
  /** How many there are of the state asked for, of which `people` is the first page. */
  readonly total: number;
}

export type Outcome = "sent" | "skipped" | "failed";

export interface ActivityRow {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly thing: string | null;
  readonly outcome: Outcome;
  readonly note: string;
  readonly attempt: number;
}
