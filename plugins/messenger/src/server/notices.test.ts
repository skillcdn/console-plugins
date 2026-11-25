// What the console told a member of, sent on to them in Slack (ADR-0017): each of the console's
// events sent to whom the console told of it and to nobody else, never to whom it woke itself, as
// each chose here, in their language and in a workspace they have an account in, the project's
// first; once a day where they chose so; turned off from the message itself; and the choice made
// on the page and through their agent with `notify` and `notices`.
import { NOTIFICATION_KINDS } from "@skillcdn/console/api";
import { defineCollection, type PluginHookEvent, z } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import {
  type ActivityRow,
  NOTICE_CHOICES,
  NOTICE_GROUPS,
  NOTICE_KINDS,
  type NoticesView,
  type ProjectNoticesView,
} from "../shared/contracts.js";
import {
  activity,
  day,
  deliveries,
  dueDay,
  notices,
  notify,
  onOwnWork,
  projectNotices,
  slackEndpoint,
  toVersion4,
  unheard,
} from "./index.js";
import {
  CONSOLE,
  connected,
  type FakePerson,
  fakeSlack,
  HANA,
  JIHYE,
  KEEPER,
  linked,
  MEMBER_MINSU,
  MINSU,
  NOW,
  STRANGER,
  setup,
  signedRequest,
  TEAM,
} from "./test-fakes.js";

const OTHER = { id: "T0OTHER01", name: "Other" };
const PROJECT = { id: "0199d000-0000-7000-8000-0000000000p1", key: "WEB" };
const DECISION = "0199b000-0000-7000-8000-00000000d009";
const brief = (person: { id: string; login: string; name: string | null }) => ({
  id: person.id,
  login: person.login,
  name: person.name,
});

/** Task 12 of WEB: Jihye owns it, Minsu works on it. */
function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "0199e000-0000-7000-8000-000000000012",
    number: 12,
    title: "Ship the <!channel> page",
    body: "",
    state: "in_progress",
    owner: brief(JIHYE),
    workers: [brief(MINSU)],
    ...overrides,
  };
}

/** One member the console told of an event, as it hands them over in `data.told`. */
const told = (
  person: { readonly id: string },
  kind: string,
  more: { readonly woken?: boolean; readonly followed?: boolean } = {},
) => ({
  personId: person.id,
  kind,
  woken: more.woken ?? false,
  followed: more.followed ?? false,
});
type Told = ReturnType<typeof told>;

let sequence = 0;
/** An event of the console's, with whom the console told of it: nobody unless said. */
function event(
  kind: string,
  data: Record<string, unknown>,
  whom: readonly Told[] = [],
): PluginHookEvent {
  sequence += 1;
  return {
    source: "console",
    id: `console:${1000 + sequence}`,
    attempt: 1,
    kind: `console:${kind}`,
    at: NOW.toISOString(),
    plugin: null,
    project: kind.startsWith("agent.") ? null : PROJECT,
    data: { actor: brief(HANA), agent: null, told: whom, ...data },
  };
}

async function ready(
  options: {
    readonly task?: Record<string, unknown>;
    /** What each task is, by its number, where a test tells of several. */
    readonly tasks?: (number: number) => Record<string, unknown>;
    /** What the decision is beside its deciders: the plugin that raised it, say. */
    readonly decision?: Record<string, unknown>;
    readonly now?: () => Date;
    readonly slack?: ReturnType<typeof fakeSlack>;
    /** What the console answers of the caller's own settings; refused unless given. */
    readonly settings?: NonNullable<Parameters<typeof setup>[0]>["settings"];
    readonly people?: readonly FakePerson[];
  } = {},
) {
  const slack = options.slack ?? fakeSlack();
  const made = setup({
    slack,
    caller: MEMBER_MINSU,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.settings === undefined ? {} : { settings: options.settings }),
    people: options.people ?? [
      MINSU,
      JIHYE,
      { ...HANA, managerId: null },
      {
        ...HANA,
        id: "0199a000-0000-7000-8000-0000000000a9",
        login: "bot-runner",
        name: "Runner",
        managerId: MINSU.id,
      },
    ],
    board: {
      tasks: {
        get: async (_project: string, number: number) =>
          task(options.tasks === undefined ? options.task : { number, ...options.tasks(number) }),
      },
      decisions: {
        get: async () => ({
          id: DECISION,
          decider: brief(MINSU),
          deciders: [brief(MINSU), brief(JIHYE)],
          plugin: null,
          ...options.decision,
        }),
      },
      projects: { list: async () => [{ id: PROJECT.id, key: PROJECT.key, name: "Web" }] },
    },
  });
  await connected(made.ctx);
  await linked(made.ctx, MINSU, "U0MINSU01");
  await linked(made.ctx, JIHYE, "U0JIHYE01");
  return { ...made, hook: made.ctx.as(CONSOLE) };
}

/** Whom the direct messages went to, by the account opened. */
const toWhom = (slack: ReturnType<typeof fakeSlack>) =>
  slack.of("conversations.open").map((call) => call.params.users);
const blocksOf = (call: { params: Readonly<Record<string, string>> } | undefined) =>
  call?.params.blocks ?? "";

const BOTH = [told(JIHYE, "assigned"), told(MINSU, "assigned")];

