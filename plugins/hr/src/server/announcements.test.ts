// Announcements against the console's test context: one test per row of the design in README.md,
// what a command does, what it refuses, and above all who reads a draft.
import type { PluginCaller, PluginContext } from "@skillcdn/console/plugin";
import { createTestContext, type TestContext } from "@skillcdn/console/plugin/testing";
import { describe, expect, it } from "vitest";
import type {
  Announcement,
  AnnouncementList,
  AnnouncementView,
  OverviewReport,
} from "../shared/contracts.js";
import {
  announcement,
  announcementPicture,
  announcementPictures,
  announcements,
  announcementsQuery,
  announcementView,
  collections,
  overview,
} from "./index.js";

type RestPerson = Awaited<ReturnType<PluginContext["console"]["people"]["list"]>>[number];

const NOW = new Date("2026-11-08T09:00:00+09:00");

function caller(
  id: string,
  login: string,
  roles: string[],
  more: { agent?: string; language?: string } = {},
): PluginCaller {
  return {
    kind: "person",
    person: { id, login, name: login, language: more.language ?? "en", admin: false },
    agent: more.agent ?? null,
    roles,
    run: null,
    project: null,
  };
}

const HR_ID = "00000000-0000-7000-8000-000000000001";
const HR = caller(HR_ID, "hana", ["hr", "member"]);
const HR_AGENT = caller(HR_ID, "hana", ["hr", "member"], { agent: "an agent" });
const HR_TOO_ID = "00000000-0000-7000-8000-000000000002";
const HR_TOO = caller(HR_TOO_ID, "hyun", ["hr", "member"]);
const ALICE = caller("00000000-0000-7000-8000-000000000003", "alice", ["member"]);
const KOREAN_ALICE = caller("00000000-0000-7000-8000-000000000003", "alice", ["member"], {
  language: "ko",
});
const KOREAN_AGENT = caller(HR_ID, "hana", ["hr", "member"], { agent: "an agent", language: "ko" });

function context(): TestContext {
  const people = [
    { id: HR_ID, login: "hana", name: "Hana", managerId: null, language: "en" },
  ] as unknown as RestPerson[];
  return createTestContext({
    collections,
    caller: HR,
    now: () => NOW,
    plugin: { key: "hr", settings: {}, board: { id: "b", key: "hr" } },
    console: {
      workspace: async () => ({
        name: "Test",
        languages: ["en", "ko"],
        timeZone: "Asia/Seoul",
        timeZoneSet: true,
        weekStart: "auto",
        url: "https://console.example.com/",
        categories: [],
      }),
      people: {
        list: async () => people,
        get: async (id) => people.find((person) => person.id === id) ?? null,
        granted: async () => [],
      },
    },
  });
}

const picture = (type = "image/png") => ({ handle: "h", name: "a.png", type, bytes: 10 });

async function draft(ctx: TestContext, title = "Year-end party", body = "We meet on **Friday**.") {
  const result = await announcement.run(ctx, { title, body });
  return (result.data as { id: string }).id;
}

async function published(ctx: TestContext, title?: string, more: object = {}) {
  const id = await draft(ctx, title);
  await announcement.run(ctx, { id, publish: true, ...more });
  return id;
}

const listOf = async (ctx: TestContext, who: PluginCaller, args: object = {}) =>
  (await announcementsQuery.run(ctx.as(who), args)) as AnnouncementList;

