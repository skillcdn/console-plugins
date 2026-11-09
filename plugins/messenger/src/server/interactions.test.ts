// What Slack posts when someone presses, answered within the request alone (ADR-0011): nothing
// before the signature; the leave form opened for whoever pressed, with what HR says for them, and
// drawn again for the kind chosen; the submission requested for them, HR's refusal said beside the
// field; one's upcoming leave cancelled from a form pushed over it; a decision's button answered
// for the presser, on their plate alone, a refusal told to them through the press's own address.
import { PluginRefusal } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import { slackEndpoint } from "./index.js";
import {
  connected,
  fakeHr,
  fakeSlack,
  JIHYE,
  linked,
  MINSU,
  NOW,
  setup,
  signedRequest,
  TEAM,
} from "./test-fakes.js";

const DECISION = "0199b000-0000-7000-8000-00000000d001";
const RESPONSE_URL = "https://hooks.slack.com/actions/T0TEST01/1/abc";

/** Minsu's own request as HR 0.3.0 answers it to him, approved and his to cancel at once unless said. */
function own(
  id: string,
  from: string,
  overrides: {
    readonly to?: string;
    readonly part?: string;
    readonly state?: string;
    readonly cancellable?: boolean;
    readonly cancellation?: "now" | "decision" | null;
    readonly cancelDeciders?: readonly unknown[];
    readonly asked?: readonly unknown[];
  } = {},
) {
  return {
    id,
    person: { id: MINSU.id, login: MINSU.login, name: MINSU.name },
    request: {
      type: "annual",
      from,
      to: overrides.to ?? from,
      part: overrides.part ?? "none",
      days: 1,
      reason: "",
      state: overrides.state ?? "approved",
      late: false,
      rule: null,
      note: null,
      decisionId: null,
      cancelDecisionId: null,
      requestedAt: NOW.toISOString(),
      requestedVia: "messenger",
      decidedAt: null,
    },
    recordedBy: null,
    decidedBy: null,
    line: [],
    asked: overrides.asked ?? [],
    mine: true,
    decisionPath: null,
    cancelDecisionPath: null,
    cancellable: overrides.cancellable ?? true,
    cancellation: overrides.cancellation === undefined ? "now" : overrides.cancellation,
    cancelDeciders: overrides.cancelDeciders ?? [],
  };
}

