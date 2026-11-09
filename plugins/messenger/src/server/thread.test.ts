// HR's leave told in Slack from HR's events alone: the group conversation and the request in the
// person's name, each step asked with buttons and closed when answered, the channels told at
// approval, a cancellation struck through where it was said; each event told once, what a person
// wrote never read as Slack's markup, and nothing told where Slack, HR or the role is missing.
import type { PluginHookEvent } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import type { ActivityRow } from "../shared/contracts.js";
import { activity, onLeaveEvent } from "./index.js";
import {
  CONSOLE,
  connected,
  fakeHr,
  fakeSlack,
  HANA,
  JIHYE,
  linked,
  MINSU,
  NOW,
  setup,
} from "./test-fakes.js";

const REQUEST = "0199c000-0000-7000-8000-0000000000a1";
const FIRST = "0199b000-0000-7000-8000-00000000d001";
const SECOND = "0199b000-0000-7000-8000-00000000d002";
const CANCEL = "0199b000-0000-7000-8000-00000000d003";

const brief = (person: { id: string; login: string; name: string | null }) => ({
  id: person.id,
  login: person.login,
  name: person.name,
});

function view(overrides: {
  readonly state?: string;
  readonly decisionId?: string | null;
  readonly cancelDecisionId?: string | null;
  readonly asked?: readonly { id: string; login: string; name: string | null }[];
  readonly line?: readonly unknown[];
  readonly reason?: string;
  readonly decidedBy?: { id: string; login: string; name: string | null } | null;
  readonly note?: string | null;
  readonly recordedBy?: { id: string; login: string; name: string | null } | null;
}) {
  return {
    id: REQUEST,
    person: brief(MINSU),
    request: {
      type: "annual",
      from: "2026-11-20",
      to: "2026-11-21",
      part: "none",
      days: 2,
      reason: overrides.reason ?? "Family trip",
      state: overrides.state ?? "requested",
      late: false,
      rule: null,
      note: overrides.note ?? null,
      decisionId: overrides.decisionId === undefined ? FIRST : overrides.decisionId,
      cancelDecisionId: overrides.cancelDecisionId ?? null,
      requestedAt: NOW.toISOString(),
      requestedVia: "messenger",
      decidedAt: null,
    },
    recordedBy: overrides.recordedBy ?? null,
    decidedBy: overrides.decidedBy ?? null,
    line: overrides.line ?? [
      { deciders: [brief(JIHYE)], mode: "any", approvedBy: [], state: "waiting" },
      { deciders: [brief(HANA)], mode: "any", approvedBy: [], state: "ahead" },
    ],
    asked: overrides.asked ?? [brief(JIHYE)],
    mine: false,
    decisionPath: `/decisions/${FIRST}`,
    cancelDecisionPath: null,
    cancellable: true,
  };
}

let sequence = 0;
function event(kind: string, requestId = REQUEST): PluginHookEvent {
  sequence += 1;
  return {
    source: "plugin",
    id: `plugin:${sequence}`,
    attempt: 1,
    kind: `plugin:hr:${kind}`,
    at: NOW.toISOString(),
    plugin: "hr",
    project: null,
    data: { requestId, personId: MINSU.id },
  };
}

async function ready(views: Record<string, unknown>, options: { link?: boolean } = {}) {
  const slack = fakeSlack();
  const hr = fakeHr({ views });
  const made = setup({ slack, hr });
  await connected(made.ctx);
  if (options.link !== false) {
    await linked(made.ctx, MINSU, "U0MINSU01", "https://avatars.example.test/minsu.png");
  }
  await linked(made.ctx, JIHYE, "U0JIHYE01");
  return { ...made, hook: made.ctx.as(CONSOLE) };
}

function blocksOf(call: { params: Readonly<Record<string, string>> } | undefined): string {
  return call?.params.blocks ?? "";
}

