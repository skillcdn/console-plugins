// What other plugins may call, with `plugins:hr` (ADR-0010): each entry runs the function a command
// or a query runs, under the caller's roles as the console passes them through, and offers nothing
// those do not. A person's call through another plugin is the person's; a plugin calling as itself
// holds the roles granted to it here and is no person, so that what only a person does it is
// refused. Written in README.md, "The contract", and held to it by contract.test.ts.
import {
  type ApiDefinition,
  type PluginContext,
  PluginError,
  type PluginRecord,
  z,
} from "@skillcdn/console/plugin";
import {
  type BalanceReport,
  type LeaveRequest,
  type LeaveType,
  PARTS,
  type PersonBrief,
  type RequestPreview,
  type RequestView,
} from "../../shared/contracts.js";
import { ROLE_HR, ROLE_MEMBER } from "../access.js";
import { day, slug, wordsOf } from "../collections.js";
import { serverWords } from "../words.js";
import { cancel, request } from "./commands.js";
import { balance, preview, requestViewOf, typesQuery } from "./queries.js";

const id = z.string().min(1).max(64);

/** What a request asks, as another plugin sends it: the arguments of `request` and `preview`. */
const asking = z.object({
  from: day,
  to: z.optional(day),
  type: z.optional(slug),
  part: z.optional(wordsOf(PARTS)),
  reason: z.optional(z.string().max(2000)),
  /** Whose leave, by their id, for whoever records it for them; the caller's unless said. */
  personId: z.optional(id),
});

const INPUTS = {
  "request-view": z.object({ id }),
  types: z.object({}),
  balance: z.object({
    personId: z.optional(id),
    on: z.optional(day),
    buckets: z.optional(z.boolean()),
  }),
  preview: asking,
  request: asking,
  cancel: z.object({ id, reason: z.optional(z.string().max(2000)) }),
};

/** What `request` and `cancel` answer: the line the command prints, the request, and the decision it waits for. */
export interface ApiOutcome {
  readonly text: string;
  readonly request: RequestView;
  readonly waiting: string | null;
}

/** Refuses a caller who holds no role here, as the console refuses a command to one. */
function requireRole(ctx: PluginContext): void {
  if (!ctx.caller.roles.some((role) => role === ROLE_MEMBER || role === ROLE_HR)) {
    throw new PluginError("forbidden", serverWords(ctx.language).refused.noRole);
  }
}

/** A person by id, as an argument of a command hands one over: someone of the workspace. */
async function personBy(ctx: PluginContext, personId: string): Promise<PersonBrief> {
  let found: Awaited<ReturnType<PluginContext["console"]["people"]["get"]>> = null;
  try {
    found = await ctx.console.people.get(personId);
  } catch {
    found = null;
  }
  if (found === null) {
    throw new PluginError("unknown_person", serverWords(ctx.language).refused.unknownPerson);
  }
  return { id: found.id, login: found.login, name: found.name };
}

/** The arguments of `request` and `preview` from what another plugin sent. */
async function askedOf(ctx: PluginContext, input: z.infer<typeof asking>) {
  return {
    from: input.from,
    to: input.to,
    type: input.type,
    part: input.part,
    reason: input.reason,
    person: input.personId === undefined ? undefined : await personBy(ctx, input.personId),
  };
}

function entry<S extends z.ZodObject>(
  about: string,
  input: S,
  run: (ctx: PluginContext, input: z.infer<S>) => Promise<unknown>,
): ApiDefinition<S> {
  return {
    about,
    input,
    async run(ctx, raw) {
      requireRole(ctx);
      return run(ctx, input.parse(raw));
    },
  };
}

export const api = {
  "request-view": entry(
    "One request in full, as the query request-view answers it.",
    INPUTS["request-view"],
    async (ctx, input): Promise<RequestView> => requestViewOf(ctx, input.id),
  ),
  types: entry(
    "The kinds of leave that may be requested, as the query types answers them.",
    INPUTS.types,
    async (ctx) => (await typesQuery.run(ctx, {})) as LeaveType[],
  ),
  balance: entry(
    "The days left by kind, as the query balance answers them.",
    INPUTS.balance,
    async (ctx, input) =>
      (await balance.run(ctx, {
        person: input.personId === undefined ? undefined : await personBy(ctx, input.personId),
        on: input.on,
        buckets: input.buckets,
      })) as BalanceReport,
  ),
  preview: entry(
    "What a request would come to, as the query preview answers it.",
    INPUTS.preview,
    async (ctx, input) => (await preview.run(ctx, await askedOf(ctx, input))) as RequestPreview,
  ),
  request: entry(
    "Requests leave as the command request does; never recorded as approved outright.",
    INPUTS.request,
    async (ctx, input): Promise<ApiOutcome> => {
      const result = await request.run(ctx, await askedOf(ctx, input));
      const record = result.data as PluginRecord<LeaveRequest>;
      return {
        text: result.text,
        request: await requestViewOf(ctx, record.id),
        waiting: result.waiting ?? null,
      };
    },
  ),
  cancel: entry(
    "Cancels a request as the command cancel does.",
    INPUTS.cancel,
    async (ctx, input): Promise<ApiOutcome> => {
      const result = await cancel.run(ctx, { id: input.id, reason: input.reason });
      return {
        text: result.text,
        request: await requestViewOf(ctx, input.id),
        waiting: result.waiting ?? null,
      };
    },
  ),
};