describe("a draft", () => {
  it("is HR's alone: nobody else lists it or reads it", async () => {
    const ctx = context();
    const id = await draft(ctx);
    expect((await listOf(ctx, ALICE)).items).toEqual([]);
    await expect(announcementView.run(ctx.as(ALICE), { id })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    await expect(listOf(ctx, ALICE, { scope: "drafts" })).rejects.toMatchObject({
      code: "hr_only",
    });
    const hr = await listOf(ctx, HR, { scope: "drafts" });
    expect(hr.items.map((row) => row.title)).toEqual(["Year-end party"]);
    expect(hr.drafts).toBe(1);
    expect((await listOf(ctx, ALICE)).drafts).toBeNull();
  });

  it("is its writer's: nobody else in HR lists it, counts it, finds it or reads it", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const other = await listOf(ctx, HR_TOO, { scope: "drafts" });
    expect(other.items).toEqual([]);
    expect(other.drafts).toBe(0);
    expect((await listOf(ctx, HR_TOO, { scope: "drafts", search: "Year-end" })).items).toEqual([]);
    await expect(announcementView.run(ctx.as(HR_TOO), { id })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    expect((await listOf(ctx, HR, { scope: "drafts", search: "Year-end" })).items).toHaveLength(1);
  });

  it("is not changed, published, given a picture or removed by anyone else in HR", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const other = ctx.as(HR_TOO);
    for (const args of [
      { id, title: "Taken over" },
      { id, publish: true },
      { id, remove: true },
    ]) {
      await expect(announcement.run(other, args)).rejects.toMatchObject({
        code: "unknown_announcement",
      });
    }
    await expect(announcementPicture.run(other, { id, picture: picture() })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    expect(ctx.all("announcements")[0]).toMatchObject({
      data: { title: "Year-end party", state: "draft", authorId: HR_ID },
    });
  });

  it("is its person's for their agent too", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const agent = ctx.as(HR_AGENT);
    expect((await listOf(ctx, HR_AGENT, { scope: "drafts" })).items).toHaveLength(1);
    await announcement.run(agent, { id, title: "Through an agent" });
    expect(ctx.all("announcements")[0]).toMatchObject({ data: { title: "Through an agent" } });
  });

  it("stands on a record its writer alone reads through the console's routes", () => {
    expect(announcements.read).toEqual([]);
    expect(announcements.readOwn).toEqual(["hr"]);
    expect(announcements.owner).toBe("authorId");
    expect(announcementPictures.read).toEqual(["member", "hr"]);
    expect(Object.keys(announcementPictures.schema.shape)).toEqual([]);
  });

  it("may be left without a title while it is written", async () => {
    const ctx = context();
    const result = await announcement.run(ctx, { body: "A start" });
    expect(result.text).toContain("Untitled");
    expect(result.data).toMatchObject({ state: "draft", version: 1 });
  });

  it("is written by HR alone", async () => {
    const ctx = context();
    await expect(announcement.run(ctx.as(ALICE), { title: "x" })).rejects.toMatchObject({
      code: "hr_only",
    });
  });
});

describe("what is published", () => {
  it("is HR's together: anyone there changes it, whoever wrote it", async () => {
    const ctx = context();
    const id = await published(ctx);
    await announcement.run(ctx.as(HR_TOO), { id, title: "Corrected" });
    expect(ctx.all("announcements")[0]).toMatchObject({
      data: { title: "Corrected", state: "published", authorId: HR_ID },
    });
  });

  it("becomes a draft of whoever takes it down", async () => {
    const ctx = context();
    const id = await published(ctx);
    const result = await announcement.run(ctx.as(HR_TOO), { id, withdraw: true });
    expect(result.text).toContain("your draft");
    expect(ctx.all("announcements")[0]).toMatchObject({
      data: { state: "draft", authorId: HR_TOO_ID },
    });
    expect((await listOf(ctx, HR_TOO, { scope: "drafts" })).items).toHaveLength(1);
    expect((await listOf(ctx, HR, { scope: "drafts" })).items).toEqual([]);
  });
});

