// What Slack posts when someone presses, answered within the request alone (ADR-0011): nothing
// before the signature; the leave form opened for whoever pressed, with what HR says for them; the
// submission requested for them, HR's refusal said beside the field; a decision's button answered
// for the presser, on their plate alone, a refusal told to them through the press's own address.
import { PluginRefusal } from "@skillcdn/console/plugin";
import { describe, expect, it } from "vitest";
import { slackEndpoint } from "./index.js";
import { connected, fakeHr, linked, MINSU, NOW, setup, signedRequest, TEAM } from "./test-fakes.js";

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
  part: { value: { type: "static_select", selected_option: null } },
  reason: { value: { type: "plain_text_input", value: "Family trip" } },
  ...extra,
});

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
    const view = JSON.parse(open?.params.view ?? "{}") as {
      callback_id: string;
      title: { text: string };
      blocks: {
        block_id?: string;
        element?: { options?: { value: string }[] };
        elements?: { text: string }[];
      }[];
    };
    expect(view.callback_id).toBe("leave-request");
    expect(view.title.text).toBe("휴가 신청");
    expect(view.blocks[0]?.element?.options?.map((option) => option.value)).toEqual([
      "annual",
      "sick",
    ]);
    expect(view.blocks.at(-1)?.elements?.[0]?.text).toContain("연차 12.5일");
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
            part: { value: { type: "static_select", selected_option: { value: "evening" } } },
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