describe("a task's events", () => {
  it("sends an event on to whom the console told of it, in their language, with its address and a button that turns the kind off", async () => {
    const { hook, slack, ctx } = await ready();
    await onOwnWork(
      hook,
      event("task.created", { taskId: task().id, number: 12, title: "x" }, BOTH),
    );
    expect(toWhom(slack).sort()).toEqual(["U0JIHYE01", "U0MINSU01"]);
    const toMinsu =
      slack.of("chat.postMessage")[
        slack.of("conversations.open").findIndex((call) => call.params.users === "U0MINSU01")
      ];
    const blocks = blocksOf(toMinsu);
    // What happened stands first, then who did it; the thing's name is the link to it.
    expect(blocks).toContain("*새로 맡은 작업* · Park Hana");
    expect(blocks).toContain(
      "<https://console.example.test/projects/WEB/tasks/12|WEB-12 Ship the &lt;!channel&gt; page>",
    );
    expect(blocks).toContain("notice-off");
    // What a person wrote is never Slack's markup.
    expect(blocks).not.toContain("<!channel>");
    // Where blocks are not read, the same in one sentence, what happened first.
    expect(toMinsu?.params.text).toBe(
      "새로 맡은 작업 · Park Hana: WEB-12 Ship the &lt;!channel&gt; page",
    );
    expect(toMinsu?.secrets[0]).toEqual({ name: "slackBotToken", key: TEAM, as: "bearer" });
    expect(ctx.all("deliveries")[0]?.data).toMatchObject({ outcome: "sent", note: "told:2" });
  });

  it("sends to nobody the console did not tell, nor to whom it woke itself", async () => {
    const { hook, slack, ctx } = await ready();
    // Jihye owns the task and Minsu works on it: the console told neither, so neither is sent it.
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }, []));
    expect(slack.calls).toHaveLength(0);
    // An agent account learned of it by the console's own wake.
    await onOwnWork(
      hook,
      event("task.commented", { number: 12, excerpt: "Hi" }, [
        told(MINSU, "commented", { woken: true }),
      ]),
    );
    // A console that hands the plugin no list tells nobody through it.
    await onOwnWork(hook, {
      ...event("task.commented", { number: 12, excerpt: "Hi" }),
      data: { actor: brief(HANA), agent: null, number: 12, excerpt: "Hi" },
    });
    expect(slack.calls).toHaveLength(0);
    // Nothing was sent, and nothing is kept of what happened on the board.
    expect(ctx.all("deliveries")).toHaveLength(0);
  });

  it("reads whom the console told as data: what is no list, no entry or no kind tells nobody", async () => {
    const { hook, slack } = await ready();
    const hostile: unknown[] = [
      "everyone",
      { personId: MINSU.id, kind: "commented", woken: false },
      [null, 5, "x", { personId: MINSU.id }],
      [{ personId: MINSU.id, kind: "commented" }],
      [{ personId: { $ne: "" }, kind: "commented", woken: false }],
      [{ personId: "x".repeat(5000), kind: "commented", woken: false }],
      [{ personId: MINSU.id, kind: "everything", woken: false }],
      [{ personId: MINSU.id, kind: "commented", woken: "no" }],
      // A kind that is none of a task's says nothing of a task.
      [{ personId: MINSU.id, kind: "answered", woken: false }],
    ];
    for (const whom of hostile) {
      await onOwnWork(hook, {
        ...event("task.commented", {}),
        data: { actor: brief(HANA), agent: null, number: 12, excerpt: "Hi", told: whom },
      });
    }
    // A list longer than any console makes is read to its first hundred.
    const many = Array.from({ length: 5000 }, (_, index) =>
      told({ id: `0199f000-0000-7000-8000-${String(index).padStart(12, "0")}` }, "commented"),
    );
    await onOwnWork(
      hook,
      event("task.commented", { number: 12, excerpt: "Hi" }, [...many, told(MINSU, "commented")]),
    );
    expect(slack.calls).toHaveLength(0);
  });

  it("sends each event once, however often it is delivered", async () => {
    const { hook, slack } = await ready();
    const once = event(
      "task.moved",
      { taskId: task().id, number: 12, from: "ready", to: "in_review" },
      [told(JIHYE, "moved")],
    );
    await onOwnWork(hook, once);
    await onOwnWork(hook, { ...once, attempt: 2 });
    expect(toWhom(slack)).toEqual(["U0JIHYE01"]);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("*Ready → In review* · Park Hana");
  });

  it("says a comment's words under the thing, and a move the console made as nobody's", async () => {
    const { hook, slack } = await ready();
    await onOwnWork(
      hook,
      event(
        "task.commented",
        {
          taskId: task().id,
          number: 12,
          excerpt: `Looks > good & <@U0EVERYONE> ${"long ".repeat(80)}`,
        },
        [told(JIHYE, "commented")],
      ),
    );
    const comment = blocksOf(slack.of("chat.postMessage")[0]);
    expect(comment).toContain("*New comment* · Park Hana");
    expect(comment).toContain("\\n> Looks &gt; good &amp; &lt;@U0EVERYONE&gt; long");
    expect(comment).not.toContain("<@U0EVERYONE>");
    // A run the console gave up on is moved by nobody: no name, and a state it has no word for as it is.
    await onOwnWork(hook, {
      ...event("task.moved", {}),
      data: {
        actor: null,
        agent: null,
        taskId: task().id,
        number: 12,
        to: "on_hold",
        told: [told(JIHYE, "moved")],
      },
    });
    const moved = blocksOf(slack.of("chat.postMessage").at(-1));
    expect(moved).toContain("*→ on_hold*\\n");
  });

  it("says what each was told under: a task given, one ready to begin, and what changed of one", async () => {
    const { hook, slack } = await ready();
    const said = () => slack.of("chat.postMessage").map((call) => blocksOf(call));
    await onOwnWork(
      hook,
      event(
        "task.updated",
        {
          taskId: task().id,
          number: 12,
          fields: ["title", "workers", "estimate"],
          workersAdded: [JIHYE.id],
        },
        [told(JIHYE, "assigned"), told(MINSU, "changed")],
      ),
    );
    // Each field by its name, and one the words do not name left out.
    expect(said().some((blocks) => blocks.includes("*제목, 작업자 변경* · Park Hana"))).toBe(true);
    expect(said().some((blocks) => blocks.includes("*Given to you* · Park Hana"))).toBe(true);
    expect(toWhom(slack).sort()).toEqual(["U0JIHYE01", "U0MINSU01"]);
    // One event is a move to its owner and work to begin to whoever is at work on it.
    await onOwnWork(
      hook,
      event("task.moved", { number: 12, from: "idea", to: "ready" }, [
        told(MINSU, "ready"),
        told(JIHYE, "moved"),
      ]),
    );
    expect(said().some((blocks) => blocks.includes("*시작할 수 있는 작업* · Park Hana"))).toBe(
      true,
    );
    expect(said().some((blocks) => blocks.includes("*Idea → Ready* · Park Hana"))).toBe(true);
    // A change of nothing the words name is still a change.
    await onOwnWork(
      hook,
      event("task.updated", { number: 12, fields: ["estimate"] }, [told(MINSU, "changed")]),
    );
    expect(said().at(-1)).toContain("*내용 변경* · Park Hana");
  });

  it("keeps out of Slack a kind turned off here, sends a task its member turned on whatever their kinds, and lets that be turned off too", async () => {
    const { hook, slack, ctx } = await ready();
    const comment = (whom: readonly Told[]) =>
      onOwnWork(hook, event("task.commented", { number: 12, excerpt: "Hi" }, whom));
    await notify.run(ctx, { off: ["commented"] });
    await comment([told(MINSU, "commented")]);
    expect(slack.calls).toHaveLength(0);
    // The task's bell, turned on in the console: everything on it is sent, the kind off or not.
    await comment([told(MINSU, "commented", { followed: true })]);
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
    // Its button turns off the tasks turned on, which is what let it through, and not the kind.
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain('"value":"followed"');
    await notify.run(ctx, { off: ["followed"], on: ["commented"] });
    await comment([told(MINSU, "commented", { followed: true })]);
    expect(toWhom(slack)).toHaveLength(1);
    await comment([told(MINSU, "commented")]);
    expect(toWhom(slack)).toHaveLength(2);
    expect(blocksOf(slack.of("chat.postMessage")[1])).toContain('"value":"commented"');
  });

  it("tells in the workspace the project is told in where the person has an account there", async () => {
    const { hook, slack, ctx } = await ready();
    await connected(ctx, "ko", OTHER);
    await linked(ctx, MINSU, "U0MINSU02", null, OTHER.id);
    const record = ctx.all("connections").find((found) => found.data.teamId === OTHER.id);
    await ctx.records("connections").update(record?.id ?? "", { projects: [PROJECT.id] });
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }, BOTH));
    const opened = slack
      .of("conversations.open")
      .map((call) => [call.params.users, call.secrets[0]?.key]);
    // Minsu in the project's workspace; Jihye, who has no account there, in the default.
    expect(opened.sort()).toEqual(
      [
        ["U0JIHYE01", TEAM],
        ["U0MINSU02", OTHER.id],
      ].sort(),
    );
  });

  it("tells nobody where Slack is not connected, nor someone with no account", async () => {
    const quiet = setup({ caller: MEMBER_MINSU, board: { tasks: { get: async () => task() } } });
    await onOwnWork(
      quiet.ctx.as(CONSOLE),
      event("task.created", { taskId: task().id, number: 12 }, BOTH),
    );
    expect(quiet.ctx.all("deliveries")[0]?.data).toMatchObject({
      outcome: "skipped",
      note: "not_connected",
    });
    const { hook, slack, ctx } = await ready();
    // The console told Hana, who has no account in Slack.
    await onOwnWork(
      hook,
      event("task.commented", { taskId: task().id, number: 12, excerpt: "Hi" }, [
        told(HANA, "commented"),
      ]),
    );
    expect(slack.calls).toHaveLength(0);
    expect(ctx.all("deliveries")[0]?.data).toMatchObject({ outcome: "skipped", note: "unreached" });
    // Neither where it is not connected is anything kept of an event that was for nobody.
    await onOwnWork(
      quiet.ctx.as(CONSOLE),
      event("task.moved", { taskId: task().id, number: 12, from: "ready", to: "done" }),
    );
    expect(quiet.ctx.all("deliveries")).toHaveLength(1);
  });

  it("keeps whom a message reached only while it has others to reach", async () => {
    const { hook, ctx } = await ready();
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }, BOTH));
    const line = ctx.all("deliveries")[0]?.data;
    expect(line).toMatchObject({ outcome: "sent", note: "told:2" });
    // Whom it reached is theirs: a line says how many.
    expect(JSON.stringify(line)).not.toContain(MINSU.id);
    expect(JSON.stringify(line)).not.toContain(JIHYE.id);
  });
});

