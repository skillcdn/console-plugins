// The shapes the queries answer and the pages read: how the connection stands, the routes, the
// people and their accounts in Slack, and what was sent. Built into both bundles, so that the
// server and the pages read one definition.
import type { NotificationKind } from "@skillcdn/console/api";

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

/**
 * The secret settings that keep one value, in the order an administrator meets them; the bot's
 * token is kept per workspace, by its id (ADR-0014), and said with each workspace.
 */
export const FIXED_SECRETS = [
  "slackConfigToken",
  "slackConfigRefreshToken",
  "slackClientSecret",
  "slackSigningSecret",
] as const;
export type FixedSecretName = (typeof FIXED_SECRETS)[number];

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

/** The app, made once and installed in each workspace that takes it. */
export interface AppView {
  readonly appId: string | null;
  /** The language of the names the app shows in Slack, its shortcut's among them. */
  readonly language: Language;
  /** The names someone chose for the app and its bot; null where the language's own stand. */
  readonly appName: string | null;
  readonly botName: string | null;
  /** The icon chosen, whether Slack took it, and why not: `manual` where the token may not set it. */
  readonly iconUrl: string | null;
  readonly iconSet: boolean;
  readonly iconProblem: string | null;
  /** Whether the app's manifest, as last written, holds the leave shortcut. */
  readonly shortcut: boolean;
  readonly manifestAt: string | null;
  readonly problem: string | null;
  readonly problemAt: string | null;
  readonly rotatedAt: string | null;
}

