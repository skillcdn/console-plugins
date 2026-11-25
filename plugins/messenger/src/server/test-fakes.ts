// For the tests alone, never imported by the module: a Slack that answers what a test gives it,
// keeps every call and seals what a call asks as the console would, so that a test reads the
// sealed outcome and never a secret; an HR that answers as its contract says, for itself or for a
// person; the console's people; and a context of the console around them, with a signed request
// from Slack as a test sends one. Every value here is invented.
import { createHmac } from "node:crypto";
import type {
  PluginCaller,
  PluginFetchInit,
  PluginFetchResponse,
  SealOutcome,
} from "@skillcdn/console/plugin";
import { PluginRefusal } from "@skillcdn/console/plugin";
import { createTestContext, type TestContext } from "@skillcdn/console/plugin/testing";
import { collections } from "./collections.js";

export const NOW = new Date("2026-11-09T01:00:00Z");
export const PUBLIC_URL = "https://console.example.test";
export const SIGNING = "test-signing-value-0001";
export const TEAM = "T0TEST01";

export interface SlackCall {
  readonly method: string;
  readonly url: string;
  readonly params: Readonly<Record<string, string>>;
  readonly json: unknown;
  readonly secrets: readonly {
    readonly name: string;
    readonly key?: string | undefined;
    readonly as: string;
  }[];
  readonly seal: Readonly<Record<string, unknown>> | undefined;
}

/** What a fake method answers: Slack's JSON, or a status of its own with headers. */
export type SlackReply =
  | Record<string, unknown>
  | {
      readonly status: number;
      readonly headers?: Readonly<Record<string, string>>;
      readonly body?: unknown;
    };

function answer(
  status: number,
  headers: Readonly<Record<string, string>>,
  body: unknown,
  sealed?: Readonly<Record<string, SealOutcome>>,
): PluginFetchResponse {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    headers,
    bytes: new TextEncoder().encode(text),
    ...(sealed === undefined ? {} : { sealed }),
    text: () => text,
    json: () => JSON.parse(text) as unknown,
  };
}

/** The value at a path of an answer (`$.team.id`), and the object that holds it. */
function at(
  body: Record<string, unknown>,
  path: string,
): { readonly parent: Record<string, unknown> | undefined; readonly last: string } {
  const parts = path.replace(/^\$\.?/, "").split(".");
  let parent: Record<string, unknown> | undefined = body;
  for (const part of parts.slice(0, -1)) {
    const next: unknown = parent?.[part];
    parent =
      typeof next === "object" && next !== null ? (next as Record<string, unknown>) : undefined;
  }
  return { parent, last: parts.at(-1) ?? "" };
}

/**
 * Seals what `seal` names as the console does: the value out, `[sealed]` in its place; a keyed
 * secret's key read from the same answer, `no_key` where it is not there. An outcome a test gives
 * stands in for the console's (`too_many`, say).
 */
function sealed(
  body: unknown,
  seal: Readonly<Record<string, unknown>>,
  forced: Readonly<Record<string, SealOutcome>>,
): { readonly body: unknown; readonly outcomes: Record<string, SealOutcome> } {
  const copy = structuredClone(body) as Record<string, unknown>;
  const outcomes: Record<string, SealOutcome> = {};
  for (const [name, spec] of Object.entries(seal)) {
    const path = typeof spec === "string" ? spec : (spec as { path: string }).path;
    const key = typeof spec === "string" ? undefined : (spec as { key?: string }).key;
    const { parent, last } = at(copy, path);
    const value = parent?.[last];
    const keyFound =
      key === undefined || !key.startsWith("$")
        ? true
        : (() => {
            const place = at(copy, key);
            const found = place.parent?.[place.last];
            return typeof found === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(found);
          })();
    const force = forced[name];
    if (force !== undefined && parent !== undefined && value !== undefined) {
      outcomes[name] = force;
      parent[last] = force === "sealed" ? "[sealed]" : "[withheld]";
    } else if (parent === undefined || value === undefined || value === null || value === "") {
      outcomes[name] = "absent";
    } else if (!keyFound) {
      outcomes[name] = "no_key";
      parent[last] = "[withheld]";
    } else if (typeof value !== "string") {
      outcomes[name] = "not_a_string";
      parent[last] = "[withheld]";
    } else {
      outcomes[name] = "sealed";
      parent[last] = "[sealed]";
    }
  }
  return { body: copy, outcomes };
}

