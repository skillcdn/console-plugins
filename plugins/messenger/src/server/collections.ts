// The records of the messenger, kept by the console. One connection per messenger; the routes the
// role holders write; the links of people to their accounts, written by the matching; a thread
// per thing told, what was written about it and where; and the deliveries, a line per event
// heard, forgotten after a month. Every schema bounds what it holds, since what Slack and other
// plugins answer is data from elsewhere.
import { defineCollection, z } from "@skillcdn/console/plugin";
import { LANGUAGES, ROUTE_AS, ROUTE_KINDS } from "../shared/contracts.js";
import { ROLE } from "./access.js";

const id = z.string().min(1).max(64);
const instant = z.string().min(1).max(40);
/** A message's timestamp in Slack, which is also its id within its conversation. */
export const slackTs = z.string().regex(/^\d{1,12}\.\d{1,9}$/);
/** A conversation: a public or private channel, a direct or a group message. */
export const channelId = z.string().regex(/^[CDG][A-Z0-9]{2,40}$/);
/** A member of a workspace. */
export const memberId = z.string().regex(/^[UW][A-Z0-9]{2,40}$/);
/** A workspace, an app or a bot user: Slack's ids, letters and digits. */
const slackId = z.string().regex(/^[A-Z][A-Z0-9]{2,40}$/);

export const connections = defineCollection("connections", {
  schema: z.object({
    provider: z.literal("slack"),
    phase: z.enum(["app", "connected", "disconnected"]),
    appId: slackId.nullable(),
    /** The app's client id: no secret, since Slack puts it in addresses, and so a plain field. */
    clientId: z.string().max(80).nullable(),
    teamId: slackId.nullable(),
    teamName: z.string().max(200).nullable(),
    botUserId: slackId.nullable(),
    language: z.enum(LANGUAGES),
    shortcut: z.boolean(),
    manifestDigest: z.string().max(64).nullable(),
    manifestAt: instant.nullable(),
    /** The state an authorization carries to Slack and back, and until when it is good. */
    oauthState: z.string().max(80).nullable(),
    oauthUntil: instant.nullable(),
    connectedAt: instant.nullable(),
    connectedBy: id.nullable(),
    problem: z.string().max(500).nullable(),
    problemAt: instant.nullable(),
    matchedAt: instant.nullable(),
    matched: z.number().int().min(0),
    unmatched: z.number().int().min(0),
    rotatedAt: instant.nullable(),
  }),
  indexes: ["provider"],
  read: [ROLE],
});

export const routes = defineCollection("routes", {
  schema: z.object({
    kind: z.enum(ROUTE_KINDS),
    channelId,
    channelName: z.string().min(1).max(200),
    language: z.enum(LANGUAGES),
    as: z.enum(ROUTE_AS),
  }),
  indexes: ["kind", "channelId"],
  read: [ROLE],
});

export const links = defineCollection("links", {
  schema: z.object({
    personId: id,
    memberId,
    teamId: slackId,
    /** The name the account goes by in Slack, which a message in the person's name carries. */
    name: z.string().min(1).max(200),
    /** The account's picture, an https address of Slack's, which a message in their name shows. */
    image: z.string().max(1000).nullable(),
    matchedAt: instant,
  }),
  indexes: ["personId", "memberId"],
  owner: "personId",
  read: [ROLE],
  history: false,
});

const step = z.object({
  decisionId: id,
  kind: z.enum(["approval", "cancellation"]),
  /** The message in the thread that asks, with its buttons. */
  ts: slackTs.nullable(),
  /** Whom the decision is addressed to, by the console's ids. */
  asked: z.array(id).max(50),
  /** The direct messages that asked those the conversation does not hold. */
  dms: z.array(z.object({ channelId, ts: slackTs })).max(10),
  closed: z.boolean(),
});

const post = z.object({
  routeId: id,
  channelId,
  ts: slackTs,
  as: z.enum(ROUTE_AS),
  language: z.enum(LANGUAGES),
});

export const threads = defineCollection("threads", {
  schema: z.object({
    /** The producer, by key, and the thing it told of: a request of leave for `hr`. */
    plugin: z.string().min(1).max(32),
    thing: id,
    personId: id,
    /** The conversation of the person and whoever decides; null where nobody is in Slack. */
    channelId: channelId.nullable(),
    members: z.array(memberId).max(8),
    rootTs: slackTs.nullable(),
    rootAs: z.enum(ROUTE_AS),
    /** The language the thread speaks to the person in. */
    language: z.enum(LANGUAGES),
    steps: z.array(step).max(30),
    /** What the routes posted in channels, to strike through when the thing is cancelled. */
    posts: z.array(post).max(20),
    state: z.enum(["open", "approved", "rejected", "returned", "cancelled"]),
  }),
  indexes: ["thing", "state"],
  read: [ROLE],
  history: false,
  retention: { days: 400, by: "updatedAt" },
});

export const deliveries = defineCollection("deliveries", {
  schema: z.object({
    eventId: z.string().min(1).max(80),
    kind: z.string().min(1).max(80),
    thing: id.nullable(),
    outcome: z.enum(["sent", "skipped", "failed"]),
    note: z.string().max(300),
    attempt: z.number().int().min(1).max(100),
    at: instant,
  }),
  indexes: ["eventId", "at", "outcome"],
  read: [ROLE],
  history: false,
  retention: { days: 30 },
});

export const collections = [connections, routes, links, threads, deliveries];

export type ConnectionData = z.infer<typeof connections.schema>;
export type RouteData = z.infer<typeof routes.schema>;
export type LinkData = z.infer<typeof links.schema>;
export type ThreadData = z.infer<typeof threads.schema>;
export type StepData = z.infer<typeof step>;
export type PostData = z.infer<typeof post>;
export type DeliveryData = z.infer<typeof deliveries.schema>;