describe("the log of what was sent", () => {
  it("says when, what kind, how it went and why, and never whose it was or what it was about", async () => {
    const { hook, ctx } = await ready();
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }, BOTH));
    await onOwnWork(
      hook,
      event("task.commented", { taskId: task().id, number: 12, excerpt: "Hi" }, [
        told(HANA, "commented"),
      ]),
    );
    const lines = (await activity.run(ctx.as(KEEPER), {})) as ActivityRow[];
    expect(lines.map((line) => line.note).sort()).toEqual(["told:2", "unreached"]);
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(["at", "attempt", "id", "kind", "note", "outcome"]);
    }
    const said = JSON.stringify(lines);
    for (const word of [task().id, PROJECT.id, PROJECT.key, MINSU.id, JIHYE.id, HANA.id, "Ship"]) {
      expect(said).not.toContain(word);
    }
  });

  it("lists nothing of an event that was for nobody, one kept by an earlier version among them", async () => {
    const { hook, ctx } = await ready();
    // An account the console told nobody of: a line keeps the event from being followed twice.
    await onOwnWork(hook, event("agent.state_changed", { login: "acme-otis", state: "idle" }));
    const old = (note: string, at: string, kind = "console:task.moved") => ({
      eventId: `${kind}${at}`,
      kind,
      thing: task().id,
      outcome: "skipped" as const,
      note,
      attempt: 1,
      at,
    });
    for (let minute = 0; minute < 60; minute += 1) {
      const at = `2026-11-20T09:${String(minute).padStart(2, "0")}:00.000Z`;
      await ctx.records(deliveries).create(old("nobody", at));
    }
    await ctx.records(deliveries).create(old("not_connected", "2026-11-19T09:00:00.000Z"));
    await ctx
      .records(deliveries)
      .create(old("nobody", "2026-11-18T09:00:00.000Z", "plugin:hr:leave-requested"));
    const lines = (await activity.run(ctx.as(KEEPER), { limit: 5 })) as ActivityRow[];
    // What stands behind sixty of them is reached, and a request of leave nobody has in Slack is told.
    expect(lines.map((line) => [line.kind, line.note])).toEqual([
      ["console:task.moved", "not_connected"],
      ["plugin:hr:leave-requested", "nobody"],
    ]);
    expect((await activity.run(ctx.as(KEEPER), { limit: 1 })) as ActivityRow[]).toHaveLength(1);
  });
});

describe("decisions and agent accounts", () => {
  it("sends a decision to whom the console told of it, with its own address, and leaves HR's to their thread", async () => {
    const { hook, slack } = await ready();
    await onOwnWork(
      hook,
      event("decision.raised", { decisionId: DECISION, question: "Ship it?" }, [
        told(MINSU, "decision"),
        told(JIHYE, "decision"),
      ]),
    );
    expect(toWhom(slack).sort()).toEqual(["U0JIHYE01", "U0MINSU01"]);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain(`/decisions/${DECISION}`);
    await onOwnWork(
      hook,
      event(
        "decision.addressed",
        { decisionId: DECISION, question: "Ship it?", decidersAdded: [JIHYE.id] },
        [told(JIHYE, "decision")],
      ),
    );
    expect(toWhom(slack).at(-1)).toBe("U0JIHYE01");
    // HR's own decisions are asked in the request's thread, never told here besides.
    const before = toWhom(slack).length;
    await onOwnWork(hook, {
      ...event("decision.raised", { decisionId: DECISION, question: "Leave?" }, [
        told(MINSU, "decision"),
      ]),
      plugin: "hr",
    });
    expect(toWhom(slack)).toHaveLength(before);
  });

  it("reads a decision an agent account raised for its manager as the decision it is, under their agent accounts", async () => {
    const { hook, slack, ctx } = await ready();
    // The manager has decisions off in the console, which tells them of it as of their agent account.
    const raised = () =>
      onOwnWork(
        hook,
        event("decision.raised", { decisionId: DECISION, question: "Spend it?" }, [
          told(MINSU, "agent"),
        ]),
      );
    await raised();
    const blocks = blocksOf(slack.of("chat.postMessage")[0]);
    expect(blocks).toContain("*내 답을 기다리는 결정* · Park Hana");
    expect(blocks).toContain(`/decisions/${DECISION}|Spend it?>`);
    // The button turns off what let it through: their agent accounts.
    expect(blocks).toContain('"value":"agent"');
    await notify.run(ctx, { off: ["agent"] });
    await raised();
    expect(toWhom(slack)).toHaveLength(1);
  });

  it("sends the answer to a decision to whoever raised it, the option quoted, and leaves HR's to its thread", async () => {
    const answered = [told(MINSU, "answered")];
    const answer = { decisionId: DECISION, question: "Ship it?", option: "Yes, <!here> ship" };
    const { hook, slack } = await ready();
    await onOwnWork(hook, event("decision.answered", answer, answered));
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
    const blocks = blocksOf(slack.of("chat.postMessage")[0]);
    expect(blocks).toContain("*내 질문에 답변* · Park Hana");
    expect(blocks).toContain(`/decisions/${DECISION}|Ship it?>`);
    expect(blocks).toContain("\\n> Yes, &lt;!here&gt; ship");
    // A kind that is none of an answer's says nothing of one.
    await onOwnWork(hook, event("decision.answered", answer, [told(JIHYE, "decision")]));
    expect(toWhom(slack)).toHaveLength(1);
    // An answer names whoever carried it, so the decision is read for the plugin that raised it.
    const ofHr = await ready({ decision: { plugin: "hr" } });
    await onOwnWork(ofHr.hook, event("decision.answered", answer, answered));
    expect(ofHr.slack.calls).toHaveLength(0);
  });

  it("sends a manager that their agent account stopped, and ran again, and nothing of a run that goes on", async () => {
    const { hook, slack } = await ready();
    const manager = [told(MINSU, "agent")];
    await onOwnWork(
      hook,
      event(
        "agent.state_changed",
        {
          login: "bot-runner",
          handle: "runner",
          state: "failed",
          was: "running",
          detail: "out of credit",
        },
        manager,
      ),
    );
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("runner");
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("out of credit");
    await onOwnWork(
      hook,
      event(
        "agent.state_changed",
        { login: "bot-runner", state: "running", was: "failed" },
        manager,
      ),
    );
    await onOwnWork(
      hook,
      event(
        "agent.state_changed",
        { login: "bot-runner", state: "running", was: "unheard" },
        manager,
      ),
    );
    expect(toWhom(slack)).toHaveLength(2);
    // The account reports to Minsu, and the console told nobody: they have the kind off there.
    const stopped = { login: "bot-runner", state: "stopped", was: "running" };
    await onOwnWork(hook, event("agent.state_changed", stopped));
    // A manager that is an agent account itself was woken by the console.
    await onOwnWork(
      hook,
      event("agent.state_changed", stopped, [told(MINSU, "agent", { woken: true })]),
    );
    expect(toWhom(slack)).toHaveLength(2);
  });
});

const MINUTE = 60_000;
/** Whom the console tells of the runner: Minsu, whom it reports to. */
const MANAGER = [told(MINSU, "agent")];

/** A clock a test moves, the runner's state said at its time, and the job run at it. */
async function watched(options: { readonly slack?: ReturnType<typeof fakeSlack> } = {}) {
  let at = NOW;
  const made = await ready({ now: () => at, ...options });
  const kept = (collection: string) => () =>
    made.ctx.all(collection).filter((record) => record.archivedAt === null);
  return {
    ...made,
    after: (minutes: number) => {
      at = new Date(at.getTime() + minutes * MINUTE);
    },
    /** A moment so many minutes on, as the console writes one. */
    moment: (minutes: number) => new Date(at.getTime() + minutes * MINUTE).toISOString(),
    stands: (
      state: string,
      was: string,
      more: Record<string, unknown> = {},
      whom: readonly Told[] = MANAGER,
    ) =>
      onOwnWork(made.hook, {
        ...event("agent.state_changed", { login: "bot-runner", state, was, ...more }, whom),
        at: at.toISOString(),
      }),
    look: () => unheard.run(made.hook),
    silences: kept("silences"),
    limits: kept("limits"),
  };
}