const leaveId = (n: number) => `0199c000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;
const JIHYE_BRIEF = { id: JIHYE.id, login: JIHYE.login, name: JIHYE.name };

/** A leave's cancel button pressed in the form, the form on a kind. */
const cancelPress = (requestId: string, user = "U0MINSU01") => ({
  type: "block_actions",
  user: { id: user, team_id: TEAM },
  team: { id: TEAM },
  trigger_id: "trigger-3",
  view: {
    id: "V0FORM001",
    hash: "hash-1",
    callback_id: "leave-request",
    state: {
      values: { kind: { value: { type: "static_select", selected_option: { value: "comp" } } } },
    },
  },
  actions: [{ action_id: "cancel", type: "button", value: requestId }],
});

/** The cancellation's form submitted, over the leave form `V0FORM001`. */
const cancelSubmission = (metadata: string, reason: string | null, user = "U0MINSU01") => ({
  type: "view_submission",
  user: { id: user, team_id: TEAM },
  team: { id: TEAM },
  view: {
    id: "V0CANCEL1",
    callback_id: "leave-cancel",
    private_metadata: metadata,
    root_view_id: "V0FORM001",
    previous_view_id: "V0FORM001",
    state: { values: { reason: { value: { type: "plain_text_input", value: reason } } } },
  },
});

const shortcut = (user = "U0MINSU01", team = TEAM) => ({
  type: "shortcut",
  callback_id: "leave-request",
  trigger_id: "trigger-1",
  user: { id: user, team_id: team },
  team: { id: team },
});

const submission = (values: Record<string, unknown>, user = "U0MINSU01") => ({
  type: "view_submission",
  user: { id: user, team_id: TEAM },
  team: { id: TEAM },
  view: { callback_id: "leave-request", state: { values } },
});

const filled = (from: string, to: string | null, extra: Record<string, unknown> = {}) => ({
  kind: { value: { type: "static_select", selected_option: { value: "annual" } } },
  from: { value: { type: "datepicker", selected_date: from } },
  to: { value: { type: "datepicker", selected_date: to } },
  "part-quarter": { value: { type: "static_select", selected_option: null } },
  reason: { value: { type: "plain_text_input", value: "Family trip" } },
  ...extra,
});

/** Another kind chosen in the form, as Slack tells it, with the form's id and hash. */
const choose = (kind: string, user = "U0MINSU01") => ({
  type: "block_actions",
  user: { id: user, team_id: TEAM },
  team: { id: TEAM },
  trigger_id: "trigger-2",
  view: {
    id: "V0FORM001",
    hash: "hash-1",
    callback_id: "leave-request",
    state: { values: {} },
  },
  actions: [
    {
      action_id: "value",
      block_id: "kind",
      type: "static_select",
      selected_option: { value: kind },
    },
  ],
});

interface ViewJson {
  readonly callback_id?: string;
  readonly private_metadata?: string;
  readonly title: { readonly text: string };
  readonly submit?: { readonly text: string };
  readonly close?: { readonly text: string };
  readonly blocks: readonly {
    readonly type: string;
    readonly block_id?: string;
    readonly text?: { readonly text: string };
    readonly accessory?: { readonly action_id?: string; readonly value?: string };
    readonly optional?: boolean;
    readonly dispatch_action?: boolean;
    readonly label?: { readonly text: string };
    readonly hint?: { readonly text: string };
    readonly element?: {
      readonly options?: readonly { readonly value: string }[];
      readonly initial_option?: { readonly value: string };
    };
    readonly elements?: readonly { readonly text: string }[];
  }[];
}

const viewOf = (call: { readonly params: Readonly<Record<string, string>> } | undefined) =>
  JSON.parse(call?.params.view ?? "{}") as ViewJson;
const blockOf = (view: ViewJson, id: string) => view.blocks.find((block) => block.block_id === id);

const press = (action: string, value: string, url = RESPONSE_URL, user = "U0MINSU01") => ({
  type: "block_actions",
  user: { id: user, team_id: TEAM },
  team: { id: TEAM },
  response_url: url,
  actions: [{ action_id: action, value, type: "button" }],
});

describe("the signature", () => {
  it("refuses a request signed with another secret, or too old, and reads nothing of it", async () => {
    const { ctx, slack } = setup();
    await connected(ctx);
    const forged = await slackEndpoint.run(ctx, signedRequest(shortcut(), { secret: "other" }));
    expect(forged.status).toBe(401);
    const old = await slackEndpoint.run(
      ctx,
      signedRequest(shortcut(), { at: new Date(NOW.getTime() - 10 * 60 * 1000) }),
    );
    expect(old.status).toBe(401);
    const bare = await slackEndpoint.run(ctx, signedRequest(shortcut(), { signature: "v0=zz" }));
    expect(bare.status).toBe(401);
    expect(slack.calls).toHaveLength(0);
  });

  it("answers a signed request with no payload as a bad request", async () => {
    const { ctx } = setup();
    await connected(ctx);
    const request = signedRequest(shortcut());
    const empty = { ...request, body: "" };
    const resigned = signedRequest(null);
    expect((await slackEndpoint.run(ctx, { ...resigned })).status).toBe(400);
    expect((await slackEndpoint.run(ctx, empty)).status).toBe(401);
  });

  it("passes over a press from another workspace", async () => {
    const { ctx, slack } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(ctx, signedRequest(shortcut("U0MINSU01", "T0OTHER01")));
    expect(answer.status).toBe(200);
    expect(slack.calls).toHaveLength(0);
  });
});

describe("the leave shortcut", () => {
  it("opens the form for the person who pressed, with HR's kinds and their balance", async () => {
    const { ctx, slack, hr } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(ctx, signedRequest(shortcut()));
    expect(answer.status).toBe(200);
    expect(hr.calls.map((call) => [call.as, call.name])).toEqual([
      [MINSU.id, "types"],
      [MINSU.id, "balance"],
    ]);
    const open = slack.of("views.open")[0];
    expect(open?.params.trigger_id).toBe("trigger-1");
    const view = viewOf(open);
    expect(view.callback_id).toBe("leave-request");
    expect(view.title.text).toBe("휴가");
    // What is left comes first, of the kinds that keep a balance.
    expect(view.blocks[0]?.elements?.[0]?.text).toBe("남은 휴가: 연차 12.5일");
    // HR's order, the disabled kind left out; annual leave chosen first, as HR's own form does,
    // its rules under it, its quarters offered, a reason optional.
    const kind = blockOf(view, "kind");
    expect(kind?.element?.options?.map((option) => option.value)).toEqual([
      "sick",
      "annual",
      "comp",
    ]);
    expect(kind?.element?.initial_option?.value).toBe("annual");
    expect(kind?.dispatch_action).toBe(true);
    expect(kind?.hint?.text).toBe("Annual leave rules, in a sentence.");
    expect(blockOf(view, "part-quarter")?.element?.options?.map((option) => option.value)).toEqual([
      "am",
      "pm",
      "q1",
      "q2",
      "q3",
      "q4",
    ]);
    expect(blockOf(view, "part-quarter")?.label?.text).toBe("반차·반반차");
    expect(blockOf(view, "reason")?.optional).toBe(true);
  });

  it("tells someone HR keeps no leave for that they cannot request it, in place of the form", async () => {
    const { ctx, slack } = setup({ hr: fakeHr({ enrolled: false }) });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(shortcut()));
    const view = viewOf(slack.of("views.open")[0]);
    expect(view.title.text).toBe("휴가 대상 아님");
    expect(view.blocks.some((block) => block.block_id === "kind")).toBe(false);
  });

  it("tells a presser with no linked account so, and reads nothing of HR", async () => {
    const { ctx, slack, hr } = setup();
    await connected(ctx);
    await slackEndpoint.run(ctx, signedRequest(shortcut("U0NOBODY1")));
    const view = JSON.parse(slack.of("views.open")[0]?.params.view ?? "{}") as {
      title: { text: string };
    };
    expect(view.title.text).toBe("연결되지 않음");
    expect(hr.calls).toHaveLength(0);
  });

  it("says leave cannot be requested where HR is off", async () => {
    const { ctx, slack } = setup({ hr: fakeHr({ absent: true }) });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(shortcut()));
    const view = JSON.parse(slack.of("views.open")[0]?.params.view ?? "{}") as {
      title: { text: string };
    };
    expect(view.title.text).toBe("사용할 수 없음");
  });
});

describe("a kind chosen in the form", () => {
  it("draws the form again for it: its parts of a day, its reason, its rules, the days kept", async () => {
    const { ctx, slack, answered } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    expect((await slackEndpoint.run(ctx, signedRequest(choose("sick")))).status).toBe(200);
    const update = slack.of("views.update")[0];
    expect(update?.params).toMatchObject({ view_id: "V0FORM001", hash: "hash-1" });
    const sick = viewOf(update);
    expect(blockOf(sick, "kind")?.element?.initial_option?.value).toBe("sick");
    expect(blockOf(sick, "kind")?.hint?.text).toBe("Sick leave rules, in a sentence.");
    // Whole days alone, a reason asked.
    expect(sick.blocks.some((block) => block.block_id?.startsWith("part"))).toBe(false);
    expect(blockOf(sick, "reason")?.optional).toBe(false);
    expect(blockOf(sick, "reason")?.hint?.text).toBe("이 휴가는 사유가 필요합니다.");
    // The days' fields keep their ids, so that Slack keeps what was picked in them.
    expect(blockOf(sick, "from")).toBeDefined();
    expect(blockOf(sick, "to")).toBeDefined();
    await slackEndpoint.run(ctx, signedRequest(choose("comp")));
    const comp = viewOf(slack.of("views.update")[1]);
    expect(blockOf(comp, "part-half")?.element?.options?.map((option) => option.value)).toEqual([
      "am",
      "pm",
    ]);
    expect(blockOf(comp, "part-half")?.label?.text).toBe("반차");
    expect(blockOf(comp, "reason")).toBeUndefined();
    expect(blockOf(comp, "kind")?.hint).toBeUndefined();
    expect(answered).toHaveLength(0);
  });

  it("draws the first kind for a choice that is none of HR's, and lets a form changed since be", async () => {
    const slack = fakeSlack({ "views.update": () => ({ ok: false, error: "hash_conflict" }) });
    const { ctx } = setup({ slack });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(ctx, signedRequest(choose("../../etc")));
    expect(answer).toEqual({ status: 200 });
    const view = viewOf(slack.of("views.update")[0]);
    expect(blockOf(view, "kind")?.element?.initial_option?.value).toBe("annual");
  });

  it("draws nothing for a presser with no linked account", async () => {
    const { ctx, slack, hr } = setup();
    await connected(ctx);
    await slackEndpoint.run(ctx, signedRequest(choose("sick", "U0NOBODY1")));
    expect(slack.of("views.update")).toHaveLength(0);
    expect(hr.calls).toHaveLength(0);
  });
});

describe("the form's submission", () => {
  it("requests the leave for the person, as HR's request takes it, and closes the form", async () => {
    const { ctx, hr } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(
      ctx,
      signedRequest(submission(filled("2026-11-20", "2026-11-21"))),
    );
    expect(answer).toEqual({ status: 200 });
    expect(hr.calls).toEqual([
      {
        as: MINSU.id,
        name: "request",
        input: { type: "annual", from: "2026-11-20", to: "2026-11-21", reason: "Family trip" },
      },
    ]);
  });

  it("says HR's refusal beside the field, in the person's words", async () => {
    const hr = fakeHr({
      request: () => {
        throw new PluginRefusal("plugin.hr.not_enough", "남은 연차가 부족합니다.");
      },
    });
    const { ctx } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(
      ctx,
      signedRequest(submission(filled("2026-11-20", null))),
    );
    expect(answer.body).toEqual({
      response_action: "errors",
      errors: { from: "남은 연차가 부족합니다." },
    });
  });

  it("says each of HR's refusals beside the field it is about, by HR's code", async () => {
    const cases = [
      ["reason_required", "reason"],
      ["part", "part-quarter"],
      ["span", "to"],
      ["unknown_type", "kind"],
      ["too_late", "from"],
    ] as const;
    for (const [code, field] of cases) {
      const hr = fakeHr({
        request: () => {
          throw new PluginRefusal(`plugin.hr.${code}`, `refused: ${code}`);
        },
      });
      const { ctx } = setup({ hr });
      await connected(ctx);
      await linked(ctx, MINSU, "U0MINSU01");
      const answer = await slackEndpoint.run(
        ctx,
        signedRequest(submission(filled("2026-11-20", "2026-11-21"))),
      );
      expect(answer.body).toEqual({
        response_action: "errors",
        errors: { [field]: `refused: ${code}` },
      });
    }
  });

  it("says a refusal about a field the form does not hold beside the first day", async () => {
    const hr = fakeHr({
      request: () => {
        throw new PluginRefusal("plugin.hr.reason_required", "사유가 필요합니다.");
      },
    });
    const { ctx } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const values = filled("2026-11-20", null) as Record<string, unknown>;
    delete values.reason;
    const answer = await slackEndpoint.run(ctx, signedRequest(submission(values)));
    expect(answer.body).toEqual({
      response_action: "errors",
      errors: { from: "사유가 필요합니다." },
    });
  });

  it("refuses a last day before the first, and a part that is none of HR's, before HR is asked", async () => {
    const { ctx, hr } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const backwards = await slackEndpoint.run(
      ctx,
      signedRequest(submission(filled("2026-11-20", "2026-11-19"))),
    );
    expect(backwards.body).toMatchObject({
      response_action: "errors",
      errors: { to: "종료일이 시작일보다 앞입니다." },
    });
    const odd = await slackEndpoint.run(
      ctx,
      signedRequest(
        submission(
          filled("2026-11-20", null, {
            "part-quarter": {
              value: { type: "static_select", selected_option: { value: "evening" } },
            },
          }),
        ),
      ),
    );
    expect(odd.body).toMatchObject({ response_action: "errors" });
    expect(hr.calls).toHaveLength(0);
  });
});

describe("one's upcoming leave, and its cancellation", () => {
  it("lists the leave one may cancel above the form, the nearest first, five at most", async () => {
    const hr = fakeHr({
      requests: [
        own(leaveId(6), "2026-12-24"),
        own(leaveId(1), "2026-11-12", { part: "am" }),
        own(leaveId(2), "2026-11-20", { to: "2026-11-21", state: "requested" }),
        own(leaveId(9), "2026-11-10", { cancellable: false, cancellation: null }),
        own(leaveId(3), "2026-11-25"),
        own(leaveId(4), "2026-12-01"),
        own(leaveId(5), "2026-12-10"),
      ],
    });
    const { ctx, slack } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(shortcut()));
    // One's own, from today on the workspace's clock.
    expect(hr.calls.find((call) => call.name === "requests")).toEqual({
      as: MINSU.id,
      name: "requests",
      input: { from: "2026-11-09", limit: 200 },
    });
    const view = viewOf(slack.of("views.open")[0]);
    const listed = view.blocks.filter((block) => block.accessory?.action_id === "cancel");
    expect(listed.map((block) => block.accessory?.value)).toEqual([1, 2, 3, 4, 5].map(leaveId));
    expect(listed[0]?.text?.text).toContain("*연차*");
    expect(listed[0]?.text?.text).toContain("오전 반차");
    expect(listed[0]?.text?.text).toContain("승인됨");
    expect(listed[1]?.text?.text).toContain("결재 대기");
    expect(view.blocks.some((block) => block.text?.text === "*예정된 내 휴가*")).toBe(true);
    const more = view.blocks.find((block) => block.elements?.[0]?.text.startsWith("외 1건"));
    expect(more?.elements?.[0]?.text).toBe(
      "외 1건 · <https://console.example.test/plugins/hr/leave|콘솔에서 모두 보기>",
    );
    // The list stands between what is left and the fields.
    const kindAt = view.blocks.findIndex((block) => block.block_id === "kind");
    expect(view.blocks[kindAt - 1]?.type).toBe("divider");
  });

  it("lists nothing where HR answers no requests, as before 0.3.0", async () => {
    const { ctx, slack } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(shortcut()));
    const view = viewOf(slack.of("views.open")[0]);
    expect(view.blocks.some((block) => block.accessory !== undefined)).toBe(false);
    expect(view.blocks.some((block) => block.type === "divider")).toBe(false);
  });

  it("pushes the form that cancels a leave, saying what cancelling it comes to", async () => {
    const hr = fakeHr({
      views: {
        [leaveId(1)]: own(leaveId(1), "2026-11-12", {
          cancellation: "decision",
          cancelDeciders: [JIHYE_BRIEF],
        }),
        [leaveId(2)]: own(leaveId(2), "2026-11-20"),
        [leaveId(3)]: own(leaveId(3), "2026-11-25", { cancellable: false, cancellation: null }),
      },
    });
    const { ctx, slack } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    expect((await slackEndpoint.run(ctx, signedRequest(cancelPress(leaveId(1))))).status).toBe(200);
    const push = slack.of("views.push")[0];
    expect(push?.params.trigger_id).toBe("trigger-3");
    const decision = viewOf(push);
    expect(decision.callback_id).toBe("leave-cancel");
    expect(JSON.parse(decision.private_metadata ?? "{}")).toEqual({ id: leaveId(1), kind: "comp" });
    expect(decision.title.text).toBe("휴가 취소");
    expect(decision.submit?.text).toBe("취소하기");
    expect(decision.close?.text).toBe("돌아가기");
    expect(decision.blocks[0]?.text?.text).toContain("*연차*");
    expect(decision.blocks[1]?.elements?.[0]?.text).toBe(
      "누르면 Lee Jihye 님의 결재를 거쳐 취소됩니다.",
    );
    expect(blockOf(decision, "reason")?.optional).toBe(true);
    expect(hr.calls.find((call) => call.name === "request-view")).toEqual({
      as: MINSU.id,
      name: "request-view",
      input: { id: leaveId(1) },
    });
    await slackEndpoint.run(ctx, signedRequest(cancelPress(leaveId(2))));
    expect(viewOf(slack.of("views.push")[1]).blocks[1]?.elements?.[0]?.text).toBe(
      "누르면 바로 취소됩니다.",
    );
    await slackEndpoint.run(ctx, signedRequest(cancelPress(leaveId(3))));
    const cannot = viewOf(slack.of("views.push")[2]);
    expect(cannot.blocks[1]?.elements?.[0]?.text).toBe("이 휴가는 지금 취소할 수 없습니다.");
    expect(cannot.submit).toBeUndefined();
    expect(blockOf(cannot, "reason")).toBeUndefined();
  });

  it("says a leave HR does not show the person is gone, and reads nothing for a value that is no id", async () => {
    const { ctx, slack, hr } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(cancelPress(leaveId(7))));
    const gone = viewOf(slack.of("views.push")[0]);
    expect(gone.title.text).toBe("휴가 취소");
    expect(gone.blocks[0]?.text?.text).toBe("이 휴가를 찾을 수 없습니다.");
    const before = hr.calls.length;
    await slackEndpoint.run(ctx, signedRequest(cancelPress("<!channel>")));
    expect(hr.calls).toHaveLength(before);
    expect(slack.of("views.push")).toHaveLength(1);
  });

  it("cancels the leave for whoever submitted, draws the form below again, and says it is done", async () => {
    const hr = fakeHr({
      requests: [own(leaveId(2), "2026-11-20")],
      cancel: (_, input) => ({
        text: "Cancelled.",
        request: own((input as { id: string }).id, "2026-11-12", {
          state: "cancelled",
          cancellable: false,
          cancellation: null,
        }),
        waiting: null,
      }),
    });
    const { ctx, slack } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(
      ctx,
      signedRequest(
        cancelSubmission(JSON.stringify({ id: leaveId(1), kind: "comp" }), "  Plans changed  "),
      ),
    );
    expect(hr.calls.find((call) => call.name === "cancel")).toEqual({
      as: MINSU.id,
      name: "cancel",
      input: { id: leaveId(1), reason: "Plans changed" },
    });
    const body = answer.body as { response_action: string; view: ViewJson };
    expect(body.response_action).toBe("update");
    expect(body.view.blocks[0]?.text?.text).toBe("취소했습니다.");
    expect(body.view.close?.text).toBe("닫기");
    // The form below, its list read again, on the kind it was on.
    const update = slack.of("views.update")[0];
    expect(update?.params.view_id).toBe("V0FORM001");
    const form = viewOf(update);
    expect(blockOf(form, "kind")?.element?.initial_option?.value).toBe("comp");
    expect(form.blocks.filter((block) => block.accessory !== undefined)).toHaveLength(1);
  });

  it("says a cancellation that waits for a decision, and whom it asks", async () => {
    const hr = fakeHr({
      cancel: (_, input) => ({
        text: "Asked.",
        request: own((input as { id: string }).id, "2026-11-12", {
          state: "cancelling",
          cancellable: false,
          cancellation: null,
          asked: [JIHYE_BRIEF],
        }),
        waiting: "0199b000-0000-7000-8000-00000000d003",
      }),
    });
    const { ctx } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(
      ctx,
      signedRequest(cancelSubmission(JSON.stringify({ id: leaveId(1) }), null)),
    );
    const body = answer.body as { view: ViewJson };
    expect(body.view.blocks[0]?.text?.text).toBe(
      "취소 결재를 올렸습니다. Lee Jihye 님이 결재합니다.",
    );
    expect(hr.calls.find((call) => call.name === "cancel")?.input).toEqual({ id: leaveId(1) });
  });

  it("says HR's refusal beside the reason, and draws nothing again", async () => {
    const hr = fakeHr({
      cancel: () => {
        throw new PluginRefusal("plugin.hr.hr_only", "인사 담당만 취소할 수 있습니다.");
      },
    });
    const { ctx, slack } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(
      ctx,
      signedRequest(cancelSubmission(JSON.stringify({ id: leaveId(1) }), null)),
    );
    expect(answer.body).toEqual({
      response_action: "errors",
      errors: { reason: "인사 담당만 취소할 수 있습니다." },
    });
    expect(slack.of("views.update")).toHaveLength(0);
  });

  it("cancels nothing for what the form did not carry, nor for a presser with no account", async () => {
    const cancelled: unknown[] = [];
    const hr = fakeHr({
      cancel: (_, input) => {
        cancelled.push(input);
        return {};
      },
    });
    const { ctx } = setup({ hr });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    for (const metadata of ["", "not json", JSON.stringify({ id: "../../etc" }), "[]"]) {
      const answer = await slackEndpoint.run(ctx, signedRequest(cancelSubmission(metadata, null)));
      expect(answer.body).toEqual({
        response_action: "errors",
        errors: { reason: "취소하지 못했습니다. 다시 시도하거나 콘솔에서 취소하세요." },
      });
    }
    const stranger = await slackEndpoint.run(
      ctx,
      signedRequest(cancelSubmission(JSON.stringify({ id: leaveId(1) }), null, "U0NOBODY1")),
    );
    expect(stranger.body).toMatchObject({ response_action: "errors" });
    expect(cancelled).toHaveLength(0);
  });
});

describe("a decision's button", () => {
  it("answers the decision for whoever pressed, by the option's key, and says nothing more", async () => {
    const { ctx, slack, answered } = setup();
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    const answer = await slackEndpoint.run(ctx, signedRequest(press("approve", DECISION)));
    expect(answer).toEqual({ status: 200 });
    expect(answered).toEqual([
      { decisionId: DECISION, answer: { optionKey: "approve" }, for: MINSU.id },
    ]);
    expect(slack.calls).toHaveLength(0);
  });

  it("tells the presser alone where the decision is not on their plate, or already answered", async () => {
    const { ctx, slack } = setup({
      answer: (decisionId) => {
        throw decisionId === DECISION
          ? new PluginRefusal("plugin.forbidden", "not on their plate")
          : new PluginRefusal(
              "plugin.invalid_args",
              "decision.answered: the decision has been answered",
            );
      },
    });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(press("reject", DECISION)));
    await slackEndpoint.run(
      ctx,
      signedRequest(press("approve", "0199b000-0000-7000-8000-00000000d002")),
    );
    const told = slack
      .of("response_url")
      .map((call) => call.json as { text: string; response_type: string });
    expect(told[0]).toMatchObject({ response_type: "ephemeral" });
    expect(told[0]?.text).toContain("https://console.example.test/decisions");
    expect(told[1]?.text).toBe("이미 답한 결정입니다.");
  });

  it("answers nothing for a presser with no account, nor for a value that is no decision", async () => {
    const { ctx, slack, answered } = setup();
    await connected(ctx);
    await slackEndpoint.run(
      ctx,
      signedRequest(press("approve", DECISION, RESPONSE_URL, "U0NOBODY1")),
    );
    expect(answered).toHaveLength(0);
    expect(slack.of("response_url")).toHaveLength(1);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(ctx, signedRequest(press("approve", "<!channel>")));
    expect(answered).toHaveLength(0);
  });

  it("never follows an address of the press's that is not Slack's", async () => {
    const { ctx, slack } = setup({
      answer: () => {
        throw new PluginRefusal("plugin.forbidden", "not on their plate");
      },
    });
    await connected(ctx);
    await linked(ctx, MINSU, "U0MINSU01");
    await slackEndpoint.run(
      ctx,
      signedRequest(press("approve", DECISION, "https://attacker.example/collect")),
    );
    expect(slack.of("response_url")).toHaveLength(0);
  });
});