/** A Slack for a test: the methods it gives, the usual answers for the rest, every call kept. */
export function fakeSlack(
  given: Readonly<Record<string, (params: Readonly<Record<string, string>>) => SlackReply>> = {},
  options: { readonly sealed?: Readonly<Record<string, SealOutcome>> } = {},
) {
  const calls: SlackCall[] = [];
  let counter = 1000;
  let conversations = 0;
  const usual: Record<string, (params: Readonly<Record<string, string>>) => SlackReply> = {
    "chat.postMessage": (params) => {
      counter += 1;
      return { ok: true, channel: params.channel, ts: `1794186${counter}.000100` };
    },
    "chat.update": (params) => ({ ok: true, channel: params.channel, ts: params.ts }),
    "conversations.open": (params) => {
      conversations += 1;
      const several = (params.users ?? "").includes(",");
      return { ok: true, channel: { id: `${several ? "G" : "D"}0CONV${conversations}` } };
    },
    "views.open": () => ({ ok: true }),
  };
  const fetch = async (url: string, init?: PluginFetchInit): Promise<PluginFetchResponse> => {
    const slackApi = "https://slack.com/api/";
    const method = url.startsWith(slackApi) ? url.slice(slackApi.length) : "response_url";
    const text =
      typeof init?.body === "string"
        ? init.body
        : init?.body === undefined
          ? ""
          : new TextDecoder().decode(init.body);
    const params = method === "response_url" ? {} : Object.fromEntries(new URLSearchParams(text));
    let json: unknown = null;
    if (method === "response_url") {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    calls.push({
      method,
      url,
      params,
      json,
      secrets: [...(init?.secret === undefined ? [] : [init.secret]), ...(init?.secrets ?? [])],
      seal: init?.seal,
    });
    const handler = given[method] ?? usual[method] ?? (() => ({ ok: true }));
    const reply = handler(params);
    const own =
      typeof (reply as { status?: unknown }).status === "number" && !("ok" in reply)
        ? (reply as { status: number; headers?: Record<string, string>; body?: unknown })
        : null;
    const status = own?.status ?? 200;
    const headers = own?.headers ?? { "content-type": "application/json" };
    const body = own === null ? reply : own.body;
    if (init?.seal !== undefined && typeof body === "object" && body !== null) {
      const done = sealed(body, init.seal, options.sealed ?? {});
      return answer(status, headers, done.body, done.outcomes);
    }
    return answer(status, headers, body);
  };
  return {
    fetch,
    calls,
    of: (method: string) => calls.filter((call) => call.method === method),
  };
}

export type FakeSlack = ReturnType<typeof fakeSlack>;

export interface FakePerson {
  readonly id: string;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly language: string | null;
  readonly status?: "active" | "deactivated";
  readonly managerId?: string | null;
}

/** A person as the console hands one to a plugin. */
export function restPerson(person: FakePerson) {
  return {
    id: person.id,
    login: person.login,
    name: person.name,
    avatar: null,
    role: "member" as const,
    status: person.status ?? ("active" as const),
    source: "organization" as const,
    deactivatedAt: null,
    managerId: person.managerId ?? null,
    teams: [],
    language: person.language,
    email: person.email,
  };
}

export const MINSU: FakePerson = {
  id: "0199a000-0000-7000-8000-000000000001",
  login: "minsu@acme.example",
  name: "Kim Minsu",
  email: "minsu@acme.example",
  language: "ko",
};
export const JIHYE: FakePerson = {
  id: "0199a000-0000-7000-8000-000000000002",
  login: "jihye@acme.example",
  name: "Lee Jihye",
  email: "jihye@acme.example",
  language: "en",
};
export const HANA: FakePerson = {
  id: "0199a000-0000-7000-8000-000000000003",
  login: "hana@acme.example",
  name: "Park Hana",
  email: "hana@acme.example",
  language: "ko",
};
export const NOMAIL: FakePerson = {
  id: "0199a000-0000-7000-8000-000000000004",
  login: "octo",
  name: "Octo",
  email: null,
  language: null,
};

export const KEEPER: PluginCaller = {
  kind: "person",
  person: { id: JIHYE.id, login: JIHYE.login, name: JIHYE.name, language: "en", admin: false },
  agent: null,
  roles: ["messenger"],
  run: null,
  project: null,
};

/** Whoever keeps the messenger, reading in Korean. */
export const KEEPER_KO: PluginCaller = {
  kind: "person",
  person: { id: MINSU.id, login: MINSU.login, name: MINSU.name, language: "ko", admin: false },
  agent: null,
  roles: ["messenger"],
  run: null,
  project: null,
};

export const STRANGER: PluginCaller = {
  kind: "person",
  person: { id: HANA.id, login: HANA.login, name: HANA.name, language: "ko", admin: false },
  agent: null,
  roles: [],
  run: null,
  project: null,
};

export const CONSOLE: PluginCaller = { kind: "console", roles: ["messenger"], project: null };

/** A member, who holds the role every member holds and no other. */
export const MEMBER_MINSU: PluginCaller = {
  kind: "person",
  person: { id: MINSU.id, login: MINSU.login, name: MINSU.name, language: "ko", admin: false },
  agent: null,
  roles: ["member"],
  run: null,
  project: null,
};

/** Another member, reading in English. */
export const MEMBER_JIHYE: PluginCaller = {
  kind: "person",
  person: { id: JIHYE.id, login: JIHYE.login, name: JIHYE.name, language: "en", admin: false },
  agent: null,
  roles: ["member"],
  run: null,
  project: null,
};

/** HR as its contract answers, for itself or for a person, every call kept. */
export function fakeHr(
  options: {
    readonly version?: string;
    readonly views?: Record<string, unknown>;
    readonly request?: (personId: string | null, input: unknown) => unknown;
    readonly absent?: boolean;
    /** Whether HR keeps leave for the person: not, and their balance says `leave: false`. */
    readonly enrolled?: boolean;
    /** One's requests as HR 0.3.0's `requests` answers them; HR has no `requests` unless given. */
    readonly requests?: readonly unknown[];
    /** HR 0.3.0's `cancel`, for a person; HR has no `cancel` unless given. */
    readonly cancel?: (personId: string | null, input: unknown) => unknown;
  } = {},
) {
  const calls: { readonly as: string | null; readonly name: string; readonly input: unknown }[] =
    [];
  const views = options.views ?? {};
  // In HR's order: a kind in whole days that asks a reason first, annual leave in quarters, one in
  // halves that keeps no reason, and one disabled, which HR answers a person never.
  const kinds = [
    {
      key: "sick",
      name: { en: "Sick leave", ko: "병가" },
      unit: "day",
      reason: "required",
      order: 1,
      enabled: true,
      summary: "Sick leave rules, in a sentence.",
    },
    {
      key: "annual",
      name: { en: "Annual leave", ko: "연차" },
      unit: "quarter",
      reason: "optional",
      order: 2,
      enabled: true,
      summary: "Annual leave rules, in a sentence.",
    },
    {
      key: "comp",
      name: { en: "Compensatory leave", ko: "보상휴가" },
      unit: "half",
      reason: "hidden",
      order: 3,
      enabled: true,
    },
    {
      key: "retired",
      name: { en: "Retired leave", ko: "폐지된 휴가" },
      unit: "day",
      reason: "optional",
      order: 4,
      enabled: false,
    },
  ];
  const apiFor = (personId: string | null) => ({
    "request-view": async (input: unknown) => {
      calls.push({ as: personId, name: "request-view", input });
      if (options.absent === true) {
        throw new PluginRefusal("plugin.disabled", "hr is disabled");
      }
      const view = views[(input as { id: string }).id];
      if (view === undefined) {
        throw new PluginRefusal("plugin.not_found", "no such request");
      }
      return view;
    },
    types: async (input: unknown) => {
      calls.push({ as: personId, name: "types", input });
      if (options.absent === true) {
        throw new PluginRefusal("plugin.disabled", "hr is disabled");
      }
      return kinds;
    },
    balance: async (input: unknown) => {
      calls.push({ as: personId, name: "balance", input });
      return {
        leave: options.enrolled !== false,
        types: [
          {
            type: "annual",
            name: { en: "Annual leave", ko: "연차" },
            balance: "annual",
            available: 12.5,
          },
          { type: "sick", name: { en: "Sick leave", ko: "병가" }, balance: "none", available: 0 },
        ],
      };
    },
    request: async (input: unknown) => {
      calls.push({ as: personId, name: "request", input });
      return options.request === undefined
        ? { text: "Requested.", request: { id: "req-new" }, waiting: null }
        : options.request(personId, input);
    },
    ...(options.requests === undefined
      ? {}
      : {
          requests: async (input: unknown) => {
            calls.push({ as: personId, name: "requests", input });
            return options.requests;
          },
        }),
    ...(options.cancel === undefined
      ? {}
      : {
          cancel: async (input: unknown) => {
            calls.push({ as: personId, name: "cancel", input });
            return options.cancel?.(personId, input);
          },
        }),
  });
  return {
    plugin: {
      version: options.version ?? "0.2.0",
      api: apiFor(null),
      for: (personId: string) => ({ version: options.version ?? "0.2.0", api: apiFor(personId) }),
    },
    calls,
  };
}

export type FakeHr = ReturnType<typeof fakeHr>;

export interface Setup {
  readonly ctx: TestContext;
  readonly slack: FakeSlack;
  readonly hr: FakeHr;
  readonly answered: { decisionId: string; answer: unknown; for: string }[];
  /** What the console keeps of whose an account is, as the plugin said it, and each call made. */
  readonly accounts: FakeAccounts;
}

/** The console's `accounts`, in memory: what was said, and what the plugin asked of it. */
export interface FakeAccounts {
  readonly kept: { personId: string; messenger: string; workspace: string; account: string }[];
  readonly calls: string[];
  /** A code the console refuses the next `put` of an account with, once. */
  refuse: { account: string; code: string } | null;
}

/** A console around the plugin: the people, HR, Slack and the secrets a test asks for. */
export function setup(
  options: {
    readonly caller?: PluginCaller;
    readonly people?: readonly FakePerson[];
    readonly slack?: FakeSlack;
    readonly hr?: FakeHr;
    readonly secrets?: Readonly<Record<string, string | Readonly<Record<string, string>>>>;
    readonly url?: string | null;
    readonly capabilities?: readonly string[];
    /** How many accounts the console answers in one page of what it keeps; two hundred unless said. */
    readonly accountsPage?: number;
    readonly grants?: readonly { readonly plugin: string; readonly role: string }[];
    /** The projects the messenger is placed on, by key; every one unless said. */
    readonly placed?: readonly string[];
    readonly answer?: (decisionId: string, personId: string) => void;
    /** The language an administrator set for the workspace; none set unless said. */
    readonly workspaceLanguage?: "en" | "ko";
    /** The console's clock; the tests' moment unless said. */
    readonly now?: () => Date;
    /** The boards as the console answers them: tasks, decisions and projects. */
    readonly board?: {
      readonly tasks?: { readonly get?: (project: string, number: number) => Promise<unknown> };
      readonly decisions?: { readonly get?: (id: string) => Promise<unknown> };
      readonly projects?: { readonly list?: () => Promise<unknown[]> };
    };
  } = {},
): Setup {
  const people = (options.people ?? [MINSU, JIHYE, HANA, NOMAIL]).map(restPerson);
  const slack = options.slack ?? fakeSlack();
  const hr = options.hr ?? fakeHr();
  const answered: Setup["answered"] = [];
  const accounts: FakeAccounts = { kept: [], calls: [], refuse: null };
  const allowed = (): void => {
    // As the console does: without the capability, the call is refused.
    if (!(options.capabilities ?? []).includes("people:accounts")) {
      throw Object.assign(new Error("forbidden"), { code: "plugin.forbidden" });
    }
  };
  const url = options.url === undefined ? PUBLIC_URL : options.url;
  const ctx = createTestContext({
    collections,
    caller: options.caller ?? KEEPER,
    plugin: {
      key: "messenger",
      capabilities: options.capabilities ?? [
        "people:read",
        "people:read:all",
        "people:read:email",
        "people:act",
        "events:console",
        "events:plugins",
        "jobs",
        "endpoints",
        "outbound:slack.com",
        "outbound:hooks.slack.com",
        "plugins:hr",
      ],
      grants: options.grants ?? [{ plugin: "hr", role: "hr" }],
      ...(options.placed === undefined ? {} : { projects: options.placed }),
    },
    console: {
      workspace: async () => ({
        name: "Acme",
        language: options.workspaceLanguage ?? "en",
        languageSet: options.workspaceLanguage !== undefined,
        languages: options.workspaceLanguage === "ko" ? ["ko", "en"] : ["en", "ko"],
        timeZone: "Asia/Seoul",
        timeZoneSet: true,
        weekStart: "auto",
        url,
        categories: [],
      }),
      people: {
        list: async (query) =>
          people.filter(
            (person) =>
              query?.q === undefined ||
              person.login.toLowerCase().includes(query.q.toLowerCase()) ||
              (person.name ?? "").toLowerCase().includes(query.q.toLowerCase()),
          ),
        get: async (id) => people.find((person) => person.id === id) ?? null,
      },
      accounts: {
        list: async (where) => {
          allowed();
          accounts.calls.push(
            `list ${where.workspace}${where.after === undefined ? "" : ` after ${where.after}`}`,
          );
          const all = accounts.kept.filter(
            (one) => one.messenger === where.messenger && one.workspace === where.workspace,
          );
          const from = where.after === undefined ? 0 : Number(where.after);
          const limit = Math.min(where.limit ?? 200, options.accountsPage ?? 200);
          return {
            items: all.slice(from, from + limit).map((one, index) => ({
              ...one,
              id: String(from + index + 1),
              since: NOW.toISOString(),
            })),
            after: from + limit < all.length ? String(from + limit) : null,
          };
        },
        put: async (said) => {
          allowed();
          accounts.calls.push(`put ${said.workspace} ${said.personId} ${said.account}`);
          if (accounts.refuse?.account === said.account) {
            const code = accounts.refuse.code;
            accounts.refuse = null;
            throw Object.assign(new Error("refused"), { code });
          }
          for (let index = accounts.kept.length - 1; index >= 0; index -= 1) {
            const one = accounts.kept[index];
            if (
              one !== undefined &&
              one.messenger === said.messenger &&
              one.workspace === said.workspace &&
              (one.personId === said.personId || one.account === said.account)
            ) {
              accounts.kept.splice(index, 1);
            }
          }
          accounts.kept.push({ ...said });
          return { ...said, id: String(accounts.kept.length), since: NOW.toISOString() };
        },
        remove: async (gone) => {
          allowed();
          accounts.calls.push(`remove ${gone.workspace} ${gone.personId}`);
          const index = accounts.kept.findIndex(
            (one) =>
              one.messenger === gone.messenger &&
              one.workspace === gone.workspace &&
              one.personId === gone.personId,
          );
          if (index === -1) {
            return false;
          }
          accounts.kept.splice(index, 1);
          return true;
        },
      },
      ...(options.board?.tasks === undefined ? {} : { tasks: options.board.tasks as never }),
      projects: (options.board?.projects ?? { list: async () => [] }) as never,
      decisions: {
        ...(options.board?.decisions?.get === undefined
          ? {}
          : { get: options.board.decisions.get as never }),
        answer: async (decisionId, given, as) => {
          options.answer?.(decisionId, as.for);
          answered.push({ decisionId, answer: given, for: as.for });
          return {} as never;
        },
      },
    },
    fetch: slack.fetch,
    secrets: options.secrets ?? {
      slackConfigToken: "test-config-value",
      slackConfigRefreshToken: "test-refresh-value",
      slackClientSecret: "test-client-value",
      slackSigningSecret: SIGNING,
      slackBotToken: { [TEAM]: "test-bot-value" },
    },
    plugins: { hr: hr.plugin },
    ...(url === null ? {} : { publicUrl: url }),
    endpoints: ["slack", "slack-oauth"],
    now: options.now ?? (() => NOW),
  });
  return { ctx, slack, hr, answered, accounts };
}

/** A request from Slack as it arrives at the endpoint: a form with the payload, signed. */
export function signedRequest(
  payload: unknown,
  options: { readonly secret?: string; readonly at?: Date; readonly signature?: string } = {},
) {
  const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const timestamp = String(Math.floor((options.at ?? NOW).getTime() / 1000));
  const signature =
    options.signature ??
    `v0=${createHmac("sha256", options.secret ?? SIGNING)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`;
  return {
    method: "POST",
    path: "",
    query: {},
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-signature": signature,
      "x-slack-request-timestamp": timestamp,
    },
    body,
  };
}