describe("a request", () => {
  it("opens a conversation of the person and whoever decides, the request in their name, the step asked", async () => {
    const { hook, slack, hr, ctx } = await ready({ [REQUEST]: view({}) });
    await onLeaveEvent(hook, event("leave-requested"));
    expect(hr.calls.find((call) => call.name === "request-view")?.as).toBe(null);
    expect(slack.of("conversations.open")[0]?.params.users).toBe("U0MINSU01,U0JIHYE01");
    const [root, step] = slack.of("chat.postMessage");
    expect(root?.params).toMatchObject({
      channel: "G0CONV1",
      username: "Kim Minsu",
      icon_url: "https://avatars.example.test/minsu.png",
    });
    expect(blocksOf(root)).toContain("휴가 신청");
    expect(blocksOf(root)).toContain("Family trip");
    expect(step?.params.thread_ts).toBe(ctx.all("threads")[0]?.data.rootTs);
    expect(step?.params.username).toBe(undefined);
    expect(blocksOf(step)).toContain("<@U0JIHYE01>");
    expect(blocksOf(step)).toContain(`"value":"${FIRST}"`);
    expect(blocksOf(step)).toContain("https://console.example.test/decisions");
    expect(blocksOf(step)).not.toContain(`/decisions/${FIRST}`);
    expect(ctx.all("deliveries")[0]?.data).toMatchObject({
      outcome: "sent",
      thing: REQUEST,
      note: "thread",
    });
  });

  it("tells an event once, however often it is delivered", async () => {
    const { hook, slack } = await ready({ [REQUEST]: view({}) });
    const once = event("leave-requested");
    await onLeaveEvent(hook, once);
    await onLeaveEvent(hook, { ...once, attempt: 2 });
    expect(slack.of("chat.postMessage")).toHaveLength(2);
  });

  it("posts as the app, naming the person, where their account is not matched", async () => {
    const { hook, slack } = await ready({ [REQUEST]: view({}) }, { link: false });
    await onLeaveEvent(hook, event("leave-requested"));
    expect(slack.of("conversations.open")[0]?.params.users).toBe("U0JIHYE01");
    const root = slack.of("chat.postMessage")[0];
    expect(root?.params.username).toBe(undefined);
    expect(blocksOf(root)).toContain("Kim Minsu 님의 휴가 신청");
  });

  it("never lets what a person wrote ring a channel or link anywhere", async () => {
    const { hook, slack } = await ready({
      [REQUEST]: view({ reason: "<!channel> see <https://evil.example|here> & more" }),
    });
    await onLeaveEvent(hook, event("leave-requested"));
    const blocks = blocksOf(slack.of("chat.postMessage")[0]);
    expect(blocks).not.toContain("<!channel>");
    expect(blocks).toContain("&lt;!channel&gt;");
    expect(blocks).toContain("&amp; more");
  });

  it("says who recorded leave for another, under the owner's name", async () => {
    const { hook, slack } = await ready({ [REQUEST]: view({ recordedBy: brief(JIHYE) }) });
    await onLeaveEvent(hook, event("leave-requested"));
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("Lee Jihye 님이 대신 등록");
  });
});