describe("an agent account unheard", () => {
  it("tells the manager once after half an hour, with what to look at, and once when it is back for ten minutes", async () => {
    const { slack, after, stands, look, silences } = await watched();
    await stands("unheard", "running");
    await look();
    after(29);
    await look();
    expect(toWhom(slack)).toEqual([]);
    after(1);
    await look();
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
    const told = blocksOf(slack.of("chat.postMessage")[0]);
    expect(told).toContain("에이전트 계정이 30분 넘게 응답이 없습니다");
    expect(told).toContain("Runner");
    expect(told).toContain("머신이 켜져 있고 깨어 있는지");
    // Once: the hours it stays silent say nothing more.
    after(600);
    await look();
    expect(toWhom(slack)).toHaveLength(1);
    await stands("running", "unheard");
    after(9);
    await look();
    expect(toWhom(slack)).toHaveLength(1);
    after(1);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    const back = blocksOf(slack.of("chat.postMessage")[1]);
    expect(back).toContain("에이전트 계정이 다시 돌아갑니다");
    expect(back).not.toContain("머신이");
    expect(silences()).toEqual([]);
    after(600);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
  });

  it("says nothing of an account that blinks, before its manager was told or after", async () => {
    const { slack, after, stands, look, silences } = await watched();
    // Gone for twenty minutes and back: nobody is told, and the next silence counts anew.
    await stands("unheard", "running");
    after(20);
    await stands("running", "unheard");
    expect(silences()).toEqual([]);
    after(5);
    await stands("unheard", "running");
    after(20);
    await look();
    expect(toWhom(slack)).toEqual([]);
    after(10);
    await look();
    expect(toWhom(slack)).toHaveLength(1);
    // Asleep, its machine wakes for a few minutes each hour: the manager hears nothing of it.
    for (let hour = 0; hour < 3; hour += 1) {
      after(55);
      await stands("running", "unheard");
      await look();
      after(5);
      await stands("unheard", "running");
      await look();
    }
    expect(toWhom(slack)).toHaveLength(1);
    expect(silences()).toHaveLength(1);
  });

  it("leaves an account that stopped or failed meanwhile to that message, and a repeated delivery changes nothing", async () => {
    const { slack, ctx, after, stands, look, silences } = await watched();
    await stands("unheard", "running");
    const kept = silences()[0]?.data;
    after(3);
    await onOwnWork(ctx.as(CONSOLE), {
      ...event("agent.state_changed", { login: "bot-runner", state: "unheard", was: "running" }),
      attempt: 2,
    });
    expect(silences().map((record) => record.data)).toEqual([kept]);
    after(40);
    await look();
    await stands("failed", "unheard");
    expect(toWhom(slack)).toHaveLength(2);
    expect(silences()).toEqual([]);
    after(60);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    // An account nobody knows, and a state that is no text, keep nothing.
    await onOwnWork(
      ctx.as(CONSOLE),
      event("agent.state_changed", { login: "x".repeat(5000), state: "unheard", was: null }),
    );
    await onOwnWork(
      ctx.as(CONSOLE),
      event("agent.state_changed", { login: "bot-runner", state: { $ne: "" }, was: [] }),
    );
    expect(silences()).toEqual([]);
  });

  it("tells as the manager chose: in the day's message, or nothing of a kind turned off", async () => {
    const { slack, ctx, after, stands, look, silences } = await watched();
    await notify.run(ctx, { cadence: "daily", at: "23:00" });
    await stands("unheard", "running");
    after(30);
    await look();
    expect(toWhom(slack)).toEqual([]);
    expect(ctx.all("waiting").map((record) => record.data)).toMatchObject([
      { personId: MINSU.id, kind: "agent", what: { title: "Runner", to: "unheard" } },
    ]);
    expect(String(ctx.all("waiting")[0]?.data.text)).toContain("머신이 켜져 있고");
    await notify.run(ctx, { cadence: "now", off: ["agent"] });
    await stands("running", "unheard");
    after(10);
    await look();
    expect(silences()).toEqual([]);
    expect(ctx.all("waiting")).toHaveLength(1);
    await stands("unheard", "running");
    after(30);
    await look();
    // Counted as told, so that turning the kind on again brings nothing old.
    expect(silences()[0]?.data.toldAt).not.toBeNull();
    expect(slack.of("chat.postMessage")).toHaveLength(0);
  });

  it("tries again at the next run what Slack did not take, and follows an account while Slack is not connected", async () => {
    let fail = true;
    const slack = fakeSlack({
      "conversations.open": (params) =>
        fail
          ? { ok: false, error: "fatal_error" }
          : { ok: true, channel: { id: `D0${params.users}` } },
    });
    const { ctx, after, stands, look, silences } = await watched({ slack });
    await stands("unheard", "running");
    after(30);
    await look();
    expect(slack.of("chat.postMessage")).toHaveLength(0);
    expect(silences()[0]?.data.toldAt).toBeNull();
    fail = false;
    after(5);
    await look();
    expect(slack.of("chat.postMessage")).toHaveLength(1);
    // The workspace taken away: nothing is sent, and the account coming back is still followed.
    for (const connection of ctx.all("connections")) {
      await ctx.as(CONSOLE).records("connections").update(connection.id, { state: "removed" });
    }
    await stands("running", "unheard");
    expect(silences()[0]?.data.backAt).not.toBeNull();
    after(10);
    await look();
    expect(slack.of("chat.postMessage")).toHaveLength(1);
    expect(silences()).toHaveLength(1);
  });

  it("tells whom the console told when the silence began and when it ended, and nobody where it told nobody", async () => {
    const { slack, ctx, after, stands, look, silences } = await watched();
    // The console told Jihye of the silence, and Minsu, whom the account reports to since, of its end.
    await stands("unheard", "running", {}, [told(JIHYE, "agent")]);
    expect(silences()[0]?.data.tell).toEqual([JIHYE.id]);
    after(30);
    await look();
    expect(toWhom(slack)).toEqual(["U0JIHYE01"]);
    await stands("running", "unheard");
    after(10);
    await look();
    expect(toWhom(slack)).toEqual(["U0JIHYE01", "U0MINSU01"]);
    expect(silences()).toEqual([]);
    // Nobody told, their manager having the kind off in the console or being an agent account
    // the console woke: counted as told, and nothing sent.
    await stands("unheard", "running", {}, [told(MINSU, "agent", { woken: true })]);
    after(30);
    await look();
    expect(silences()[0]?.data).toMatchObject({ tell: [] });
    expect(silences()[0]?.data.toldAt).not.toBeNull();
    await stands("running", "unheard", {}, []);
    after(10);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    expect(silences()).toEqual([]);
    // An account that left since is put away when its silence comes due, and nobody told.
    await ctx
      .as(CONSOLE)
      .records("silences")
      .create({
        personId: "0199a000-0000-7000-8000-0000000000ff",
        since: NOW.toISOString(),
        toldAt: null,
        backAt: null,
        tell: [MINSU.id],
      });
    after(600);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    expect(silences()).toEqual([]);
  });
});

