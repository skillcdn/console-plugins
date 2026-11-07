// Announcements: what HR tells everyone. A draft is HR's alone; what is published everyone reads
// through the queries here, since the record itself stays HR's. Whoever holds the role writes,
// publishes and takes down, a person on the page or their agent through the same command, and the
// console's record says which. Nobody's reading is tracked: a command leaves an event for every
// open frame, and what is new is told by the date.
import {
  arg,
  defineCommand,
  defineQuery,
  type PluginContext,
  PluginError,
  type PluginRecord,
} from "@skillcdn/console/plugin";
import {
  ANNOUNCEMENT_BODY_AT_MOST,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_TITLE_AT_MOST,
  type Announcement,
  type AnnouncementList,
  type AnnouncementRow,
  type AnnouncementView,
  PICTURE_TYPES,
  PICTURES_AT_MOST,
} from "../shared/contracts.js";
import { isDay } from "../shared/days.js";
import { imageLine, imagesOf, parseText, plainOf } from "../shared/rich-text.js";
import { actorOf, ROLE_HR, ROLE_MEMBER, requireHr, requirePerson } from "./access.js";
import { announcementPictures, announcements } from "./collections.js";
import { type Clock, clockOf, type Directory, directoryOf } from "./store.js";
import { serverWords } from "./words.js";

const FRESH_HOURS = 72;
const EXCERPT_AT_MOST = 140;
const PAGE = 20;
const PAGE_AT_MOST = 50;
/** More than this many pinned would no longer be a top of anything. */
const PINNED_AT_MOST = 20;

function isOnTop(data: Announcement, today: string): boolean {
  return data.pinned && (data.pinnedUntil === null || data.pinnedUntil >= today);
}

function rowOf(
  record: PluginRecord<Announcement>,
  clock: Clock,
  directory: Directory,
): AnnouncementRow {
  const { data } = record;
  const blocks = parseText(data.body);
  const author = directory.get(data.authorId);
  const published = data.publishedAt === null ? Number.NaN : Date.parse(data.publishedAt);
  return {
    id: record.id,
    title: data.title,
    category: data.category,
    state: data.state,
    onTop: data.state === "published" && isOnTop(data, clock.today),
    pinned: data.pinned,
    pinnedUntil: data.pinnedUntil,
    fresh: clock.now.getTime() - published < FRESH_HOURS * 3_600_000,
    excerpt: plainOf(blocks, EXCERPT_AT_MOST),
    cover: imagesOf(blocks)[0] ?? null,
    author: {
      id: data.authorId,
      login: author?.login ?? data.authorId,
      name: author?.name ?? null,
    },
    publishedAt: data.publishedAt,
    editedAt: data.editedAt,
    writtenAt: data.writtenAt,
  };
}

async function pinnedNow(ctx: PluginContext, clock: Clock): Promise<PluginRecord<Announcement>[]> {
  const page = await ctx.records(announcements).list({
    where: { state: "published", pinned: true },
    order: { field: "publishedAt", descending: true },
    limit: PINNED_AT_MOST,
  });
  return page.items.filter((record) => isOnTop(record.data, clock.today));
}

/** What the widget and the overview show: those on top first, then the newest. */
export async function latestAnnouncements(
  ctx: PluginContext,
  clock: Clock,
  directory: Directory,
  count: number,
): Promise<AnnouncementRow[]> {
  const pinned = await pinnedNow(ctx, clock);
  const page = await ctx.records(announcements).list({
    where: { state: "published" },
    order: { field: "publishedAt", descending: true },
    limit: count + pinned.length,
  });
  const shown = new Set(pinned.map((record) => record.id));
  return [...pinned, ...page.items.filter((record) => !shown.has(record.id))]
    .slice(0, count)
    .map((record) => rowOf(record, clock, directory));
}

/** The record, unless it was removed. */
async function live(ctx: PluginContext, id: string): Promise<PluginRecord<Announcement> | null> {
  const record = await ctx.records(announcements).get(id);
  return record === null || record.archivedAt !== null ? null : record;
}

/** Takes away the files of an announcement that its text does not show. */
async function dropPictures(
  ctx: PluginContext,
  picturesId: string | null,
  shown: ReadonlySet<string>,
): Promise<void> {
  if (picturesId === null) {
    return;
  }
  const files = ctx.records(announcementPictures).files(picturesId);
  for (const file of await files.list()) {
    if (!shown.has(file.id)) {
      await files.remove(file.id);
    }
  }
}