describe("the steps", () => {
  it("closes a step answered and asks the next, directly where the conversation does not hold them", async () => {
    const views: Record<string, unknown> = { [REQUEST]: view({}) };
    const { hook, slack, ctx } = await ready(views);
    await linked(ctx, HANA, "U0HANA001");
    await onLeaveEvent(hook, event("leave-requested"));
    // HANA is on the line, so the conversation holds her from the start.
    expect(slack.of("conversations.open")[0]?.params.users).toBe("U0MINSU01,U0JIHYE01,U0HANA001");
    views[REQUEST] = view({
      decisionId: SECOND,
      asked: [brief(HANA)],
      line: [
        { deciders: [brief(JIHYE)], mode: "any", approvedBy: [brief(JIHYE)], state: "done" },
        { deciders: [brief(HANA)], mode: "any", approvedBy: [], state: "waiting" },
      ],
    });
    await onLeaveEvent(hook, event("leave-advanced"));
    const closed = slack.of("chat.update")[0];
    expect(blocksOf(closed)).toContain("Lee Jihye 님이 승인");
    const next = slack.of("chat.postMessage").at(-1);
    expect(blocksOf(next)).toContain("<@U0HANA001>");
    expect(blocksOf(next)).toContain(SECOND);
  });

  it("asks a decider outside the conversation in a direct message, with the request beside the buttons", async () => {
    const views: Record<string, unknown> = {
      [REQUEST]: view({
        line: [{ deciders: [brief(JIHYE)], mode: "any", approvedBy: [], state: "waiting" }],
      }),
    };
    const { hook, slack, ctx } = await ready(views);
    await onLeaveEvent(hook, event("leave-requested"));
    await linked(ctx, HANA, "U0HANA001");
    // The console sent the decision on up to HANA, whom the conversation does not hold.
    views[REQUEST] = view({ decisionId: SECOND, asked: [brief(HANA)] });
    await onLeaveEvent(hook, event("leave-advanced"));
    expect(slack.of("conversations.open").at(-1)?.params.users).toBe("U0HANA001");
    const direct = slack.of("chat.postMessage").at(-1);
    expect(direct?.params.channel).toBe("D0CONV2");
    expect(blocksOf(direct)).toContain("Kim Minsu 님의 휴가");
    expect(blocksOf(direct)).toContain(SECOND);
  });
});

describe("the end of a request", () => {
  async function requested() {
    const views: Record<string, unknown> = { [REQUEST]: view({}) };
    const made = await ready(views);
    await made.ctx.records("routes").create({
      kind: "hr:leave-approved",
      channelId: "C0GENERAL",
      channelName: "general",
      language: "en",
      as: "person",
    });
    await onLeaveEvent(made.hook, event("leave-requested"));
    return { ...made, views };
  }

  it("says the approval in the thread and tells the routes' channels, in the person's name", async () => {
    const { hook, slack, views, ctx } = await requested();
    views[REQUEST] = view({ state: "approved", decidedBy: brief(JIHYE), asked: [] });
    await onLeaveEvent(hook, event("leave-approved"));
    expect(blocksOf(slack.of("chat.update")[0])).toContain("Lee Jihye 님이 승인");
    const posts = slack.of("chat.postMessage");
    expect(blocksOf(posts.at(-2))).toContain("승인되었습니다.");
    const channel = posts.at(-1);
    expect(channel?.params).toMatchObject({ channel: "C0GENERAL", username: "Kim Minsu" });
    expect(blocksOf(channel)).toContain("On leave");
    expect(blocksOf(channel)).toContain("Annual leave");
    expect(blocksOf(channel)).not.toContain("Family trip");
    expect(ctx.all("threads")[0]?.data.posts).toHaveLength(1);
  });

  it("tells the channels of leave approved as it was written, with no thread before it", async () => {
    const { hook, slack, ctx } = await ready({ [REQUEST]: view({ state: "approved", asked: [] }) });
    await ctx.records("routes").create({
      kind: "hr:leave-approved",
      channelId: "C0GENERAL",
      channelName: "general",
      language: "ko",
      as: "app",
    });
    await onLeaveEvent(hook, event("leave-approved"));
    expect(slack.of("conversations.open")).toHaveLength(0);
    const channel = slack.of("chat.postMessage")[0];
    expect(channel?.params.username).toBe(undefined);
    expect(blocksOf(channel)).toContain("Kim Minsu 님 휴가");
  });

  it("says a rejection with its note, and a request sent back", async () => {
    const { hook, slack, views } = await requested();
    views[REQUEST] = view({
      state: "rejected",
      decidedBy: brief(JIHYE),
      note: "Busy week",
      asked: [],
    });
    await onLeaveEvent(hook, event("leave-rejected"));
    expect(blocksOf(slack.of("chat.update")[0])).toContain("Lee Jihye 님이 반려");
    expect(blocksOf(slack.of("chat.postMessage").at(-1))).toContain("Busy week");
  });

  it("asks the cancellation of approved leave, and strikes it through once cancelled", async () => {
    const { hook, slack, views } = await requested();
    views[REQUEST] = view({ state: "approved", decidedBy: brief(JIHYE), asked: [] });
    await onLeaveEvent(hook, event("leave-approved"));
    views[REQUEST] = view({
      state: "cancelling",
      decidedBy: brief(JIHYE),
      cancelDecisionId: CANCEL,
      asked: [brief(JIHYE)],
    });
    await onLeaveEvent(hook, event("leave-cancelling"));
    expect(blocksOf(slack.of("chat.postMessage").at(-1))).toContain(CANCEL);
    views[REQUEST] = view({
      state: "cancelled",
      decidedBy: brief(JIHYE),
      cancelDecisionId: CANCEL,
      asked: [],
    });
    await onLeaveEvent(hook, event("leave-cancelled"));
    const updates = slack.of("chat.update").map(blocksOf);
    expect(updates.some((blocks) => blocks.includes("~*휴가 신청*~"))).toBe(true);
    expect(updates.some((blocks) => blocks.includes("~On leave"))).toBe(true);
  });

  it("says the leave stands when its cancellation is rejected", async () => {
    const { hook, slack, views } = await requested();
    views[REQUEST] = view({ state: "cancelling", cancelDecisionId: CANCEL });
    await onLeaveEvent(hook, event("leave-cancelling"));
    views[REQUEST] = view({ state: "approved", cancelDecisionId: CANCEL, asked: [] });
    await onLeaveEvent(hook, event("leave-kept"));
    expect(blocksOf(slack.of("chat.postMessage").at(-1))).toContain("휴가가 유지됩니다");
  });
});