describe("an agent account stopped by its usage limit", () => {
  /** What the console says of an account its product's usage limit stopped, with the moment it resets where one is named. */
  const limit = (until?: unknown) => ({
    detail: "usage_limit",
    ...(until === undefined ? {} : { until }),
  });
  const RESETS = "한도가 풀리면 스스로 돌아옵니다:";
  const UNKNOWN = "한도가 언제 풀리는지 제품이 알려 주지 않았습니다";
  const BACK = "에이전트 계정이 다시 돌아갑니다";

  it("tells the manager once, with when the limit resets, and once when the account has run again for ten minutes", async () => {
    const { slack, after, moment, stands, look, limits } = await watched();
    // 01:00 UTC is 10:00 in Seoul: the limit resets five hours on, at 15:00 there.
    const until = moment(300);
    await stands("failed", "running", { handle: "runner", ...limit(until) });
    expect(toWhom(slack)).toEqual(["U0MINSU01"]);
    const told = slack.of("chat.postMessage")[0];
    expect(blocksOf(told)).toContain("에이전트 계정이 사용량 한도에 닿아 멈췄습니다");
    expect(blocksOf(told)).toContain("runner");
    // The moment is Slack's to write, to each reader in their own zone; the workspace's clock where it does not.
    expect(blocksOf(told)).toContain(
      `${RESETS} <!date^${Date.parse(until) / 1000}^{date_short_pretty} {time}|2026-11-09 15:00 (Asia/Seoul)>`,
    );
    // The console's word for why is said in the person's words, never quoted.
    expect(blocksOf(told)).not.toContain("usage_limit");
    // A notification reads no markup: the clock, and the zone it is of.
    expect(told?.params.text).toContain(`${RESETS} 2026-11-09 15:00 (Asia/Seoul)`);
    expect(told?.params.text).not.toContain("date^");
    expect(limits().map((record) => record.data)).toMatchObject([{ until, backAt: null }]);
    // Once: the hours the limit stands say nothing more.
    after(299);
    await look();
    expect(toWhom(slack)).toHaveLength(1);
    after(2);
    await stands("running", "failed", { detail: "resumed" });
    after(9);
    await look();
    expect(toWhom(slack)).toHaveLength(1);
    after(1);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    const back = blocksOf(slack.of("chat.postMessage")[1]);
    expect(back).toContain(BACK);
    expect(back).toContain("Runner");
    expect(back).not.toContain("한도");
    expect(limits()).toEqual([]);
    after(600);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
  });

  it("says nothing more of a limit met again within the ten minutes, but a reset that moved later", async () => {
    const { slack, after, moment, stands, look, limits } = await watched();
    await stands("failed", "running", limit(moment(60)));
    // Back at the reset, a few minutes at work, and stopped again, a few times over.
    after(61);
    await stands("running", "failed");
    after(3);
    await stands("failed", "running", limit(moment(15)));
    await look();
    after(16);
    await stands("running", "failed");
    after(4);
    // A product that names no moment this time: the manager keeps the one they have.
    await stands("failed", "running", limit());
    after(20);
    await look();
    expect(toWhom(slack)).toHaveLength(1);
    expect(limits()).toHaveLength(1);
    // The next window of the allowance, five hours on: the manager would wait for a moment long past.
    await stands("running", "failed");
    after(2);
    const later = moment(300);
    await stands("failed", "running", limit(later));
    expect(toWhom(slack)).toHaveLength(2);
    expect(blocksOf(slack.of("chat.postMessage")[1])).toContain(
      `<!date^${Date.parse(later) / 1000}^`,
    );
    expect(limits().map((record) => record.data)).toMatchObject([{ until: later, backAt: null }]);
    after(301);
    await stands("running", "failed");
    after(10);
    await look();
    // One return for the whole of it.
    expect(toWhom(slack)).toHaveLength(3);
    expect(blocksOf(slack.of("chat.postMessage")[2])).toContain(BACK);
    expect(limits()).toEqual([]);
  });

  it("says the limit once to the manager of an account whose machine sleeps through it, and its return once", async () => {
    const { slack, after, moment, stands, look, limits, silences } = await watched();
    const until = moment(300);
    await stands("failed", "running", limit(until));
    // The machine goes to sleep: the silence is told as any is, once it lasted.
    after(20);
    await stands("unheard", "failed");
    after(30);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    expect(blocksOf(slack.of("chat.postMessage")[1])).toContain("30분 넘게 응답이 없습니다");
    // It wakes for a few minutes each hour and says its limit again: nobody hears of it twice.
    for (let hour = 0; hour < 3; hour += 1) {
      after(55);
      await stands("failed", "unheard", limit(until));
      await look();
      after(5);
      await stands("unheard", "failed");
      await look();
    }
    expect(toWhom(slack)).toHaveLength(2);
    expect(silences()).toHaveLength(1);
    expect(limits()).toHaveLength(1);
    // Awake after the reset, the runner brings the agent back: one message says it runs again.
    after(90);
    await stands("running", "unheard");
    after(5);
    // Unheard for a moment within the ten minutes: not known to run, and counted anew.
    await stands("unheard", "running");
    after(5);
    await look();
    await stands("running", "unheard");
    after(9);
    await look();
    expect(toWhom(slack)).toHaveLength(2);
    after(1);
    await look();
    expect(toWhom(slack)).toHaveLength(3);
    expect(blocksOf(slack.of("chat.postMessage")[2])).toContain(BACK);
    expect(silences()).toEqual([]);
    expect(limits()).toEqual([]);
    // Awake but still within its limit for ten minutes: the silence is over, and nothing runs yet.
    await stands("failed", "running", limit(moment(300)));
    await stands("unheard", "failed");
    after(30);
    await look();
    await stands("failed", "unheard", limit(moment(270)));
    after(10);
    await look();
    expect(toWhom(slack)).toHaveLength(5);
    expect(silences()).toEqual([]);
    expect(limits()).toHaveLength(1);
  });

  it("leaves an account that stopped or failed otherwise to that message, and a console that names no limit as it was", async () => {
    const { slack, after, moment, stands, look, limits } = await watched();
    await stands("failed", "running", limit(moment(300)));
    // A supervisor stops it meanwhile: told as it comes, and so is its running again.
    after(5);
    await stands("stopped", "failed", { detail: "stop" });
    expect(toWhom(slack)).toHaveLength(2);
    expect(limits()).toEqual([]);
    await stands("running", "stopped");
    expect(toWhom(slack)).toHaveLength(3);
    // A reason that is no usage limit, and no moment: said as a failure is.
    await stands("failed", "running", { detail: "crashed" });
    expect(toWhom(slack)).toHaveLength(4);
    const failed = blocksOf(slack.of("chat.postMessage")[3]);
    expect(failed).toContain("에이전트 계정이 실패했습니다");
    expect(failed).toContain("crashed");
    expect(limits()).toEqual([]);
    await stands("running", "failed");
    expect(toWhom(slack)).toHaveLength(5);
    after(60);
    await look();
    expect(toWhom(slack)).toHaveLength(5);
  });

  it("reads the moment as data: none where it is no instant or is past, and a delivery repeated changes nothing", async () => {
    const past = new Date(NOW.getTime() - MINUTE).toISOString();
    for (const until of ["3am", 1794204000, { $gt: "" }, "9".repeat(5000), past, null, undefined]) {
      const { slack, stands, limits } = await watched();
      await stands("failed", "running", limit(until));
      const told = blocksOf(slack.of("chat.postMessage")[0]);
      expect(told, String(until)).toContain(UNKNOWN);
      expect(told, String(until)).not.toContain("date^");
      expect(limits().map((record) => record.data.until)).toEqual([null]);
    }
    const { slack, ctx, hook, moment, stands, limits } = await watched();
    // A name that is markup rings nobody, beside a moment that is Slack's own.
    const once = event(
      "agent.state_changed",
      {
        login: "bot-runner",
        handle: "<!channel>",
        state: "failed",
        was: "running",
        ...limit(moment(300)),
      },
      MANAGER,
    );
    await onOwnWork(hook, once);
    await onOwnWork(hook, { ...once, attempt: 2 });
    expect(toWhom(slack)).toHaveLength(1);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain("&lt;!channel&gt;");
    expect(blocksOf(slack.of("chat.postMessage")[0])).not.toContain("<!channel>");
    expect(limits()).toHaveLength(1);
    // A reason that is no text is no limit, and an account nobody knows keeps nothing.
    await stands("failed", "running", { detail: { $ne: "" }, until: moment(300) });
    expect(limits()).toEqual([]);
    await onOwnWork(
      ctx.as(CONSOLE),
      event("agent.state_changed", {
        login: "x".repeat(5000),
        state: "failed",
        was: "running",
        ...limit(moment(300)),
      }),
    );
    expect(limits()).toEqual([]);
  });

  it("tells as the manager chose: in the day's message with the moment, or nothing of a kind turned off", async () => {
    const { slack, ctx, hook, after, moment, stands, look, limits } = await watched();
    await notify.run(ctx, { cadence: "daily", at: "11:00" });
    const until = moment(300);
    await stands("failed", "running", limit(until));
    expect(toWhom(slack)).toEqual([]);
    expect(ctx.all("waiting").map((record) => record.data)).toMatchObject([
      { personId: MINSU.id, kind: "agent", what: { title: "Runner", to: "usage_limit", until } },
    ]);
    expect(String(ctx.all("waiting")[0]?.data.text)).toContain("2026-11-09 15:00 (Asia/Seoul)");
    after(60);
    await day.run(hook);
    expect(blocksOf(slack.of("chat.postMessage")[0])).toContain(
      `${RESETS} <!date^${Date.parse(until) / 1000}^`,
    );
    // The kind turned off: counted as told, so that turning it on again brings nothing old.
    await notify.run(ctx, { cadence: "now", off: ["agent"] });
    await stands("running", "failed");
    after(10);
    await look();
    expect(limits()).toEqual([]);
    await stands("failed", "running", limit(moment(300)));
    expect(limits()).toHaveLength(1);
    await notify.run(ctx, { on: ["agent"] });
    await stands("unheard", "failed");
    await stands("failed", "unheard", limit(moment(300)));
    expect(slack.of("chat.postMessage")).toHaveLength(1);
  });

  it("tells at the next try what Slack did not take, and keeps nothing of a limit nobody could be told", async () => {
    let fail = true;
    const slack = fakeSlack({
      "conversations.open": (params) =>
        fail
          ? { ok: false, error: "fatal_error" }
          : { ok: true, channel: { id: `D0${params.users}` } },
    });
    const { ctx, hook, after, moment, stands, look, limits } = await watched({ slack });
    const once = event(
      "agent.state_changed",
      { login: "bot-runner", state: "failed", was: "running", ...limit(moment(300)) },
      MANAGER,
    );
    await expect(onOwnWork(hook, once)).rejects.toBeDefined();
    // Kept once its manager was told: the try after tells them.
    expect(limits()).toEqual([]);
    fail = false;
    await onOwnWork(hook, { ...once, attempt: 2 });
    expect(slack.of("chat.postMessage")).toHaveLength(1);
    expect(limits()).toHaveLength(1);
    await stands("running", "failed");
    after(10);
    fail = true;
    await look();
    expect(limits()).toHaveLength(1);
    fail = false;
    after(5);
    await look();
    expect(slack.of("chat.postMessage")).toHaveLength(2);
    expect(limits()).toEqual([]);
    // The workspace taken away: a limit is kept by nobody, and told when it is said again after.
    for (const connection of ctx.all("connections")) {
      await ctx.as(CONSOLE).records("connections").update(connection.id, { state: "removed" });
    }
    await stands("failed", "running", limit(moment(300)));
    expect(limits()).toEqual([]);
    expect(slack.of("chat.postMessage")).toHaveLength(2);
  });

  it("keeps a limit the console told nobody of, tells nobody of its return, and puts away an account that left", async () => {
    const { slack, ctx, after, moment, stands, look, limits } = await watched();
    // The manager has the kind off in the console: the limit stands all the same.
    await stands("failed", "running", limit(moment(300)), []);
    expect(toWhom(slack)).toEqual([]);
    expect(limits()).toHaveLength(1);
    // They turn it on meanwhile: the same limit said again is the one that stands, and no news.
    await stands("failed", "running", limit(moment(300)));
    expect(toWhom(slack)).toEqual([]);
    await stands("running", "failed", {}, []);
    after(10);
    await look();
    expect(toWhom(slack)).toEqual([]);
    expect(limits()).toEqual([]);
    // An account that left since is put away when its return comes due, and nobody told.
    await ctx
      .as(CONSOLE)
      .records("limits")
      .create({
        personId: "0199a000-0000-7000-8000-0000000000ff",
        since: NOW.toISOString(),
        until: null,
        backAt: NOW.toISOString(),
        tell: [MINSU.id],
      });
    after(10);
    await look();
    expect(toWhom(slack)).toEqual([]);
    expect(limits()).toEqual([]);
  });
});

