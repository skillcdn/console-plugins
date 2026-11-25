// The connection page: the steps that connect Slack, each saying whether it is done and what is
// left (the console's address, the configuration token, the app, its installation in a workspace),
// then the workspaces the app is installed in and, where there are several, the one each project is
// told in (ADR-0014, ADR-0018), how the app stands, what HR is to the messenger, and a test message. Every press runs a command, as an agent would; an installation
// opens Slack's own page from the press itself, and its link is shown to be handed over.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  FIXED_SECRETS,
  LANGUAGES,
  type Language,
  languageOf,
  type StatusReport,
  type WorkspaceView,
} from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  chip,
  columns,
  DASH,
  dateTimeIn,
  el,
  empty,
  errorBlock,
  factsPlain,
  field,
  input,
  lead,
  muted,
  page,
  pageHead,
  panel,
  panelWith,
  pills,
  row,
  runCommand,
  runInPlace,
  select,
  sequenced,
  settingsRow,
  statusLine,
  table,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

const SETTINGS = "/settings/plugins/messenger";

/** Where a step stands: done, to do now, or waiting for the steps above it. */
type StepState = "done" | "todo" | "blocked";

/**
 * A step of getting connected. A step waiting for the ones above folds to its title and a line
 * saying so, so that what can be done now is what the page shows open.
 */
function step(
  state: StepState,
  title: string,
  words: Words,
  ...body: HTMLElement[]
): HTMLLIElement {
  const item = el("li", `step step-${state}`);
  const head = el("div", "step-head");
  head.append(el("span", "step-title", title));
  if (state !== "blocked") {
    head.append(
      badge(
        state === "done" ? words.connection.done : words.connection.todo,
        state === "done" ? "success" : "accent",
      ),
    );
  }
  const content = el("div", "step-body");
  content.append(...(state === "blocked" ? [muted(words.connection.blocked)] : body));
  item.append(head, content);
  return item;
}

/** Fields one under another, set apart more than a label is from its control. */
function fields(...children: HTMLElement[]): HTMLDivElement {
  const node = el("div", "fields");
  node.append(...children);
  return node;
}

function nameOf(workspace: WorkspaceView): string {
  return workspace.teamName ?? workspace.teamId;
}

/** A press that asks once more before it acts: the first press says what the second does. */
function twice(label: string, sure: string, act: (press: HTMLButtonElement) => void) {
  let armed = false;
  const press = button(
    label,
    () => {
      if (!armed) {
        armed = true;
        press.textContent = sure;
        return;
      }
      act(press);
    },
    "danger",
    true,
  );
  return press;
}

/** A row of the workspaces' table: its name, its bot, its people, its token, and what may be done. */
function workspaceRow(
  frame: PluginFrame,
  words: Words,
  workspace: WorkspaceView,
  several: boolean,
): HTMLTableRowElement {
  const w = words.connection;
  const when = dateTimeIn(frame.context.language);
  // Its name beside the default's badge, its bot's handle under them: one column, which a phone's
  // width keeps whole.
  const waiting = workspace.state === "pending";
  const title = el("span", "workspace-title");
  title.append(el("span", "", nameOf(workspace)));
  if (waiting) {
    title.append(badge(w.waiting, "warning"));
  } else if (workspace.default && several) {
    title.append(badge(w.default, "accent"));
  }
  const name = el("span", "workspace-name");
  name.append(title);
  if (workspace.botHandle !== null) {
    name.append(el("span", "sc-muted small", `@${workspace.botHandle}`));
  }
  const people = el("span", "workspace-people");
  people.append(
    el(
      "span",
      "",
      waiting
        ? DASH
        : workspace.matchedAt === null
          ? w.notMatchedYet
          : w.matchedCount(String(workspace.matched)),
    ),
  );
  if (workspace.problem !== null) {
    people.append(
      el("span", "sc-muted small", `${workspace.problem} (${when(workspace.problemAt)})`),
    );
  }
  const said = statusLine();
  const acts = el("span", "workspace-actions");
  if (waiting) {
    const accept = button(
      w.accept,
      () => {
        void runCommand(frame, accept, said, words, "workspace", {
          team: workspace.teamId,
          accept: true,
        });
      },
      "primary",
      true,
    );
    acts.append(accept);
  } else if (several && !workspace.default) {
    const makeDefault = button(
      w.makeDefault,
      () => {
        void runCommand(frame, makeDefault, said, words, "workspace", {
          team: workspace.teamId,
          default: true,
        });
      },
      "ghost",
      true,
    );
    acts.append(makeDefault);
  }
  const remove = twice(w.remove, w.removeSure, (press) => {
    void runCommand(frame, press, said, words, "disconnect", { workspace: workspace.teamId });
  });
  acts.append(remove, said);
  return row([
    name,
    people,
    badge(
      workspace.token.set ? w.tokenKept : w.secretUnset,
      workspace.token.set ? "success" : "warning",
    ),
    acts,
  ]);
}

