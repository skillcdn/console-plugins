// The endpoint Slack posts to when someone presses: the shortcut, a choice or a cancel button
// within the form, a form submitted or closed, a decision's button. It answers the request and
// nothing else (ADR-0011): the signature verified first, the presser matched to a person by their
// account, the form opened, drawn again, pushed or checked for them, the decision answered for
// them where it is on their plate. A refusal reaches the presser alone, through the address the
// press carried. What others read follows from the producer's events.
import {
  defineEndpoint,
  type EndpointResponse,
  type PluginContext,
} from "@skillcdn/console/plugin";
import type { Language } from "../../shared/contracts.js";
import { refusalCode } from "../integrations/hr/contract.js";
import { CANCEL_FORM } from "../integrations/hr/form.js";
import {
  onFormPress,
  openLeaveForm,
  type Presser,
  redrawAfterCancel,
  submitCancel,
  submitLeave,
} from "../integrations/hr/requests.js";
import { languageOfPerson, workspaceLanguage } from "../people.js";
import { connectionOf, isConnected, linkOfMember } from "../store.js";
import { serverWords } from "../words.js";
import { outbound } from "./api.js";
import { link } from "./blocks.js";
import { LEAVE_SHORTCUT } from "./manifest.js";
import {
  type ActionsPayload,
  actionsPayload,
  closedPayload,
  isResponseUrl,
  payloadKind,
  shortcutPayload,
  submissionPayload,
  teamOf,
} from "./payloads.js";
import { verifiedFromSlack } from "./signature.js";

const OK: EndpointResponse = { status: 200 };
const JSON_TYPE = { "content-type": "application/json" } as const;
const DECISION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The person who pressed, by their account, with the language they read in; none where unmatched. */
async function presserOf(
  ctx: PluginContext,
  memberId: string,
  fallback: Language,
): Promise<Presser | null> {
  const found = await linkOfMember(ctx, memberId);
  if (found === null) {
    return null;
  }
  return {
    personId: found.data.personId,
    language: await languageOfPerson(ctx, found.data.personId, fallback),
  };
}

/** Says something to the presser alone, through the address their press carried. */
async function tellPresser(
  ctx: PluginContext,
  url: string | undefined,
  text: string,
): Promise<void> {
  if (url === undefined || !isResponseUrl(url)) {
    return;
  }
  try {
    await outbound(ctx, url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
    });
  } catch (error) {
    ctx.log.warn("a refusal could not reach the presser", {
      code: refusalCode(error),
    });
  }
}

/** A decision's button: the answer given for the presser, on their own plate alone. */
async function onActions(
  ctx: PluginContext,
  payload: ActionsPayload,
  presser: Presser | null,
  language: Language,
): Promise<void> {
  const action = payload.actions.find(
    (candidate) => candidate.action_id === "approve" || candidate.action_id === "reject",
  );
  if (action === undefined || action.value === undefined || !DECISION.test(action.value)) {
    return;
  }
  const words = serverWords(presser?.language ?? language);
  if (presser === null) {
    await tellPresser(ctx, payload.response_url, words.form.notLinked);
    return;
  }
  try {
    await ctx.console.decisions.answer(
      action.value,
      { optionKey: action.action_id },
      { for: presser.personId },
    );
  } catch (error) {
    const code = refusalCode(error);
    const message = error instanceof Error ? error.message : "";
    const workspace = await ctx.console.workspace().catch(() => null);
    const decisions =
      workspace?.url === null || workspace?.url === undefined
        ? words.decisions
        : link(`${workspace.url}/decisions`, words.decisions);
    const said =
      code === "plugin.invalid_args" && message.includes("decision.answered")
        ? words.press.answered
        : code === "plugin.forbidden" || code === "plugin.not_found"
          ? words.press.notYours(decisions)
          : words.press.failed;
    if (said === words.press.failed) {
      ctx.log.warn("an answer from Slack did not go through", { code });
    }
    await tellPresser(ctx, payload.response_url, said);
  }
}

export const slackEndpoint = defineEndpoint({
  auth: "webhook",
  methods: ["POST"],
  headers: ["x-slack-signature", "x-slack-request-timestamp"],
  async run(ctx, request) {
    if (!(await verifiedFromSlack(ctx, request.headers, request.body))) {
      return { status: 401, headers: JSON_TYPE, body: { error: "invalid_signature" } };
    }
    const raw = new URLSearchParams(request.body).get("payload");
    let json: unknown;
    try {
      json = raw === null ? null : JSON.parse(raw);
    } catch {
      json = null;
    }
    const kind = payloadKind.safeParse(json);
    if (!kind.success) {
      return { status: 400, headers: JSON_TYPE, body: { error: "no_payload" } };
    }
    const connection = await connectionOf(ctx);
    if (!isConnected(connection)) {
      return OK;
    }
    // Whoever the console knows no language of reads the workspace's, else the app's.
    const language = (await workspaceLanguage(ctx)) ?? connection.data.language;
    switch (kind.data.type) {
      case "shortcut": {
        const payload = shortcutPayload.safeParse(json);
        if (
          !payload.success ||
          payload.data.callback_id !== LEAVE_SHORTCUT ||
          teamOf(payload.data) !== connection.data.teamId
        ) {
          return OK;
        }
        const presser = await presserOf(ctx, payload.data.user.id, language);
        try {
          await openLeaveForm(ctx, payload.data, presser, language);
        } catch (error) {
          ctx.log.warn("the leave form did not open", { code: refusalCode(error) });
        }
        return OK;
      }
      case "view_submission": {
        const payload = submissionPayload.safeParse(json);
        const form = payload.success ? payload.data.view.callback_id : null;
        if (
          !payload.success ||
          (form !== LEAVE_SHORTCUT && form !== CANCEL_FORM) ||
          teamOf(payload.data) !== connection.data.teamId
        ) {
          return OK;
        }
        const presser = await presserOf(ctx, payload.data.user.id, language);
        const answer =
          form === CANCEL_FORM
            ? await submitCancel(ctx, payload.data, presser, language)
            : await submitLeave(ctx, payload.data, presser, language);
        return answer.response_action === "clear"
          ? OK
          : { status: 200, headers: JSON_TYPE, body: answer };
      }
      case "view_closed": {
        const payload = closedPayload.safeParse(json);
        if (
          !payload.success ||
          payload.data.view.callback_id !== CANCEL_FORM ||
          teamOf(payload.data) !== connection.data.teamId
        ) {
          return OK;
        }
        const presser = await presserOf(ctx, payload.data.user.id, language);
        try {
          await redrawAfterCancel(ctx, payload.data, presser);
        } catch (error) {
          ctx.log.warn("the leave form was not drawn again", { code: refusalCode(error) });
        }
        return OK;
      }
      case "block_actions": {
        const payload = actionsPayload.safeParse(json);
        if (!payload.success || teamOf(payload.data) !== connection.data.teamId) {
          return OK;
        }
        const presser = await presserOf(ctx, payload.data.user.id, language);
        if (payload.data.view?.callback_id === LEAVE_SHORTCUT) {
          try {
            await onFormPress(ctx, payload.data, presser);
          } catch (error) {
            ctx.log.warn("the leave form did not follow the press", { code: refusalCode(error) });
          }
          return OK;
        }
        await onActions(ctx, payload.data, presser, language);
        return OK;
      }
      default:
        return OK;
    }
  },
});
