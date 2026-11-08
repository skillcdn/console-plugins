// What Slack posts to the endpoint when someone presses, as Slack's interactivity sends it: a form
// field `payload` holding JSON. Read with a schema once the signature is verified, each field
// bounded, and nothing taken from it but what the design reads: who pressed, in which workspace,
// what they pressed, and what they filled in.
import { z } from "@skillcdn/console/plugin";

const slackId = z.string().min(1).max(40);

const user = z.object({ id: slackId, team_id: slackId.optional() });
const team = z.object({ id: slackId }).nullable().optional();

export const payloadKind = z.object({ type: z.string().max(40) });

export const shortcutPayload = z.object({
  type: z.literal("shortcut"),
  callback_id: z.string().max(255),
  trigger_id: z.string().min(1).max(255),
  user,
  team,
});
export type ShortcutPayload = z.infer<typeof shortcutPayload>;

const stateValue = z.object({
  type: z.string().max(40),
  value: z.string().max(4000).nullable().optional(),
  selected_date: z.string().max(10).nullable().optional(),
  selected_option: z
    .object({ value: z.string().max(150) })
    .nullable()
    .optional(),
});

export const submissionPayload = z.object({
  type: z.literal("view_submission"),
  user,
  team,
  view: z.object({
    callback_id: z.string().max(255),
    state: z.object({
      values: z.record(z.string().max(255), z.record(z.string().max(255), stateValue)),
    }),
  }),
});
export type SubmissionPayload = z.infer<typeof submissionPayload>;
export type StateValues = SubmissionPayload["view"]["state"]["values"];

export const actionsPayload = z.object({
  type: z.literal("block_actions"),
  user,
  team,
  response_url: z.string().max(1000).optional(),
  actions: z
    .array(
      z.object({
        action_id: z.string().max(255),
        value: z.string().max(2000).optional(),
      }),
    )
    .max(25),
});
export type ActionsPayload = z.infer<typeof actionsPayload>;

/** The workspace a payload came from: the presser's, else the payload's. */
export function teamOf(payload: {
  readonly user: { readonly team_id?: string | undefined };
  readonly team?: { readonly id: string } | null | undefined;
}): string | null {
  return payload.user.team_id ?? payload.team?.id ?? null;
}

/** Only Slack's own address for an answer to a press is followed, over https. */
export function isResponseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "hooks.slack.com";
  } catch {
    return false;
  }
}