/**
 * The workspace each project is told in, where there are several: a row for each besides the
 * default, the projects told there as chips that are taken out of it, and the way to add one.
 */
function toldPanel(
  frame: PluginFrame,
  words: Words,
  status: StatusReport,
  workspaces: readonly WorkspaceView[],
): HTMLElement {
  const w = words.connection;
  // One line for every press of the panel, since each is drawn anew after it.
  const said = statusLine("told");
  const byId = new Map(status.projects.map((project) => [project.id, project]));
  const named = new Set(workspaces.flatMap((workspace) => workspace.projects));
  const free = status.projects.filter((project) => !named.has(project.id));
  let unseen = 0;
  const rows: HTMLElement[] = [];
  for (const workspace of workspaces) {
    // The default is told of what no other is named for; projects named for it before it was the
    // default stay named, and are shown so that they can be taken out.
    if (workspace.default && workspace.projects.length === 0) {
      continue;
    }
    const chips = el("div", "sc-chips");
    for (const id of workspace.projects) {
      const project = byId.get(id);
      if (project === undefined) {
        unseen += 1;
        continue;
      }
      chips.append(
        chip(project.name, w.toldRemove(project.name), (press) => {
          void runCommand(frame, press, said, words, "workspace", {
            team: workspace.teamId,
            remove: [project.key],
          });
        }),
      );
    }
    const controls: HTMLElement[] = [chips.childElementCount > 0 ? chips : muted(w.toldNone)];
    if (!workspace.default && free.length > 0) {
      const project = select(free.map((one) => ({ value: one.key, label: one.name })));
      project.setAttribute("aria-label", w.project);
      const add = button(
        w.toldAdd,
        () => {
          void runCommand(frame, add, said, words, "workspace", {
            team: workspace.teamId,
            add: [project.value],
          });
        },
        "secondary",
      );
      controls.push(toolbar(project, add));
    }
    rows.push(settingsRow(nameOf(workspace), ...controls));
  }
  const home = workspaces.find((workspace) => workspace.default);
  const settings = el("div", "sc-form sc-settings-form");
  settings.append(...(home === undefined ? [] : [lead(w.toldHint(nameOf(home)))]), ...rows);
  return panel(
    w.told,
    settings,
    ...(unseen > 0 ? [muted(w.toldUnseen(String(unseen)))] : []),
    said,
  );
}

/**
 * Whether the console is told whose each account of a workspace is, by which an agent account knows
 * who wrote to it in Slack (ADR-0021): a row for each, with the way for an administrator to accept
 * one that somebody else accepted.
 */