describe("the message of the day", () => {
  it("keeps the lines of whoever chose a day's message, and sends them once at their time", async () => {
    const { hook, slack, ctx } = await ready();
    // 01:00 UTC is 10:00 in Seoul.
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    await onOwnWork(hook, event("task.created", { taskId: task().id, number: 12 }, BOTH));
    await onOwnWork(
      hook,
      event("task.moved", { taskId: task().id, number: 12, to: "done" }, [told(JIHYE, "moved")]),
    );
    expect(toWhom(slack)).toEqual(["U0JIHYE01", "U0JIHYE01"]);
    expect(ctx.all("waiting").map((record) => record.data.personId)).toEqual([MINSU.id]);
    expect(((await notices.run(ctx, {})) as NoticesView).waiting).toBe(1);
    await day.run(hook);
    expect(toWhom(slack)).toHaveLength(2);
    await notify.run(ctx, { at: "09:00" });
    await day.run(hook);
    expect(toWhom(slack)).toHaveLength(3);
    expect(blocksOf(slack.of("chat.postMessage").at(-1))).toContain("오늘의 알림 1건");
    expect(ctx.all("waiting").every((record) => record.archivedAt !== null)).toBe(true);
    await onOwnWork(
      hook,
      event("task.created", { taskId: task().id, number: 12 }, [told(MINSU, "assigned")]),
    );
    await day.run(hook);
    // Once a day: the next line waits for tomorrow.
    expect(toWhom(slack).filter((who) => who === "U0MINSU01")).toHaveLength(1);
  });

  /** What a day's message says, a section at a time. */
  const sectionsOf = (call: { params: Readonly<Record<string, string>> } | undefined) =>
    (JSON.parse(blocksOf(call)) as { type: string; text?: { text: string } }[])
      .filter((block) => block.type === "section")
      .map((block) => block.text?.text ?? "");
  const WEB = "https://console.example.test/projects/WEB/tasks";

  it("says each thing once with everything that happened to it, what waits on the person first", async () => {
    let at = NOW;
    const titles: Record<number, string> = {
      12: "Ship the page",
      13: "Write the guide",
      14: "Fix the build",
    };
    const { hook, slack, ctx } = await ready({
      now: () => at,
      tasks: (number) => ({ title: titles[number], owner: brief(MINSU), workers: [] }),
    });
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    const tell = async (kind: string, data: Record<string, unknown>, under: string) => {
      at = new Date(at.getTime() + 60_000);
      await onOwnWork(hook, event(kind, data, [told(MINSU, under)]));
    };
    // Task 12 as an agent works one in a day: given, taken, given again, put up for a look.
    await tell("task.created", { number: 12 }, "assigned");
    await tell("task.moved", { number: 12, from: "ready", to: "in_progress" }, "moved");
    await tell(
      "task.updated",
      { number: 12, fields: ["workers"], workersAdded: [MINSU.id] },
      "assigned",
    );
    await tell("task.moved", { number: 12, from: "in_progress", to: "in_review" }, "moved");
    // Task 13 commented twice and changed between; task 14 put away; a decision raised last.
    await tell("task.commented", { number: 13, excerpt: "First thoughts" }, "commented");
    await tell("task.updated", { number: 13, fields: ["title", "dueOn"] }, "changed");
    await tell("task.commented", { number: 13, excerpt: "Second thoughts" }, "commented");
    await tell("task.archived", { number: 14 }, "archived");
    await tell("decision.raised", { decisionId: DECISION, question: "Ship it?" }, "decision");
    expect(ctx.all("waiting")).toHaveLength(9);
    at = new Date(NOW.getTime() + 2 * 3_600_000); // 12:00 in Seoul
    await day.run(hook);
    const sent = slack.of("chat.postMessage").at(-1);
    expect(sectionsOf(sent)).toEqual([
      "*오늘의 알림 4건*",
      `*내 답을 기다리는 결정* · Park Hana\n<https://console.example.test/decisions/${DECISION}|Ship it?>`,
      `*새로 맡은 작업 · 준비 → 진행 중 → 검토 중* · Park Hana\n<${WEB}/12|WEB-12 Ship the page>`,
      `*보관된 작업* · Park Hana\n<${WEB}/14|WEB-14 Fix the build>`,
      `*제목, 마감일 변경 · 새 댓글 2건* · Park Hana\n<${WEB}/13|WEB-13 Write the guide>\n> First thoughts\n> Second thoughts`,
    ]);
    expect(sent?.params.text).toBe("오늘의 알림 4건");
    expect(ctx.all("waiting").every((record) => record.archivedAt !== null)).toBe(true);
  });

  it("counts what is past twenty things, and cuts no thing short", async () => {
    let at = NOW;
    const { hook, slack, ctx } = await ready({
      now: () => at,
      tasks: () => ({ title: "긴 제목 ".repeat(60), owner: brief(MINSU), workers: [] }),
    });
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    for (let number = 1; number <= 23; number += 1) {
      at = new Date(at.getTime() + 1000);
      await onOwnWork(
        hook,
        event("task.commented", { number, excerpt: "가".repeat(300) }, [told(MINSU, "commented")]),
      );
    }
    at = new Date(NOW.getTime() + 2 * 3_600_000);
    await day.run(hook);
    const sent = slack.of("chat.postMessage").at(-1);
    const sections = sectionsOf(sent);
    expect(sections).toHaveLength(21);
    expect(sections[0]).toBe("*오늘의 알림 23건*");
    // Each thing whole, its link closed and its quote ended, far inside what Slack takes of a block.
    for (const text of sections.slice(1)) {
      expect(text.length).toBeLessThan(1000);
      expect(text).toMatch(/^\*새 댓글\* · Park Hana\n<https:[^|>]+\|WEB-\d+ [^>]+…>\n> 가+…$/);
    }
    expect(blocksOf(sent)).toContain("나머지 3건은 콘솔에서 보세요.");
    expect(ctx.all("waiting").every((record) => record.archivedAt !== null)).toBe(true);
  });

  it("keeps a line whose title and comment are all characters of two units, as an emoji is", async () => {
    let at = NOW;
    const rocket = String.fromCodePoint(0x1f680);
    const party = String.fromCodePoint(0x1f389);
    const { hook, slack, ctx } = await ready({
      now: () => at,
      tasks: () => ({ title: rocket.repeat(400), owner: brief(MINSU), workers: [] }),
    });
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    await onOwnWork(
      hook,
      event("task.commented", { number: 12, excerpt: party.repeat(400) }, [
        told(MINSU, "commented"),
      ]),
    );
    // Held to a count of characters, which a record's schema counts in units, two to each of these.
    expect(ctx.all("waiting")).toHaveLength(1);
    at = new Date(NOW.getTime() + 2 * 3_600_000);
    await day.run(hook);
    const said = sectionsOf(slack.of("chat.postMessage").at(-1))[1] ?? "";
    expect(said.startsWith(`*새 댓글* · Park Hana\n<${WEB}/12|WEB-12 ${rocket}`)).toBe(true);
    expect(said.endsWith(`${party}…`)).toBe(true);
  });

  it("sends a line kept by the version before, which has its sentence alone, as it was said", async () => {
    let at = NOW;
    const { hook, slack, ctx } = await ready({ now: () => at });
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    await ctx.records("waiting").create(
      {
        personId: MINSU.id,
        kind: "moved",
        text: "Park Hana moved WEB-12 Ship the <page> to Done.",
        url: `${WEB}/12`,
        at: NOW.toISOString(),
      },
      { owner: MINSU.id },
    );
    await onOwnWork(hook, event("task.created", { number: 12 }, [told(MINSU, "assigned")]));
    at = new Date(NOW.getTime() + 2 * 3_600_000);
    await day.run(hook);
    expect(sectionsOf(slack.of("chat.postMessage").at(-1))).toEqual([
      "*오늘의 알림 2건*",
      `*새로 맡은 작업* · Park Hana\n<${WEB}/12|WEB-12 Ship the &lt;!channel&gt; page>`,
      `Park Hana moved WEB-12 Ship the &lt;page&gt; to Done. (<${WEB}/12|콘솔에서 열기>)`,
    ]);
  });

  it("runs every five minutes, the least a job may, sends at the first run past the minute, and writes nothing before", async () => {
    expect(day.every).toBe("PT5M");
    let at = NOW;
    const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);
    const { hook, slack, ctx } = await ready({ now: () => at });
    // Chosen at 10:00 in Seoul for 11:30.
    await notify.run(ctx, { cadence: "daily", at: "11:30" });
    await onOwnWork(hook, event("task.created", { number: 12 }, [told(MINSU, "assigned")]));
    const kept = () => JSON.stringify([ctx.all("preferences"), ctx.all("waiting")]);
    const before = kept();
    const calls = slack.calls.length;
    at = minutes(89); // 11:29
    await day.run(hook);
    expect(slack.calls).toHaveLength(calls);
    expect(kept()).toBe(before);
    at = minutes(91); // 11:31
    await day.run(hook);
    expect(toWhom(slack).at(-1)).toBe("U0MINSU01");
    expect(ctx.all("preferences")[0]?.data.sentOn).toBe("2026-11-09");
  });
});