export const announcement = defineCommand({
  about:
    "HR: writes an announcement, a draft until it is published; an id changes one. --publish, --withdraw and --remove act on it.",
  args: {
    id: arg.record("announcements", {
      about: "the announcement to change; left out, a new draft",
      positional: true,
      optional: true,
    }),
    title: arg.text({ about: "its title", optional: true, max: ANNOUNCEMENT_TITLE_AT_MOST }),
    body: arg.markdown({
      about:
        "its text: ## headings, lists, > quotes, **bold**, *italic*, ++underline++, ~~strike~~",
      optional: true,
      max: ANNOUNCEMENT_BODY_AT_MOST,
    }),
    category: arg.enum(ANNOUNCEMENT_CATEGORIES, {
      about: "what it is about",
      optional: true,
    }),
    pinned: arg.enum(["on", "off"], { about: "whether it stands on top", optional: true }),
    "pinned-until": arg.text({
      about: "the last day it stays on top, YYYY-MM-DD, or none",
      optional: true,
      max: 10,
    }),
    base: arg.number({
      about: "the version this was written over; a change since then refuses it",
      optional: true,
      integer: true,
      min: 0,
    }),
    publish: arg.boolean({ about: "publish it, for everyone to read", optional: true }),
    withdraw: arg.boolean({ about: "take it down, back to a draft", optional: true }),
    remove: arg.boolean({ about: "remove it and its pictures", optional: true }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    requirePerson(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    if ([args.publish, args.withdraw, args.remove].filter((move) => move === true).length > 1) {
      throw new PluginError("one_move", no.oneMove);
    }
    const records = ctx.records(announcements);
    const existing = args.id === undefined ? null : await live(ctx, args.id);
    if (args.id !== undefined && existing === null) {
      throw new PluginError("unknown_announcement", no.noAnnouncement);
    }
    const until = args["pinned-until"];
    if (until !== undefined && until !== "none" && !isDay(until)) {
      throw new PluginError("pinned_until", no.pinnedUntilShape);
    }

    if (existing === null && (args.remove === true || args.withdraw === true)) {
      throw new PluginError("unknown_announcement", no.noAnnouncement);
    }

    if (existing !== null && args.remove === true) {
      await dropPictures(ctx, existing.data.picturesId, new Set());
      if (existing.data.picturesId !== null) {
        await ctx.records(announcementPictures).archive(existing.data.picturesId);
      }
      await records.archive(existing.id);
      await ctx.events.emit("announcement-changed", { id: existing.id });
      return { text: words.announcementRemoved(existing.data.title), data: { id: existing.id } };
    }

    const now = ctx.now().toISOString();
    const before: Announcement = existing?.data ?? {
      title: "",
      body: "",
      category: "general",
      state: "draft",
      pinned: false,
      pinnedUntil: null,
      picturesId: null,
      authorId: actor.id,
      publishedBy: null,
      publishedAt: null,
      editedAt: null,
      writtenAt: now,
    };
    const withdrawn = args.withdraw === true && before.state === "published";
    const published = before.state === "published" && !withdrawn;
    const going = args.publish === true && !published;
    const next: Announcement = {
      ...before,
      title: args.title?.trim() ?? before.title,
      body: args.body ?? before.body,
      category: args.category ?? before.category,
      pinned: args.pinned === undefined ? before.pinned : args.pinned === "on",
      pinnedUntil: until === undefined ? before.pinnedUntil : until === "none" ? null : until,
      state: published || going ? "published" : "draft",
      publishedBy: going ? actor.id : published ? before.publishedBy : null,
      publishedAt: going ? now : published ? before.publishedAt : null,
      editedAt: published ? now : null,
      writtenAt: now,
    };

    const blocks = parseText(next.body);
    const shown = imagesOf(blocks);
    if (shown.length > 0) {
      const held =
        next.picturesId === null
          ? []
          : await ctx.records(announcementPictures).files(next.picturesId).list();
      const ids = new Set(held.map((file) => file.id));
      if (shown.some((file) => !ids.has(file))) {
        throw new PluginError("picture_gone", no.pictureGone);
      }
    }
    if (next.state === "published") {
      if (next.title.length === 0) {
        throw new PluginError("title", no.announcementNeedsTitle);
      }
      if (plainOf(blocks, 1).length === 0 && shown.length === 0) {
        throw new PluginError("body", no.announcementNeedsBody);
      }
      await dropPictures(ctx, next.picturesId, new Set(shown));
    }

    const saved =
      existing === null
        ? await records.create(next)
        : await records.update(existing.id, next, {
            baseVersion: args.base ?? existing.version,
          });
    await ctx.events.emit(going ? "announcement-published" : "announcement-changed", {
      id: saved.id,
    });
    const title = next.title.length > 0 ? next.title : words.untitled;
    return {
      text: going
        ? words.announcementPublished(title)
        : withdrawn
          ? words.announcementWithdrawn(title)
          : published
            ? words.announcementChanged(title)
            : words.announcementDrafted(title),
      data: { id: saved.id, version: saved.version, state: next.state },
    };
  },
});

export const announcementPicture = defineCommand({
  about:
    "HR: attaches a picture to an announcement and answers the line that shows it, which then goes in the body.",
  args: {
    id: arg.record("announcements", { about: "the announcement", positional: true }),
    picture: arg.file({ about: "a PNG, JPEG, WebP or GIF" }),
    alt: arg.text({ about: "what it shows, in a few words", optional: true, max: 200 }),
  },
  roles: [ROLE_HR],
  async run(ctx, args) {
    const actor = actorOf(ctx);
    requireHr(actor);
    requirePerson(actor);
    const words = serverWords(ctx.language);
    const no = words.refused;
    const existing = await live(ctx, args.id);
    if (existing === null) {
      throw new PluginError("unknown_announcement", no.noAnnouncement);
    }
    if (!(PICTURE_TYPES as readonly string[]).includes(args.picture.type)) {
      throw new PluginError("picture_type", no.pictureType);
    }
    const holders = ctx.records(announcementPictures);
    let picturesId = existing.data.picturesId;
    let version = existing.version;
    if (picturesId === null) {
      const holder = await holders.create({});
      picturesId = holder.id;
      const saved = await ctx
        .records(announcements)
        .update(existing.id, { picturesId }, { baseVersion: existing.version });
      version = saved.version;
    } else if ((await holders.files(picturesId).list()).length >= PICTURES_AT_MOST) {
      throw new PluginError("too_many_pictures", no.tooManyPictures(PICTURES_AT_MOST));
    }
    const file = await holders.files(picturesId).attach(args.picture);
    return {
      text: words.pictureAttached,
      data: { file: file.id, line: imageLine(file.id, args.alt ?? ""), version },
    };
  },
});

export const announcementsQuery = defineQuery({
  about:
    "The announcements: those on top, then the newest, by category or by words; --scope drafts lists HR's drafts.",
  args: {
    scope: arg.enum(["published", "drafts"], { about: "which", optional: true }),
    category: arg.enum(ANNOUNCEMENT_CATEGORIES, { about: "of one category", optional: true }),
    search: arg.text({ about: "words to look for", optional: true, max: 100 }),
    limit: arg.number({
      about: "how many on a page",
      optional: true,
      integer: true,
      min: 1,
      max: PAGE_AT_MOST,
    }),
    after: arg.text({ about: "where the page begins", optional: true, max: 200 }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<AnnouncementList> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const drafts = args.scope === "drafts";
    if (drafts) {
      requireHr(actor);
    }
    const [clock, directory] = await Promise.all([clockOf(ctx), directoryOf(ctx)]);
    const records = ctx.records(announcements);
    const where = {
      state: drafts ? "draft" : "published",
      ...(args.category === undefined ? {} : { category: args.category }),
    };
    const limit = args.limit ?? PAGE;
    const words = args.search?.trim() ?? "";
    const page =
      words.length > 0
        ? await records.search(words, { where, limit })
        : await records.list({
            where,
            order: { field: drafts ? "writtenAt" : "publishedAt", descending: true },
            limit,
            ...(args.after === undefined ? {} : { after: args.after }),
          });
    const browsing = !drafts && words.length === 0;
    const pinned = browsing ? await pinnedNow(ctx, clock) : [];
    const shown = new Set(pinned.map((record) => record.id));
    const counted = actor.hr
      ? await records.aggregate({ where: { state: "draft" }, count: true })
      : null;
    return {
      pinned: (args.after === undefined && args.category === undefined ? pinned : []).map(
        (record) => rowOf(record, clock, directory),
      ),
      items: page.items
        .filter((record) => !shown.has(record.id) || args.category !== undefined)
        .map((record) => rowOf(record, clock, directory)),
      after: words.length > 0 ? null : page.after,
      drafts: counted === null ? null : (counted[0]?.count ?? 0),
    };
  },
});

export const announcementView = defineQuery({
  about: "One announcement in full: its text and who wrote it. A draft is HR's alone to read.",
  args: {
    id: arg.record("announcements", { about: "the announcement", positional: true }),
  },
  roles: [ROLE_MEMBER, ROLE_HR],
  async run(ctx, args): Promise<AnnouncementView> {
    const actor = actorOf(ctx);
    requirePerson(actor);
    const record = await live(ctx, args.id);
    if (record === null || (record.data.state !== "published" && !actor.hr)) {
      throw new PluginError(
        "unknown_announcement",
        serverWords(ctx.language).refused.noAnnouncement,
      );
    }
    const [clock, directory] = await Promise.all([clockOf(ctx), directoryOf(ctx)]);
    return {
      ...rowOf(record, clock, directory),
      body: record.data.body,
      version: record.version,
    };
  },
});