function accountsPanel(
  frame: PluginFrame,
  words: Words,
  workspaces: readonly WorkspaceView[],
): HTMLElement {
  const w = words.connection;
  const said = statusLine("accounts");
  const settings = el("div", "sc-form sc-settings-form");
  settings.append(lead(w.accountsHint));
  for (const workspace of workspaces) {
    if (workspace.accounts === "off") {
      continue;
    }
    const controls: HTMLElement[] = [
      badge(w.accounts[workspace.accounts], workspace.accounts === "told" ? "success" : "warning"),
    ];
    if (workspace.mayAccept) {
      const accept = button(
        w.accept,
        () => {
          void runCommand(frame, accept, said, words, "workspace", {
            team: workspace.teamId,
            accept: true,
          });
        },
        "secondary",
        true,
      );
      controls.push(accept);
    }
    settings.append(settingsRow(nameOf(workspace), toolbar(...controls)));
  }
  return panel(w.accountsTitle, settings, said);
}

function build(frame: PluginFrame, words: Words, status: StatusReport): HTMLElement[] {
  const w = words.connection;
  const when = dateTimeIn(frame.context.language);
  const app = status.app;
  // The table lists the waiting workspaces too; everything else is about the connected ones.
  const listed = status.workspaces;
  const workspaces = listed.filter((workspace) => workspace.state === "connected");
  const installed = workspaces.length > 0;
  const several = workspaces.length > 1;
  const waitingAny = listed.some((workspace) => workspace.state === "pending");
  const main: HTMLElement[] = [];
  const aside: HTMLElement[] = [];

  // What is left to set up, the line `status` says to an agent too.
  main.push(callout(status.next === "ready" ? w.ready : w.next, status.text));

  if (app?.problem !== null && app?.problem !== undefined) {
    main.push(callout(w.problem, `${app.problem} (${when(app.problemAt)})`, "warning"));
  }
  if (status.failures > 0) {
    const failed = w.failures(String(status.failures));
    main.push(callout(failed.title, failed.body, "warning"));
  }

  // 1. The console's address.
  const addressOk = status.address.state === "ok";
  const addressStep = step(
    addressOk ? "done" : "todo",
    w.address,
    words,
    toolbar(
      el("span", "mono", status.address.url ?? DASH),
      badge(w.addressState[status.address.state], addressOk ? "success" : "warning"),
    ),
    muted(w.addressHint[status.address.state]),
  );

  // 2. The configuration token, pasted by an administrator.
  const token = status.secrets.slackConfigToken;
  const tokenText = !token.set
    ? w.tokenMissing
    : token.expiresAt === null
      ? w.tokenPasted
      : w.tokenSet(when(token.expiresAt));
  const tokenStep = step(
    token.set ? "done" : "todo",
    w.token,
    words,
    muted(tokenText),
    toolbar(button(words.openSettings, () => frame.navigate(SETTINGS), "secondary", true)),
  );

  // 3. The app, made from the manifest: its language, its names and its icon.
  const made = app !== null && app.appId !== null;
  const initial = app?.language ?? status.workspaceLanguage ?? languageOf(frame.context.language);
  const appName = input("text", {
    value: app?.appName ?? "",
    placeholder: status.defaultNames[initial].app,
    maxLength: 35,
  });
  const botName = input("text", {
    value: app?.botName ?? "",
    placeholder: status.defaultNames[initial].bot,
    maxLength: 80,
  });
  const icon = input("url", {
    value: app?.iconUrl ?? "",
    placeholder: "https://",
    maxLength: 1000,
  });
  const language = pills<Language>(
    LANGUAGES.map((value) => ({ value, label: words.languages[value] })),
    initial,
    w.appLanguage,
    (chosen) => {
      // The names left empty are the language's own: the placeholders say which.
      appName.placeholder = status.defaultNames[chosen].app;
      botName.placeholder = status.defaultNames[chosen].bot;
    },
  );
  const makeStatus = statusLine();
  const make = button(
    made ? w.update : w.make,
    () => {
      void runCommand(frame, make, makeStatus, words, "connect", {
        language: language.value(),
        "app-name": appName.value.trim(),
        "bot-name": botName.value.trim(),
        icon: icon.value.trim(),
      });
    },
    made ? "secondary" : "primary",
  );
  make.disabled = !addressOk || !token.set;
  const appForm = fields(
    field(w.appLanguage, language.node),
    field(w.appName, appName, w.appNameHint),
    field(w.botName, botName, w.botNameHint),
    field(w.icon, icon, w.iconHint),
    toolbar(make),
    makeStatus,
  );
  // Once the app is made, what it was made with is a change asked for now and then: folded under
  // a press, so that the step reads as done.
  let appBody: HTMLElement = appForm;
  if (made) {
    const more = el("details", "more");
    more.append(el("summary", "sc-button sc-button-secondary sc-button-sm", w.appEdit), appForm);
    appBody = more;
  }
  const appStep = step(
    made ? "done" : addressOk && token.set ? "todo" : "blocked",
    w.app,
    words,
    muted(
      made && app?.appId !== null && app?.appId !== undefined ? w.appMade(app.appId) : w.appMissing,
    ),
    appBody,
  );

  // 4. The installation in a workspace, through Slack's own page; once in one, the way to another.
  const installBody: HTMLElement[] = [
    muted(installed ? w.installedIn(workspaces.map(nameOf).join(", ")) : w.notInstalled),
  ];
  const installStatus = statusLine();
  if (status.authorizeUrl !== null) {
    const url = status.authorizeUrl;
    // Opened from the press itself, before anything waits, as a frame's links must be.
    installBody.push(
      toolbar(
        button(installed ? w.installAnother : w.installOpen, () => frame.open(url), "primary"),
      ),
      muted(w.installLink(when(status.installUntil))),
      el("p", "mono install-link", url),
    );
  } else {
    const prepare = button(installed ? w.installAnother : w.installPrepare, () => {
      void runCommand(frame, prepare, installStatus, words, "install", {});
    });
    prepare.disabled = !made || !addressOk;
    installBody.push(toolbar(prepare));
  }
  installBody.push(muted(w.installHint), installStatus);
  if (installed && status.distributionUrl !== null) {
    const distribution = status.distributionUrl;
    installBody.push(
      muted(w.distribution),
      toolbar(button(w.openDistribution, () => frame.open(distribution), "secondary", true)),
    );
  }
  const installStep = step(
    installed ? "done" : made ? "todo" : "blocked",
    w.install,
    words,
    ...installBody,
  );

  const steps = el("ol", "steps");
  steps.append(addressStep, tokenStep, appStep, installStep);
  main.push(panel(w.steps, steps));

  // The workspaces the app is installed in, the default first, then those waiting to be accepted.
  if (made) {
    main.push(
      panel(
        w.workspaces,
        listed.length > 0
          ? table(
              [w.workspace, w.people, w.botToken, ""],
              listed.map((workspace) => workspaceRow(frame, words, workspace, several)),
            )
          : empty(w.noWorkspace),
        ...(waitingAny ? [muted(w.acceptHint)] : []),
      ),
    );
  }
  if (several) {
    main.push(toldPanel(frame, words, status, workspaces));
  }
  // Nothing of it where the capability is off, which is the plugin's settings page to say.
  if (workspaces.some((workspace) => workspace.accounts !== "off")) {
    main.push(accountsPanel(frame, words, workspaces));
  }

  // What HR is to the messenger, first in the aside: it holds whatever the connection's stage.
  const hr = status.hr;
  const granted = hr.asked.every((role) => hr.granted.includes(role));
  const hrParts: HTMLElement[] = [muted(w.hrHint[hr.state])];
  const hrFacts: [string, string | Node][] = [
    [w.hrRole, badge(granted ? w.hrGranted : w.hrNotGranted, granted ? "success" : "warning")],
  ];
  if (hr.version !== null) {
    hrParts.push(el("p", "sc-muted small", w.hrVersion(hr.version, hr.range)));
  }
  hrParts.push(factsPlain(hrFacts));
  if (!granted || hr.state === "no_capability") {
    hrParts.push(
      muted(w.hrGrantHint),
      toolbar(button(words.openSettings, () => frame.navigate(SETTINGS), "secondary", true)),
    );
  }
  aside.push(
    panelWith(
      w.hr,
      [badge(w.hrState[hr.state], hr.state === "on" ? "success" : "neutral")],
      ...hrParts,
    ),
  );

  // How the app stands, and the secrets as the console says them.
  if (app !== null && app.appId !== null) {
    const secrets = FIXED_SECRETS.map((name): [string, Node] => {
      const secret = status.secrets[name];
      const stood = !secret.set
        ? w.secretUnset
        : secret.source === "administrator"
          ? w.secretPasted
          : w.secretFrom(secret.source ?? DASH);
      const value = el("span", "secret");
      value.append(badge(stood, secret.set ? "success" : "neutral"));
      if (secret.expiresAt !== null) {
        value.append(el("span", "sc-muted small", w.expires(when(secret.expiresAt))));
      }
      return [w.secretNames[name], value];
    });
    const iconState =
      app.iconUrl === null
        ? w.iconState.none
        : app.iconSet
          ? w.iconState.set
          : app.iconProblem === "manual"
            ? w.iconState.manual
            : app.iconProblem === null
              ? w.iconState.waiting
              : w.iconState.refused;
    const appPage = `https://api.slack.com/apps/${app.appId}/general`;
    aside.push(
      panel(
        w.details,
        factsPlain([
          [w.icon, iconState],
          [w.shortcut, app.shortcut ? w.shortcutOn : w.shortcutOff],
          [w.renewed, when(app.rotatedAt)],
        ]),
        ...(app.iconProblem === "manual" && !app.iconSet
          ? [
              muted(w.iconManual),
              // Opened from the press itself, before anything waits, as a frame's links must be.
              toolbar(button(w.openInSlack, () => frame.open(appPage), "secondary", true)),
            ]
          : []),
        el("h3", "subheading", w.secrets),
        factsPlain(secrets),
      ),
    );
  }

  // A test message where the app is installed, and the way out wherever one is made: to start
  // again with a new app.
  if (app !== null && app.appId !== null) {
    const tryParts: HTMLElement[] = [];
    if (installed) {
      const where = select(
        workspaces.map((workspace) => ({ value: workspace.teamId, label: nameOf(workspace) })),
        workspaces[0]?.teamId,
      );
      const channel = input("text", { placeholder: "C0123ABCD", maxLength: 40 });
      const testStatus = statusLine();
      const send = button(w.test, () => {
        const value = channel.value.trim();
        void runInPlace(frame, send, testStatus, words, "test", {
          ...(several ? { workspace: where.value } : {}),
          ...(value.length > 0 ? { channel: value } : {}),
        });
      });
      tryParts.push(
        ...(several ? [field(w.workspace, where)] : []),
        field(w.testChannel, channel, w.testChannelHint),
        toolbar(send),
        testStatus,
        el("hr", "rule"),
      );
    }
    const outStatus = statusLine();
    const out = twice(w.disconnect, w.disconnectSure, (press) => {
      void runCommand(frame, press, outStatus, words, "disconnect", {});
    });
    aside.push(
      panel(
        installed ? w.tryIt : w.disconnect,
        ...tryParts,
        muted(w.disconnectHint),
        toolbar(out),
        outStatus,
      ),
    );
  }
  return [pageHead(w.title, w.lead), columns(main, aside)];
}

export async function renderConnection(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const node = page();
  root.replaceChildren(node);
  const draw = sequenced(async (fresh) => {
    let status: StatusReport;
    try {
      status = (await frame.query("status")) as StatusReport;
    } catch (error) {
      node.replaceChildren(errorBlock(error, words));
      return;
    }
    if (fresh()) {
      node.replaceChildren(...build(frame, words, status));
    }
  });
  await draw();
  watch(frame, draw);
}