describe("the day due", () => {
  it("is today once its time has come in the zone, else yesterday", () => {
    // 01:00 UTC is 10:00 in Seoul.
    expect(dueDay(NOW, "Asia/Seoul", "09:00")).toBe("2026-11-09");
    expect(dueDay(NOW, "Asia/Seoul", "23:45")).toBe("2026-11-08");
    expect(dueDay(NOW, "UTC", "00:30")).toBe("2026-11-09");
    // A zone the runtime does not know is read as UTC.
    expect(dueDay(NOW, "Nowhere/Else", "02:00")).toBe("2026-11-08");
  });

  it("sends a time later than the job's last run of the day early the next, and counts a day with nothing waiting", async () => {
    let at = NOW;
    const hours = (count: number) => new Date(NOW.getTime() + count * 3_600_000);
    const { hook, slack, ctx } = await ready({ now: () => at });
    const toMinsu = () => toWhom(slack).filter((who) => who === "U0MINSU01").length;
    // Chosen at 10:00 in Seoul for 23:45: today's time has not come, and no run of the job is at it.
    await notify.run(ctx, { cadence: "daily", at: "23:45" });
    await onOwnWork(
      hook,
      event("task.created", { taskId: task().id, number: 12 }, [told(MINSU, "assigned")]),
    );
    at = hours(13.5); // 23:30
    await day.run(hook);
    expect(toMinsu()).toBe(0);
    at = hours(14.25); // 00:15 the next day: yesterday's 23:45 has come
    await day.run(hook);
    expect(toMinsu()).toBe(1);
    // That evening nothing waits, and the day counts as sent all the same.
    at = hours(38.25); // 00:15 the day after
    await day.run(hook);
    expect(ctx.all("preferences")[0]?.data.sentOn).toBe("2026-11-10");
    // So a line kept the next afternoon waits for that night's time.
    at = hours(44); // 15:00
    await onOwnWork(
      hook,
      event("task.created", { taskId: task().id, number: 12 }, [told(MINSU, "assigned")]),
    );
    await day.run(hook);
    expect(toMinsu()).toBe(1);
    at = hours(62.25); // 00:15 the day after
    await day.run(hook);
    expect(toMinsu()).toBe(2);
  });
});

describe("a delivery tried again", () => {
  it("tells nobody twice where telling someone failed after another was told", async () => {
    let fail = true;
    const slack = fakeSlack({
      "conversations.open": (params) =>
        params.users === "U0MINSU01" && fail
          ? { ok: false, error: "fatal_error" }
          : { ok: true, channel: { id: `D0${params.users}` } },
    });
    const made = setup({
      slack,
      caller: MEMBER_MINSU,
      board: { tasks: { get: async () => task() } },
    });
    await connected(made.ctx);
    await linked(made.ctx, MINSU, "U0MINSU01");
    await linked(made.ctx, JIHYE, "U0JIHYE01");
    const hook = made.ctx.as(CONSOLE);
    const once = event("task.created", { taskId: task().id, number: 12 }, BOTH);
    await expect(onOwnWork(hook, once)).rejects.toBeDefined();
    const failed = made.ctx.all("deliveries")[0]?.data as { outcome: string; told: string[] };
    expect(failed.outcome).toBe("failed");
    expect(failed.told).toEqual([`${JIHYE.id}:assigned`]);
    fail = false;
    await onOwnWork(hook, { ...once, attempt: 2 });
    // Jihye was told on the first try alone; Minsu on the second.
    expect(slack.of("chat.postMessage").map((call) => call.params.channel)).toEqual([
      "D0U0JIHYE01",
      "D0U0MINSU01",
    ]);
    expect(made.ctx.all("deliveries")[0]?.data).toMatchObject({ outcome: "sent", note: "told:2" });
  });
});

describe("the kinds", () => {
  it("are the console's own, each by its name and in its order", () => {
    // What the console tells a member under is what they choose by here: a kind it adds is one
    // the messenger has no words for until this list has it.
    expect([...NOTICE_KINDS]).toEqual([...NOTIFICATION_KINDS]);
  });

  it("stand in one group of the page each, with the tasks a member turned on", () => {
    // Saving the page names every choice on or off, so one that stood in no group would be turned
    // off by it, and one that stood in two would be both.
    const grouped = Object.values(NOTICE_GROUPS).flat();
    expect([...grouped].sort()).toEqual([...NOTICE_CHOICES].sort());
  });
});

/** What a person who chose nothing in the console is told of: their agent accounts alone. */
const PERSON_KINDS = {
  assigned: false,
  ready: false,
  moved: false,
  changed: false,
  commented: false,
  archived: false,
  decision: false,
  answered: false,
  agent: true,
};