describe("publishing", () => {
  it("reaches everyone, with what a list needs of it", async () => {
    const ctx = context();
    const id = await published(ctx);
    const list = await listOf(ctx, ALICE);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      id,
      title: "Year-end party",
      excerpt: "We meet on Friday.",
      category: "general",
      fresh: true,
      onTop: false,
      cover: null,
      author: { login: "hana", name: "Hana" },
    });
    const view = (await announcementView.run(ctx.as(ALICE), { id })) as AnnouncementView;
    expect(view.body).toBe("We meet on **Friday**.");
    expect(view.consoleOrigin).toBe("https://console.example.com");
    expect(view.publishedAt).toBe(NOW.toISOString());
  });

  it("is new for three days, by the date", async () => {
    const ctx = context();
    const id = await published(ctx);
    await ctx.records(announcements).update(id, {
      publishedAt: new Date(NOW.getTime() - 73 * 3_600_000).toISOString(),
    });
    expect((await listOf(ctx, ALICE)).items[0]?.fresh).toBe(false);
  });

  it("needs a title and a text", async () => {
    const ctx = context();
    await expect(announcement.run(ctx, { body: "text", publish: true })).rejects.toMatchObject({
      code: "title",
    });
    await expect(announcement.run(ctx, { title: "x", publish: true })).rejects.toMatchObject({
      code: "body",
    });
  });

  it("is the same for an agent as for the person it acts for", async () => {
    const ctx = context();
    const agent = ctx.as(HR_AGENT);
    const result = await announcement.run(agent, { title: "From an agent", body: "Text" });
    const { id } = result.data as { id: string };
    await announcement.run(agent, { id, publish: true });
    expect(ctx.all("announcements")[0]).toMatchObject({ data: { state: "published" } });
    await announcement.run(agent, { id, title: "Changed" });
    expect(ctx.all("announcements")[0]).toMatchObject({ data: { title: "Changed" } });
    await announcementPicture.run(agent, { id, picture: picture() });
    await announcement.run(agent, { id, withdraw: true });
    expect(ctx.all("announcements")[0]).toMatchObject({ data: { state: "draft" } });
    await announcement.run(agent, { id, remove: true });
    await expect(announcementView.run(ctx, { id })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
  });

  it("says so in the caller's language", async () => {
    const ctx = context();
    await expect(
      announcement.run(ctx.as(KOREAN_AGENT), { title: "x", publish: true }),
    ).rejects.toThrow("게시하려면 본문이 필요합니다");
    await expect(announcementView.run(ctx.as(KOREAN_ALICE), { id: "nothing" })).rejects.toThrow(
      "해당 공지가 없습니다",
    );
  });

  it("takes one move at a time", async () => {
    const ctx = context();
    const id = await draft(ctx);
    await expect(announcement.run(ctx, { id, publish: true, remove: true })).rejects.toMatchObject({
      code: "one_move",
    });
  });
});