/** The app made, as `connect` leaves it. */
export async function made(ctx: TestContext, language: "en" | "ko" = "ko"): Promise<void> {
  if (ctx.all("apps").length > 0) {
    return;
  }
  await ctx.records("apps").create({
    provider: "slack",
    appId: "A0TESTAPP",
    clientId: "1111.2222",
    language,
    appName: null,
    botName: null,
    iconUrl: null,
    iconSetUrl: null,
    iconProblem: null,
    shortcut: true,
    manifestDigest: null,
    manifestAt: null,
    installs: [],
    problem: null,
    problemAt: null,
    rotatedAt: null,
  });
}

/**
 * The app made and installed in a workspace, as an installation leaves it: the test's own unless
 * said, the default where it is the first.
 */
export async function connected(
  ctx: TestContext,
  language: "en" | "ko" = "ko",
  team: { readonly id: string; readonly name: string; readonly bot?: string } = {
    id: TEAM,
    name: "Acme",
  },
): Promise<void> {
  await made(ctx, language);
  const first = ctx.all("connections").length === 0;
  await ctx.records("connections").create({
    provider: "slack",
    teamId: team.id,
    teamName: team.name,
    botUserId: team.bot ?? "U0BOT0001",
    botHandle: "console",
    state: "connected",
    default: first,
    projects: [],
    connectedAt: NOW.toISOString(),
    connectedBy: JIHYE.id,
    installedBy: null,
    problem: null,
    problemAt: null,
    matchedAt: NOW.toISOString(),
    matched: 0,
    unmatched: 0,
  });
}

/** A person matched to an account, as the matching leaves them. */
export async function linked(
  ctx: TestContext,
  person: FakePerson,
  memberId: string,
  image: string | null = "https://avatars.example.test/a.png",
  team: string = TEAM,
): Promise<void> {
  await ctx.records("links").create({
    personId: person.id,
    memberId,
    teamId: team,
    name: person.name ?? person.login,
    image,
    matchedAt: NOW.toISOString(),
  });
}