/** A workspace the app is installed in, its bot token as the console says it. */
/** A project as the pages name it. */
export interface ProjectBrief {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

export interface WorkspaceView {
  readonly teamId: string;
  readonly teamName: string | null;
  /** Connected, or waiting since it installed the app for whoever keeps the messenger to accept it. */
  readonly state: "pending" | "connected";
  readonly botUserId: string | null;
  /** The bot's handle as Slack made it from the bot's name, once read. */
  readonly botHandle: string | null;
  /** The workspace every project no other names is told in. */
  readonly default: boolean;
  /** The projects told here, by the console's ids. */
  readonly projects: readonly string[];
  readonly connectedAt: string | null;
  /** Who gave out the link it was installed through, and who installed it, by their id in Slack. */
  readonly connectedBy: PersonBrief | null;
  readonly installedBy: string | null;
  /**
   * Whether the console is told whose each account here is, by which an agent account knows who
   * wrote to it in Slack: `told`; `administrator`, not until an administrator of the console
   * accepts the workspace; `off`, the capability being off.
   */
  readonly accounts: "off" | "told" | "administrator";
  /** Whether whoever reads this may accept it, waiting, or as an administrator for its accounts. */
  readonly mayAccept: boolean;
  readonly problem: string | null;
  readonly problemAt: string | null;
  readonly matchedAt: string | null;
  readonly matched: number;
  readonly unmatched: number;
  readonly token: SecretView;
}

/**
 * What is left to set up, the first in this order: a public address, the configuration token, the
 * app, a workspace waiting to be accepted, an installation, HR's role for the messenger, people with
 * no email, a route; else `ready`.
 */
export const NEXT_STEPS = [
  "address",
  "config_token",
  "app",
  "accept",
  "install",
  "hr_role",
  "no_email",
  "no_route",
  "ready",
] as const;
export type NextStep = (typeof NEXT_STEPS)[number];

export interface StatusReport {
  /** The next thing to do, and a line saying it in the caller's language. */
  readonly next: NextStep;
  readonly text: string;
  /** The people the console knows no email for, whom no account can be matched to. */
  readonly noEmail: number;
  readonly address: { readonly url: string | null; readonly state: AddressState };
  /**
   * The workspace's language where an administrator set one, else null: what the app and a route
   * read in unless someone chooses, before the language of whoever connects or adds them.
   */
  readonly workspaceLanguage: Language | null;
  /** The names the app and its bot take in each language where nobody chose any. */
  readonly defaultNames: Readonly<Record<Language, { readonly app: string; readonly bot: string }>>;
  readonly secrets: Readonly<Record<FixedSecretName, SecretView>>;
  readonly app: AppView | null;
  /** The workspaces the app is installed in, the default first. */
  readonly workspaces: readonly WorkspaceView[];
  /**
   * Of the projects the messenger is placed on, those the caller may see, by which what each
   * workspace is told of is named. Where one workspace is connected there is nothing to say of
   * them, and none is listed.
   */
  readonly projects: readonly ProjectBrief[];
  /**
   * Slack's address that installs the app in a workspace, the newest link still good, and until
   * when; null where none is.
   */
  readonly authorizeUrl: string | null;
  readonly installUntil: string | null;
  /** Slack's page of the app where its distribution to other workspaces is turned on, once. */
  readonly distributionUrl: string | null;
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
  /** The workspace the channel is in, and whether the app is installed there now. */
  readonly teamId: string;
  readonly teamName: string | null;
  readonly connected: boolean;
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
  /** Their accounts, one in each workspace they are matched in. */
  readonly slack: readonly {
    readonly teamId: string;
    readonly memberId: string;
    readonly name: string;
  }[];
}

export interface PeopleReport {
  readonly connected: boolean;
  /** The earliest of the workspaces' last matchings; null while one was never matched. */
  readonly matchedAt: string | null;
  readonly workspaces: readonly {
    readonly teamId: string;
    readonly teamName: string | null;
    readonly matchedAt: string | null;
  }[];
  readonly counts: Readonly<Record<MatchState, number>>;
  readonly people: readonly PersonMatch[];
  /** How many there are of the state asked for, of which `people` is the first page. */
  readonly total: number;
}

export type Outcome = "sent" | "skipped" | "failed";

/**
 * What a delivery line says, as a code the page says in its reader's language, any detail after
 * a colon: sent on (`told:<how many>`), told (`thread`, `next_step`, `approved:<posts>`, ...),
 * passed over (`unreached`, `not_connected`, `no_grant`, `outside:<version>`, ...), or failed
 * (`slack:<code>`, `console:<code>`, `rate_limited`).
 */
export const NOTES = [
  "told",
  "unreached",
  "thread",
  "nobody",
  "next_step",
  "approved",
  "approved_partly",
  "rejected",
  "returned",
  "cancel_asked",
  "cancelled",
  "kept",
  "no_thread",
  "not_leave",
  "not_connected",
  "no_capability",
  "outside",
  "no_grant",
  "hidden",
  "slack",
  "console",
  "rate_limited",
  "failed",
] as const;
export type NoteCode = (typeof NOTES)[number];

/** A line of the log: never which project, what it was about or whom it was for (ADR-0019). */
export interface ActivityRow {
  readonly id: string;
  readonly at: string;
  readonly kind: string;
  readonly outcome: Outcome;
  readonly note: string;
  readonly attempt: number;
}

/**
 * What a member is told of in a direct message: the console's kinds of notification (ADR-0017),
 * by the console's own names, since the console decides who is told of what and the messenger
 * sends that on. A task given to them; one they are at work on ready to begin; one they own
 * moved; one of theirs changed, commented or put away; a decision waiting for them; one they
 * raised answered; an agent account that reports to them standing otherwise. Written out here and
 * held equal to the console's `NOTIFICATION_KINDS` by a test: the module that exports them is
 * the console's whole API, which a bundle of the plugin's has no use for.
 */
export const NOTICE_KINDS = [
  "assigned",
  "ready",
  "moved",
  "changed",
  "commented",
  "archived",
  "decision",
  "answered",
  "agent",
] as const satisfies readonly NotificationKind[];
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/**
 * What a member turns off for Slack beside a kind: the tasks whose notifications they turned on
 * themselves in the console, which tell them of everything on them whatever their kinds.
 */
export const FOLLOWED = "followed";

/** Everything a member chooses of what the console tells them: each kind, and the tasks they turned on. */
export const NOTICE_CHOICES = [...NOTICE_KINDS, FOLLOWED] as const;
export type NoticeChoice = (typeof NOTICE_CHOICES)[number];

/**
 * The choices in the groups and the order of the console's own settings, so that a kind stands in
 * the same place on both pages; after them the tasks a member turned on themselves, which are no
 * kind and come whatever the kinds say.
 */
export const NOTICE_GROUPS = {
  tasks: ["assigned", "ready", "commented", "moved", "changed", "archived"],
  decisions: ["decision", "answered"],
  agents: ["agent"],
  followed: [FOLLOWED],
} as const satisfies Readonly<Record<string, readonly NoticeChoice[]>>;
export type NoticeGroup = keyof typeof NOTICE_GROUPS;

/** Where a member chooses what they are told at all: the console's own settings, by its path. */
export const CONSOLE_NOTIFICATIONS_PATH = "/settings/notifications";

/** At once, or in one message a day at a time of the workspace's zone. */
export const CADENCES = ["now", "daily"] as const;
export type Cadence = (typeof CADENCES)[number];

/** A member's own choice of what reaches them in Slack, as the page and their agent read it. */
export interface NoticesView {
  /**
   * Of what the console tells them, what is sent on to Slack: each kind, and the tasks they
   * turned on themselves. A kind off in the console tells them nothing, whatever stands here.
   */
  readonly kinds: Readonly<Record<NoticeChoice, boolean>>;
  readonly cadence: Cadence;
  /** The time of the day's message, `HH:MM` in the workspace's zone, and the zone. */
  readonly at: string;
  readonly timeZone: string;
  /** Whether they ever chose, or stand on the defaults. */
  readonly chosen: boolean;
  /** The workspaces they have an account in, where they are told. */
  readonly accounts: readonly { readonly teamId: string; readonly teamName: string | null }[];
  /** Lines waiting for the day's message. */
  readonly waiting: number;
}

/** How a project stands with Slack, for its page: the workspace it is told in. */
export interface ProjectNoticesView {
  readonly project: ProjectBrief;
  readonly workspace: {
    readonly teamId: string;
    readonly teamName: string | null;
    readonly default: boolean;
  } | null;
}
