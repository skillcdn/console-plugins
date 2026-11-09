// What the messenger knows of HR, and nothing more: the versions of HR it was written against,
// the role it asks there, and the shapes of what HR's api answers, as HR's README ("The
// contract") writes them, read with a schema at the edge since they come from another plugin.
// The thread reads a request as the plugin itself, with the role granted to it; the form reads
// and requests for the person who pressed, as that person.
import {
  isPluginRefusal,
  type OtherPlugin,
  type PluginContext,
  satisfiesRange,
  z,
} from "@skillcdn/console/plugin";
import type { HrState } from "../../../shared/contracts.js";

export const HR = "hr";
/**
 * The versions of HR whose contract this module reads (ADR-0010): 0.3.0 changed how HR cancels
 * approved leave, kept its events and option keys and only added to its api, so it is read as 0.2.
 */
export const HR_VERSIONS = ">=0.2.0 <0.4.0";
/** The role the messenger asks of HR, to read a request whole for its thread. */
export const HR_ROLE = "hr";
export const HR_CAPABILITY = `plugins:${HR}`;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const personBrief = z.object({
  id: z.string().min(1).max(64),
  login: z.string().max(320),
  name: z.string().max(200).nullable(),
});
export type HrPerson = z.infer<typeof personBrief>;

export const PARTS = ["none", "am", "pm", "q1", "q2", "q3", "q4"] as const;
export type Part = (typeof PARTS)[number];
export type Unit = "day" | "half" | "quarter";

/** The parts of a day a kind offers beside the whole day, as HR's `partsOf` has them. */
export function partsOfUnit(unit: Unit): readonly Part[] {
  if (unit === "day") {
    return [];
  }
  return unit === "half" ? ["am", "pm"] : ["am", "pm", "q1", "q2", "q3", "q4"];
}

export const requestView = z.object({
  id: z.string().min(1).max(64),
  person: personBrief,
  request: z.object({
    type: z.string().max(64),
    from: day,
    to: day,
    part: z.enum(PARTS),
    days: z.number(),
    reason: z.string().max(8000),
    state: z.enum(["requested", "approved", "rejected", "returned", "cancelling", "cancelled"]),
    late: z.boolean(),
    note: z.string().max(8000).nullable(),
    decisionId: z.string().max(64).nullable(),
    cancelDecisionId: z.string().max(64).nullable(),
  }),
  recordedBy: personBrief.nullable(),
  decidedBy: personBrief.nullable(),
  line: z
    .array(
      z.object({
        deciders: z.array(personBrief).max(500),
        approvedBy: z.array(personBrief).max(500),
        state: z.enum(["done", "waiting", "ahead"]),
      }),
    )
    .max(50),
  asked: z.array(personBrief).max(500),
});
export type RequestView = z.infer<typeof requestView>;

/** Whether a request of a kind asks for a reason: `hidden` keeps none. */
export const REASON_RULES = ["optional", "required", "hidden"] as const;
export type ReasonRule = (typeof REASON_RULES)[number];

const leaveKind = z.object({
  key: z.string().min(1).max(64),
  name: z.record(z.string(), z.string().max(200)),
  unit: z.enum(["day", "half", "quarter"]),
  order: z.number().optional(),
  reason: z.enum(REASON_RULES).optional(),
  /** Whether it may be requested; HR answers a person the enabled kinds alone. */
  enabled: z.boolean().optional(),
  /** Its rules in a sentence of the caller's language, from HR 0.3.0. */
  summary: z.string().max(4000).optional(),
});
export const leaveKinds = z.array(leaveKind).max(200);
export type LeaveKind = z.infer<typeof leaveKind>;

export const balanceReport = z.object({
  leave: z.boolean(),
  types: z
    .array(
      z.object({
        type: z.string().max(64),
        name: z.record(z.string(), z.string().max(200)),
        balance: z.enum(["annual", "own", "none"]),
        available: z.number(),
      }),
    )
    .max(200),
});
export type BalanceReport = z.infer<typeof balanceReport>;

/** What `request` answers: the request as `request-view` answers it, and what waits. */
export const requestOutcome = z.object({ request: z.object({ id: z.string().min(1).max(64) }) });

/** HR as this plugin reaches it, or none where its api is not turned on or HR is not there. */
export async function hrOf(ctx: PluginContext): Promise<OtherPlugin | null> {
  if (!ctx.plugin.capabilities.includes(HR_CAPABILITY)) {
    return null;
  }
  try {
    return await ctx.plugins.get(HR);
  } catch {
    return null;
  }
}

/** The console's code of a refusal, or none for anything else. */
export function refusalCode(error: unknown): string | null {
  if (isPluginRefusal(error)) {
    return error.code;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/** Whether a refusal says the plugin called is not there to answer: off, gone or failing. */
export function isAbsent(error: unknown): boolean {
  const code = refusalCode(error);
  return code === "plugin.disabled" || code === "plugin.not_found" || code === "plugin.unavailable";
}

/** How HR stands: reachable in a version this module reads, off, or out of reach. */
export async function hrState(
  ctx: PluginContext,
): Promise<{ readonly state: HrState; readonly version: string | null }> {
  if (!ctx.plugin.capabilities.includes(HR_CAPABILITY)) {
    return { state: "no_capability", version: null };
  }
  const hr = await hrOf(ctx);
  if (hr === null) {
    return { state: "off", version: null };
  }
  if (!satisfiesRange(hr.version, HR_VERSIONS)) {
    return { state: "outside", version: hr.version };
  }
  try {
    await hr.api.types?.({});
  } catch (error) {
    if (isAbsent(error)) {
      return { state: "off", version: hr.version };
    }
  }
  return { state: "on", version: hr.version };
}

/** Whether the role the messenger asks of HR was granted to it. */
export function hrGranted(ctx: PluginContext): boolean {
  return ctx.plugin.grants.some((grant) => grant.plugin === HR && grant.role === HR_ROLE);
}

/** One request whole, read by the plugin as itself with the role granted to it. */
export async function readRequest(hr: OtherPlugin, id: string): Promise<RequestView> {
  const call = hr.api["request-view"];
  if (call === undefined) {
    throw new Error("hr answers no request-view");
  }
  return requestView.parse(await call({ id }));
}

/** The kinds of leave, for names: read as whoever the plugin is called for. */
export async function readKinds(hr: OtherPlugin): Promise<LeaveKind[]> {
  const call = hr.api.types;
  if (call === undefined) {
    return [];
  }
  return leaveKinds.parse(await call({}));
}

/** A name for people by language, English where the language has none, the key at the last. */
export function nameIn(
  names: Readonly<Record<string, string>>,
  language: string,
  key: string,
): string {
  return names[language] ?? names[language.split("-")[0] ?? language] ?? names.en ?? key;
}
