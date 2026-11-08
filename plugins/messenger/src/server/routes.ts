// Routes: which kind of which plugin goes to which channel, in which language, under whose name
// (ADR-0008, point 2). The producer emits its events and decides nothing of this; whoever keeps
// the messenger does. A route names a channel by its id, checked with Slack when it is written,
// so that a private channel the app is not in is refused before anything is sent there.
import {
  arg,
  defineCommand,
  defineQuery,
  type PluginContext,
  PluginError,
  z,
} from "@skillcdn/console/plugin";
import {
  type ChannelView,
  LANGUAGES,
  ROUTE_AS,
  ROUTE_KINDS,
  type RouteView,
} from "../shared/contracts.js";
import { ROLE, requireRole } from "./access.js";
import { routes } from "./collections.js";
import { workspaceLanguage } from "./people.js";
import { refusalOf, SlackError, slack } from "./slack/api.js";
import { connectionOf, isConnected } from "./store.js";
import { serverWords } from "./words.js";

const channelInfo = z.object({
  id: z.string().regex(/^[CG][A-Z0-9]{2,40}$/),
  name: z.string().max(200).optional(),
  is_private: z.boolean().optional(),
  is_member: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

const channelsPage = z.object({
  channels: z.array(z.unknown()).max(1000),
  response_metadata: z.object({ next_cursor: z.string().max(1000).optional() }).optional(),
});

/** At most this many pages of channels are listed: a thousand channels. */
const CHANNEL_PAGES = 5;

async function requireConnected(ctx: PluginContext): Promise<void> {
  if (!isConnected(await connectionOf(ctx))) {
    throw new PluginError("not_connected", serverWords(ctx.language).refused.notConnected);
  }
}

function viewOf(id: string, data: z.infer<typeof routes.schema>): RouteView {
  return {
    id,
    kind: data.kind,
    channelId: data.channelId,
    channelName: data.channelName,
    language: data.language,
    as: data.as,
  };
}

export const route = defineCommand({
  about: "Sends a kind of event to a Slack channel, in a language, under a name.",
  args: {
    channel: arg.text({
      about: "the channel's id in Slack (C0123ABCD), as the query channels lists it",
      positional: true,
      max: 40,
    }),
    kind: arg.enum(ROUTE_KINDS, {
      about: "what goes there: hr:leave-approved, leave once it is approved, unless said",
      optional: true,
    }),
    language: arg.enum(LANGUAGES, {
      about: "the language the channel reads it in; the workspace's first unless said",
      optional: true,
    }),
    as: arg.enum(ROUTE_AS, {
      about:
        "under whose name: the person's, where their account is matched (person), or the app's (app); person unless said",
      optional: true,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    await requireConnected(ctx);
    if (!/^[CG][A-Z0-9]{2,40}$/.test(args.channel)) {
      throw new PluginError("unknown_channel", words.refused.unknownChannel(args.channel));
    }
    let channel: z.infer<typeof channelInfo>;
    try {
      const answer = await slack(ctx, "conversations.info", { channel: args.channel });
      channel = channelInfo.parse(answer.channel);
    } catch (error) {
      if (error instanceof SlackError && error.code === "channel_not_found") {
        throw new PluginError("unknown_channel", words.refused.unknownChannel(args.channel));
      }
      throw refusalOf(ctx, error);
    }
    const name = channel.name ?? channel.id;
    if (channel.is_archived === true) {
      throw new PluginError("unknown_channel", words.refused.unknownChannel(name));
    }
    if (channel.is_private === true && channel.is_member !== true) {
      throw new PluginError("not_member", words.refused.privateNotMember(name));
    }
    const kind = args.kind ?? "hr:leave-approved";
    const data = {
      kind,
      channelId: channel.id,
      channelName: name,
      language: args.language ?? (await workspaceLanguage(ctx)),
      as: args.as ?? "person",
    } as const;
    const found = await ctx.records(routes).list({
      where: { kind, channelId: channel.id },
      limit: 1,
    });
    const existing = found.items[0];
    const record =
      existing === undefined
        ? await ctx.records(routes).create(data)
        : await ctx.records(routes).update(existing.id, data);
    return { text: words.said.routeSaved(record.id, name), data: viewOf(record.id, record.data) };
  },
});

export const unroute = defineCommand({
  about: "Takes a route away: nothing more goes to its channel.",
  args: {
    id: arg.record("routes", {
      about: "the route, as the query routes lists it",
      positional: true,
    }),
  },
  roles: [ROLE],
  async run(ctx, args) {
    requireRole(ctx);
    const words = serverWords(ctx.language);
    const found = await ctx.records(routes).get(args.id);
    if (found === null || found.archivedAt !== null) {
      throw new PluginError("unknown_route", words.refused.unknownRoute);
    }
    await ctx.records(routes).archive(found.id);
    return { text: words.said.routeRemoved(found.id), data: { id: found.id } };
  },
});

export const routesQuery = defineQuery({
  about: "The routes: which kind goes to which channel, in which language, under whose name.",
  roles: [ROLE],
  async run(ctx): Promise<RouteView[]> {
    requireRole(ctx);
    const page = await ctx.records(routes).list({ limit: 200, order: { field: "kind" } });
    return page.items.map((record) => viewOf(record.id, record.data));
  },
});

export const channels = defineQuery({
  about:
    "The workspace's channels a route may name: the public ones, and the private the app is in.",
  args: {
    search: arg.text({
      about: "only the channels whose name holds these words",
      optional: true,
      max: 80,
    }),
  },
  roles: [ROLE],
  async run(ctx, args): Promise<ChannelView[]> {
    requireRole(ctx);
    await requireConnected(ctx);
    const found: ChannelView[] = [];
    let cursor: string | undefined;
    try {
      for (let page = 0; page < CHANNEL_PAGES; page += 1) {
        const answer = channelsPage.parse(
          await slack(ctx, "conversations.list", {
            types: "public_channel,private_channel",
            exclude_archived: true,
            limit: 200,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        );
        for (const raw of answer.channels) {
          const parsed = channelInfo.safeParse(raw);
          if (parsed.success && parsed.data.is_archived !== true) {
            found.push({
              id: parsed.data.id,
              name: parsed.data.name ?? parsed.data.id,
              private: parsed.data.is_private === true,
              member: parsed.data.is_member === true,
            });
          }
        }
        cursor = answer.response_metadata?.next_cursor;
        if (cursor === undefined || cursor.length === 0) {
          break;
        }
      }
    } catch (error) {
      throw refusalOf(ctx, error);
    }
    const words = (args.search ?? "").trim().toLowerCase();
    return found
      .filter((channel) => words.length === 0 || channel.name.toLowerCase().includes(words))
      .filter((channel) => !channel.private || channel.member)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