describe("what stands in the way", () => {
  it("passes over an event while Slack is not connected, or HR's api is off", async () => {
    const unconnected = setup({ hr: fakeHr({ views: { [REQUEST]: view({}) } }) });
    await onLeaveEvent(unconnected.ctx.as(CONSOLE), event("leave-requested"));
    expect(unconnected.ctx.all("deliveries")[0]?.data).toMatchObject({
      outcome: "skipped",
      note: "not_connected",
    });
    const off = setup({ capabilities: ["people:read"] });
    await connected(off.ctx);
    await onLeaveEvent(off.ctx.as(CONSOLE), event("leave-requested"));
    expect(off.ctx.all("deliveries")[0]?.data.note).toBe("no_capability");
    expect(off.slack.calls).toHaveLength(0);
  });

  it("says the role HR was not asked to grant is missing", async () => {
    const { ctx, slack } = setup({ grants: [], hr: fakeHr({ views: {} }) });
    await connected(ctx);
    await onLeaveEvent(ctx.as(CONSOLE), event("leave-requested"));
    expect(ctx.all("deliveries")[0]?.data.note).toBe("no_grant");
    expect(slack.calls).toHaveLength(0);
  });

  it("leaves a version of HR it was not written for alone", async () => {
    const { ctx } = setup({ hr: fakeHr({ version: "0.4.0", views: { [REQUEST]: view({}) } }) });
    await connected(ctx);
    await onLeaveEvent(ctx.as(CONSOLE), event("leave-requested"));
    expect(ctx.all("deliveries")[0]?.data.note).toBe("outside:0.4.0");
  });

  it("hands Slack's wait to the console and keeps the failure for the page", async () => {
    const slack = fakeSlack({
      "conversations.open": () => ({ status: 429, headers: { "retry-after": "7" }, body: {} }),
    });
    const made = setup({ slack, hr: fakeHr({ views: { [REQUEST]: view({}) } }) });
    await connected(made.ctx);
    await linked(made.ctx, MINSU, "U0MINSU01");
    await expect(
      onLeaveEvent(made.ctx.as(CONSOLE), event("leave-requested")),
    ).rejects.toMatchObject({
      code: "rate_limited",
      data: { retryAfterMs: 7000 },
    });
    const lines = (await activity.run(made.ctx, { outcome: "failed" })) as ActivityRow[];
    expect(lines).toHaveLength(1);
    expect(lines[0]?.note).toBe("rate_limited");
  });
});