describe("a change", () => {
  it("to what is published stays published, and says when", async () => {
    const ctx = context();
    const id = await published(ctx);
    const result = await announcement.run(ctx, { id, title: "Year-end dinner" });
    expect(result.text).toContain("Changed");
    const view = (await announcementView.run(ctx.as(ALICE), { id })) as AnnouncementView;
    expect(view).toMatchObject({
      title: "Year-end dinner",
      state: "published",
      editedAt: NOW.toISOString(),
    });
  });

  it("is refused over one that came in between", async () => {
    const ctx = context();
    const id = await draft(ctx);
    await announcement.run(ctx, { id, title: "Second" });
    await expect(announcement.run(ctx, { id, title: "Third", base: 1 })).rejects.toThrow();
    expect(ctx.all("announcements")[0]).toMatchObject({ data: { title: "Second" } });
  });

  it("taking it down hides it from everyone and leaves a draft", async () => {
    const ctx = context();
    const id = await published(ctx);
    await announcement.run(ctx, { id, withdraw: true });
    expect((await listOf(ctx, ALICE)).items).toEqual([]);
    expect(ctx.all("announcements")[0]).toMatchObject({
      data: { state: "draft", publishedAt: null, publishedBy: null },
    });
  });

  it("refuses an announcement that does not exist, or was removed", async () => {
    const ctx = context();
    await expect(announcement.run(ctx, { id: "nothing", title: "x" })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    const id = await published(ctx);
    await announcement.run(ctx, { id, remove: true });
    expect((await listOf(ctx, ALICE)).items).toEqual([]);
    await expect(announcement.run(ctx, { id, title: "x" })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    await expect(announcementView.run(ctx, { id })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
  });

  it("takes down or removes only what exists", async () => {
    const ctx = context();
    await expect(announcement.run(ctx, { withdraw: true })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    await expect(announcement.run(ctx, { remove: true })).rejects.toMatchObject({
      code: "unknown_announcement",
    });
    expect(ctx.all("announcements")).toEqual([]);
  });

  it("taking down a draft leaves a draft", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const result = await announcement.run(ctx, { id, withdraw: true });
    expect(result.data).toMatchObject({ state: "draft" });
    expect(result.text).toContain("Saved the draft");
  });

  it("says the id, which is what an agent goes on from", async () => {
    const ctx = context();
    const written = await announcement.run(ctx, { title: "Offsite", body: "In May." });
    const { id } = written.data as { id: string };
    expect(written.text).toContain(id);
    expect((await announcement.run(ctx, { id, publish: true })).text).toContain(id);
    expect((await announcement.run(ctx, { id, title: "Offsite 2" })).text).toContain(id);
    expect((await announcement.run(ctx, { id, withdraw: true })).text).toContain(id);
  });

  it("refuses a last day on top that is no day", async () => {
    const ctx = context();
    await expect(
      announcement.run(ctx, { title: "x", "pinned-until": "someday" }),
    ).rejects.toMatchObject({ code: "pinned_until" });
  });
});

describe("the list", () => {
  it("answers ten on a page unless told otherwise", async () => {
    const ctx = context();
    for (let index = 0; index < 12; index += 1) {
      await published(ctx, `Notice ${index}`);
    }
    expect((await listOf(ctx, ALICE)).items).toHaveLength(10);
    expect((await listOf(ctx, ALICE, { limit: 12 })).items).toHaveLength(12);
  });

  it("puts what is pinned first, then the newest, and leaves a pin that ran out", async () => {
    const ctx = context();
    await published(ctx, "First");
    await published(ctx, "Pinned", { pinned: "on" });
    await published(ctx, "Ran out", { pinned: "on", "pinned-until": "2026-11-07" });
    await published(ctx, "Today is the last", { pinned: "on", "pinned-until": "2026-11-08" });
    const list = await listOf(ctx, ALICE);
    expect(list.pinned.map((row) => row.title).sort()).toEqual(["Pinned", "Today is the last"]);
    expect(list.items.map((row) => row.title).sort()).toEqual(["First", "Ran out"]);
    expect(list.items.every((row) => !row.onTop)).toBe(true);
  });

  it("filters by category and looks for words", async () => {
    const ctx = context();
    const id = await published(ctx, "A policy");
    await announcement.run(ctx, { id, category: "policy" });
    await published(ctx, "A party");
    const byCategory = await listOf(ctx, ALICE, { category: "policy" });
    expect(byCategory.items.map((row) => row.title)).toEqual(["A policy"]);
    const byWords = await listOf(ctx, ALICE, { search: "party" });
    expect(byWords.items.map((row) => row.title)).toEqual(["A party"]);
  });

  it("does not find a draft by its words", async () => {
    const ctx = context();
    await draft(ctx, "A secret plan");
    expect((await listOf(ctx, ALICE, { search: "secret" })).items).toEqual([]);
  });

  it("stands at the head of the overview", async () => {
    const ctx = context();
    await published(ctx, "One");
    await published(ctx, "Two", { pinned: "on" });
    await draft(ctx, "Not yet");
    const report = (await overview.run(ctx.as(ALICE), {})) as OverviewReport;
    expect(report.announcements.map((row) => row.title)).toEqual(
      expect.arrayContaining(["One", "Two"]),
    );
    expect(report.announcements).toHaveLength(2);
    expect(report.announcements[0]?.title).toBe("Two");
  });

  it("makes nothing of what a text should not be", async () => {
    const ctx = context();
    await published(ctx, "Hostile", {
      body: '[x](javascript:alert(1)) <img src=x onerror="alert(1)">',
    });
    const list = await listOf(ctx, ALICE);
    expect(list.items[0]?.excerpt).toBe('[x](javascript:alert(1)) <img src=x onerror="alert(1)">');
  });
});

describe("pictures", () => {
  const attach = async (ctx: TestContext, id: string, type?: string) =>
    (await announcementPicture.run(ctx, { id, picture: picture(type), alt: "A room" })).data as {
      file: string;
      line: string;
      version: number;
    };

  it("are attached to a draft, and the first is its cover", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const { file, line } = await attach(ctx, id);
    expect(line).toBe(`![A room](file:${file})`);
    await announcement.run(ctx, { id, body: `Text\n\n${line}`, publish: true });
    expect((await listOf(ctx, ALICE)).items[0]?.cover).toBe(file);
  });

  it("say the line that shows them, which is what an agent goes on from", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const result = await announcementPicture.run(ctx, { id, picture: picture(), alt: "A room" });
    expect(result.text).toContain((result.data as { line: string }).line);
  });

  it("answer the version the record moved to", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const { version } = await attach(ctx, id);
    await announcement.run(ctx, { id, title: "Moved", base: version });
    const second = await attach(ctx, id);
    expect(second.version).toBe(version + 1);
  });

  it("hold a record of their own that says nothing of the announcement", async () => {
    const ctx = context();
    const id = await draft(ctx);
    await attach(ctx, id);
    const record = ctx.all("announcements")[0]?.data as unknown as Announcement;
    const holders = ctx.all("announcement-pictures");
    expect(holders).toHaveLength(1);
    expect(holders[0]).toMatchObject({ id: record.picturesId, data: {} });
  });

  it("must be pictures, of a bounded number", async () => {
    const ctx = context();
    const id = await draft(ctx);
    for (const type of ["image/svg+xml", "text/html", "application/octet-stream"]) {
      await expect(attach(ctx, id, type)).rejects.toMatchObject({ code: "picture_type" });
    }
    for (let count = 0; count < 20; count += 1) {
      await attach(ctx, id);
    }
    await expect(attach(ctx, id)).rejects.toMatchObject({ code: "too_many_pictures" });
  });

  it("are refused in a text that names one the announcement does not hold", async () => {
    const ctx = context();
    const id = await draft(ctx);
    await expect(
      announcement.run(ctx, { id, body: "![x](file:another-one)" }),
    ).rejects.toMatchObject({ code: "picture_gone" });
  });

  it("the text no longer shows go when it is published", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const kept = await attach(ctx, id);
    await attach(ctx, id);
    await announcement.run(ctx, { id, body: kept.line, publish: true });
    const record = ctx.all("announcements")[0]?.data as unknown as Announcement;
    const files = await ctx
      .records(announcementPictures)
      .files(record.picturesId ?? "")
      .list();
    expect(files.map((file) => file.id)).toEqual([kept.file]);
  });

  it("go for good with the announcement", async () => {
    const ctx = context();
    const id = await draft(ctx);
    const { line } = await attach(ctx, id);
    await announcement.run(ctx, { id, body: line, publish: true });
    const record = ctx.all("announcements")[0]?.data as unknown as Announcement;
    await announcement.run(ctx, { id, remove: true });
    const holder = ctx.records(announcementPictures);
    expect(await holder.files(record.picturesId ?? "").list()).toEqual([]);
    expect((await holder.get(record.picturesId ?? ""))?.archivedAt).not.toBeNull();
  });

  it("are HR's to attach", async () => {
    const ctx = context();
    const id = await draft(ctx);
    await expect(
      announcementPicture.run(ctx.as(ALICE), { id, picture: picture() }),
    ).rejects.toMatchObject({ code: "hr_only" });
  });
});
