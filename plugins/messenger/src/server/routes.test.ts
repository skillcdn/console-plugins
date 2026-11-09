// Routes: a kind sent to a channel, checked with Slack when it is written, kept once per kind and
// channel, taken away; and the channels a route may name.
import { describe, expect, it } from "vitest";
import type { ChannelView, RouteView } from "../shared/contracts.js";
import { channels, route, routesQuery, unroute } from "./index.js";
import { connected, fakeSlack, KEEPER_KO, STRANGER, setup } from "./test-fakes.js";

const workspace = fakeSlack({
  "conversations.info": (params) =>
    ({
      C0GENERAL: { ok: true, channel: { id: "C0GENERAL", name: "general", is_private: false } },
      C0SECRET1: {
        ok: true,
        channel: { id: "C0SECRET1", name: "secret", is_private: true, is_member: false },
      },
      C0OLD0001: { ok: true, channel: { id: "C0OLD0001", name: "old", is_archived: true } },
    })[params.channel ?? ""] ?? { ok: false, error: "channel_not_found" },
  "conversations.list": () => ({
    ok: true,
    channels: [
      { id: "C0RANDOM1", name: "random", is_private: false, is_member: false },
      { id: "C0GENERAL", name: "general", is_private: false, is_member: true },
      { id: "C0SECRET1", name: "secret", is_private: true, is_member: false },
      { id: "C0TEAM001", name: "team-leave", is_private: true, is_member: true },
      { id: "not a channel" },
    ],
  }),
});

describe("route", () => {
  it("sends approved leave to a channel, in a language, under the person's name unless said", async () => {
    const { ctx } = setup({ slack: workspace });
    await connected(ctx);
    const result = await route.run(ctx, { channel: "C0GENERAL", language: "ko" });
    expect(result.text).toContain("#general");
    expect(ctx.all("routes")[0]?.data).toEqual({
      kind: "hr:leave-approved",
      channelId: "C0GENERAL",
      channelName: "general",
      language: "ko",
      as: "person",
    });
  });

  it("speaks the language of whoever routes the channel unless said", async () => {
    const { ctx } = setup({ slack: workspace, caller: KEEPER_KO });
    await connected(ctx, "en");
    await route.run(ctx, { channel: "C0GENERAL" });
    expect(ctx.all("routes")[0]?.data.language).toBe("ko");
  });

  it("speaks the workspace's language where one is set, before the language of whoever routes", async () => {
    const { ctx } = setup({ slack: workspace, workspaceLanguage: "ko" });
    await connected(ctx, "en");
    await route.run(ctx, { channel: "C0GENERAL" });
    expect(ctx.all("routes")[0]?.data.language).toBe("ko");
  });

  it("keeps one route per kind and channel, changed in place", async () => {
    const { ctx } = setup({ slack: workspace });
    await connected(ctx);
    await route.run(ctx, { channel: "C0GENERAL" });
    await route.run(ctx, { channel: "C0GENERAL", as: "app", language: "en" });
    expect(ctx.all("routes")).toHaveLength(1);
    expect(ctx.all("routes")[0]?.data).toMatchObject({ as: "app", language: "en" });
  });

  it("refuses a channel Slack does not know, an archived one, and a private one the app is not in", async () => {
    const { ctx } = setup({ slack: workspace });
    await connected(ctx);
    await expect(route.run(ctx, { channel: "C0NOWHERE" })).rejects.toMatchObject({
      code: "unknown_channel",
    });
    await expect(route.run(ctx, { channel: "C0OLD0001" })).rejects.toMatchObject({
      code: "unknown_channel",
    });
    await expect(route.run(ctx, { channel: "C0SECRET1" })).rejects.toMatchObject({
      code: "not_member",
    });
    await expect(route.run(ctx, { channel: "<!channel>" })).rejects.toMatchObject({
      code: "unknown_channel",
    });
    expect(ctx.all("routes")).toHaveLength(0);
  });

  it("refuses before Slack is connected, and to whoever does not hold the role", async () => {
    const { ctx } = setup({ slack: workspace });
    await expect(route.run(ctx, { channel: "C0GENERAL" })).rejects.toMatchObject({
      code: "not_connected",
    });
    const other = setup({ slack: workspace, caller: STRANGER });
    await connected(other.ctx);
    await expect(route.run(other.ctx, { channel: "C0GENERAL" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("unroute and routes", () => {
  it("lists the routes and takes one away", async () => {
    const { ctx } = setup({ slack: workspace });
    await connected(ctx);
    const saved = await route.run(ctx, { channel: "C0GENERAL" });
    const id = (saved.data as RouteView).id;
    expect(((await routesQuery.run(ctx, {})) as RouteView[]).map((view) => view.id)).toEqual([id]);
    await unroute.run(ctx, { id });
    expect(await routesQuery.run(ctx, {})).toEqual([]);
    await expect(unroute.run(ctx, { id })).rejects.toMatchObject({ code: "unknown_route" });
  });
});

describe("channels", () => {
  it("lists the public channels and the private ones the app is in, by name", async () => {
    const { ctx } = setup({ slack: workspace });
    await connected(ctx);
    const found = (await channels.run(ctx, {})) as ChannelView[];
    expect(found.map((channel) => channel.name)).toEqual(["general", "random", "team-leave"]);
    const some = (await channels.run(ctx, { search: "TEAM" })) as ChannelView[];
    expect(some.map((channel) => channel.id)).toEqual(["C0TEAM001"]);
  });
});
