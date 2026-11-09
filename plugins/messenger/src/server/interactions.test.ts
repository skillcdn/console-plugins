// What Slack posts when someone presses, answered within the request alone (ADR-0011): nothing
// before the signature; the leave form opened for whoever pressed, with what HR says for them; the
// submission requested for them, HR's refusal said beside the field; a decision's button answered
// for the presser, on their plate alone, a refusal told to them through the press's own address.
import { PluginRefusal } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import { slackEndpoint } from "./index.js";
import {
  connected,
  fakeHr,
  fakeSlack,
  linked,
  MINSU,
  NOW,
  setup,
  signedRequest,
  TEAM,
} from "./test-fakes.js";

const DECISION = "0199b000-0000-7000-8000-00000000d001";
const RESPONSE_URL = "https://hooks.slack.com/actions/T0TEST01/1/abc";

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
  readonly title: { readonly text: string };
  readonly blocks: readonly {
    readonly type: string;
    readonly block_id?: string;
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
    expect(view.title.text).toBe("휴가 신청");
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
