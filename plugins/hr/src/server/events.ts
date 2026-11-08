// The events the plugin emits, in one place: its contract with the plugins that read them
// (ADR-0010), written in README.md, "The contract", and held to it by contract.test.ts. An event is
// thin, ids and nothing a reader may not see: whoever hears it asks for the rest through the
// plugin's api, under its own roles, so that a reason reaches only those it is for.
import type { PluginContext } from "@skillcdn/console/plugin";

/** Each kind with the fields of its data, in the order README.md lists them. */
export const EVENTS = {
  "leave-requested": ["requestId", "personId"],
  "leave-recorded": ["requestId", "personId", "by"],
  "leave-advanced": ["requestId", "personId"],
  "leave-approved": ["requestId", "personId"],
  "leave-rejected": ["requestId", "personId"],
  "leave-returned": ["requestId", "personId"],
  "leave-cancelling": ["requestId", "personId"],
  "leave-cancelled": ["requestId", "personId"],
  "leave-kept": ["requestId", "personId"],
  "balance-adjusted": ["personId", "entryId"],
  "person-changed": ["personId"],
  "policy-changed": ["key"],
  "type-changed": ["key"],
  "holidays-changed": ["year"],
  "config-changed": ["fields"],
  "announcement-published": ["id"],
  "announcement-changed": ["id"],
} as const;

export type EventKind = keyof typeof EVENTS;

type FieldOf<K extends EventKind> = (typeof EVENTS)[K][number];

/** What a field holds: an id or a key is a text, the year a number, the fields a list of names. */
type ValueOf<F extends string> = F extends "year" ? number : F extends "fields" ? string[] : string;

export type EventData<K extends EventKind> = { readonly [F in FieldOf<K>]: ValueOf<F> };

/** Emits an event of the contract, its data no more and no less than the contract names. */
export async function emit<K extends EventKind>(
  ctx: PluginContext,
  kind: K,
  data: EventData<K>,
): Promise<void> {
  await ctx.events.emit(kind, data);
}