describe("notify and notices", () => {
  it("answers everything the console tells to whoever never chose, and what they keep out of Slack since", async () => {
    const { ctx } = await ready();
    const before = (await notices.run(ctx, {})) as NoticesView;
    expect(before).toMatchObject({
      chosen: false,
      cadence: "now",
      at: "09:00",
      timeZone: "Asia/Seoul",
      accounts: [{ teamId: TEAM, teamName: "Acme" }],
    });
    // The console's kinds by its own names, and the tasks turned on beside them: all sent on.
    expect(before.kinds).toEqual({
      assigned: true,
      ready: true,
      moved: true,
      changed: true,
      commented: true,
      archived: true,
      decision: true,
      answered: true,
      agent: true,
      followed: true,
    });
    const said = await notify.run(ctx, { off: ["followed", "moved"] });
    // The answer reads back what is kept out, for an agent that chose it.
    expect(said.text).toBe(
      "콘솔이 알려 주는 것을 Slack으로 그때그때 보냅니다. Slack으로 보내지 않는 것: 상태 변경, 직접 활성화한 작업.",
    );
    const after = (await notices.run(ctx, {})) as NoticesView;
    expect(after).toMatchObject({ chosen: true, kinds: { moved: false, followed: false } });
    expect(after.kinds.commented).toBe(true);
    // The record keeps what is off and nothing of who is told, which is the console's.
    expect(ctx.all("preferences")[0]?.data).toEqual({
      personId: MINSU.id,
      off: ["moved", "followed"],
      cadence: "now",
      at: "09:00",
      sentOn: null,
    });
    await notify.run(ctx, { on: ["moved"] });
    expect(((await notices.run(ctx, {})) as NoticesView).kinds).toMatchObject({
      moved: true,
      followed: false,
    });
    const reset = await notify.run(ctx, { reset: true });
    expect(reset.text).toContain("Slack으로 보내지 않는 것: 없음.");
    expect(((await notices.run(ctx, {})) as NoticesView).kinds.followed).toBe(true);
  });

  it("says what is off in the console, where nothing of it comes, and keeps the choice made here", async () => {
    const { ctx } = await ready({
      settings: async () => ({
        kinds: { ...PERSON_KINDS, commented: true },
        defaults: PERSON_KINDS,
        projectsOff: [{ key: "web", name: "Web" }],
        ownAgents: false,
      }),
    });
    const before = (await notices.run(ctx, {})) as NoticesView;
    expect(before.console).toEqual({
      kinds: { ...PERSON_KINDS, commented: true },
      projectsOff: [{ key: "web", name: "Web" }],
      ownAgents: false,
    });
    // What is chosen here stands whatever the console's says, for when it is on there again.
    expect(before.kinds.moved).toBe(true);
    expect(before.agentAccount).toBe(false);
    const off = await notify.run(ctx, { off: ["moved"] });
    expect(off.text).not.toContain("비활성화되어 있어");
    // Turned on here, a kind that is off there comes no more than before: the answer says so.
    const on = await notify.run(ctx, { on: ["moved", "commented", "followed"] });
    expect(on.text).toContain(
      "콘솔에서 비활성화되어 있어 오지 않는 것: 상태 변경. 콘솔 알림 설정이나 console notify로 활성화하세요.",
    );
    expect((on.data as NoticesView).kinds).toMatchObject({ moved: true, commented: true });
    expect(ctx.all("preferences")[0]?.data.off).toEqual([]);
  });

  it("answers as it did where the console does not say what is off there", async () => {
    for (const settings of [
      undefined,
      async () => {
        throw Object.assign(new Error("down"), { code: "plugin.unavailable" });
      },
    ]) {
      const { ctx } = await ready(settings === undefined ? {} : { settings });
      const view = (await notices.run(ctx, {})) as NoticesView;
      expect(view.console).toBe(null);
      expect(view.kinds.moved).toBe(true);
      const on = await notify.run(ctx, { on: ["moved"] });
      expect(on.text).not.toContain("비활성화되어 있어");
    }
  });

  it("tells an agent account that nothing is sent to it, the console waking it itself", async () => {
    const { ctx } = await ready({
      people: [{ ...MINSU, kind: "agent" }, JIHYE],
      settings: async () => ({
        kinds: PERSON_KINDS,
        defaults: PERSON_KINDS,
        projectsOff: [],
        ownAgents: false,
      }),
    });
    expect(((await notices.run(ctx, {})) as NoticesView).agentAccount).toBe(true);
    const said = await notify.run(ctx, { on: ["moved"] });
    expect(said.text).toContain("에이전트 계정에는 Slack으로 보내지 않습니다.");
  });

  it("refuses a time that is none, a kind both on and off, the console itself, and whoever holds no role", async () => {
    const { ctx } = await ready();
    for (const at of ["9:00", "24:00", "09:60", "nine"]) {
      await expect(notify.run(ctx, { at })).rejects.toMatchObject({ code: "at" });
    }
    await expect(notify.run(ctx, { on: ["moved"], off: ["moved"] })).rejects.toMatchObject({
      code: "both",
    });
    await expect(notify.run(ctx.as(CONSOLE), {})).rejects.toMatchObject({ code: "no_person" });
    await expect(notices.run(ctx.as(STRANGER), {})).rejects.toMatchObject({ code: "forbidden" });
  });

  it("says which workspace a project is told in, to a member and never to the console itself", async () => {
    const { ctx } = await ready();
    const project = { id: PROJECT.id, key: PROJECT.key, name: "Web" };
    const view = (await projectNotices.run(ctx, { key: project })) as ProjectNoticesView;
    expect(view).toEqual({
      project,
      workspace: { teamId: TEAM, teamName: "Acme", default: true },
    });
    await expect(projectNotices.run(ctx.as(CONSOLE), { key: project })).rejects.toMatchObject({
      code: "no_person",
    });
  });
});

describe("a choice kept before data version 4", () => {
  /** A collection as it is kept, whatever shape its records had. */
  const loose = (name: string) => defineCollection(name, { schema: z.looseObject({}) });
  /** What 0.6 kept of Minsu: every kind on or off, a project turned off, their own agents counted. */
  const before = {
    personId: MINSU.id,
    kinds: {
      assigned: true,
      moved: false,
      changed: false,
      commented: true,
      archived: false,
      decisions: false,
      agents: true,
    },
    mutedProjects: [PROJECT.id],
    cadence: "daily",
    at: "08:30",
    ownAgents: true,
    sentOn: "2026-11-08",
  };

  it("is read as it stands: what they turned off stays off, and the rest follows the console", async () => {
    const { ctx, hook, slack } = await ready();
    await ctx.records(loose("preferences")).create(before, { owner: MINSU.id });
    const view = (await notices.run(ctx, {})) as NoticesView;
    // Moves and decisions they turned off themselves; changes and tasks put away were off for
    // whoever never chose, and are no choice of theirs.
    expect(view).toMatchObject({ chosen: true, cadence: "daily", at: "08:30" });
    expect(view.kinds).toMatchObject({
      moved: false,
      decision: false,
      changed: true,
      archived: true,
      ready: true,
      agent: true,
      followed: true,
    });
    await onOwnWork(hook, event("task.moved", { number: 12, to: "done" }, [told(MINSU, "moved")]));
    expect(ctx.all("waiting")).toHaveLength(0);
    // A choice made since brings the record to the shape of now, what was off still off.
    await notify.run(ctx, { cadence: "now" });
    expect(ctx.all("preferences")[0]?.data).toEqual({
      personId: MINSU.id,
      off: ["moved", "decision"],
      cadence: "now",
      at: "08:30",
      sentOn: "2026-11-08",
    });
    expect(slack.calls).toHaveLength(0);
  });

  it("is brought to the shape of now by the upgrade, once, with the lines waiting for a day's message", async () => {
    const { ctx, hook } = await ready();
    await ctx.records(loose("preferences")).create(before, { owner: MINSU.id });
    const line = (kind: string) =>
      ctx.records(loose("waiting")).create(
        {
          personId: MINSU.id,
          kind,
          text: "A line",
          url: null,
          at: NOW.toISOString(),
          what: {
            ref: null,
            title: "Runner",
            actor: null,
            from: null,
            to: "failed",
            fields: [],
            excerpt: "",
          },
        },
        { owner: MINSU.id },
      );
    await line("agents");
    await line("decisions");
    await line("commented");
    await line("everything");
    for (let run = 0; run < 2; run += 1) {
      await toVersion4(hook);
      expect(ctx.all("preferences").map((record) => record.data)).toEqual([
        {
          personId: MINSU.id,
          off: ["moved", "decision"],
          cadence: "daily",
          at: "08:30",
          sentOn: "2026-11-08",
        },
      ]);
      // Each line by the console's name for its kind; one of no kind is put away.
      expect(
        ctx
          .all("waiting")
          .filter((record) => record.archivedAt === null)
          .map((record) => record.data.kind),
      ).toEqual(["agent", "decision", "commented"]);
    }
  });
});

describe("the button of a message", () => {
  it("turns the kind off for whoever pressed, and says so to them alone", async () => {
    const { ctx, slack } = await ready();
    const press = {
      type: "block_actions",
      user: { id: "U0MINSU01", team_id: TEAM },
      team: { id: TEAM },
      response_url: "https://hooks.slack.com/actions/T0TEST01/1/abc",
      actions: [{ action_id: "notice-off", value: "commented" }],
    };
    await slackEndpoint.run(ctx, signedRequest(press));
    expect(((await notices.run(ctx, {})) as NoticesView).kinds.commented).toBe(false);
    const said = slack.of("response_url")[0]?.json as { text: string; response_type: string };
    expect(said.response_type).toBe("ephemeral");
    // Off for Slack alone, which the words say: the console's own list still has it.
    expect(said.text).toContain("이제 댓글 알림을 Slack으로 보내지 않습니다.");
    // A value that is no kind changes nothing and says nothing.
    await slackEndpoint.run(
      ctx,
      signedRequest({ ...press, actions: [{ action_id: "notice-off", value: "everything" }] }),
    );
    expect(slack.of("response_url")).toHaveLength(1);
    // A message sent before data version 4 names its kind as it was called then.
    await slackEndpoint.run(
      ctx,
      signedRequest({ ...press, actions: [{ action_id: "notice-off", value: "agents" }] }),
    );
    expect(((await notices.run(ctx, {})) as NoticesView).kinds).toMatchObject({
      agent: false,
      commented: false,
      moved: true,
    });
  });
});
