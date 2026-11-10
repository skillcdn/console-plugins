// The connection page: the steps that connect Slack, each saying whether it is done and what is
// left (the console's address, the configuration token, the app, its installation), then how the
// connection stands, what HR is to the messenger, and a test message. Every press runs a command,
// as an agent would; the installation opens Slack's own page from the press itself.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  LANGUAGES,
  type Language,
  languageOf,
  SECRETS,
  type StatusReport,
} from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  columns,
  DASH,
  dateTimeIn,
  el,
  errorBlock,
  factsPlain,
  field,
  input,
  muted,
  page,
  pageHead,
  panel,
  panelWith,
  pills,
  runCommand,
  sequenced,
  statusLine,
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

function build(frame: PluginFrame, words: Words, status: StatusReport): HTMLElement[] {
  const w = words.connection;
  const when = dateTimeIn(frame.context.language);
  const connection = status.connection;
  const connected = connection?.phase === "connected";
  const main: HTMLElement[] = [];
  const aside: HTMLElement[] = [];

  // What is left to set up, the line `status` says to an agent too.
  main.push(callout(status.next === "ready" ? w.ready : w.next, status.text));

  if (connection?.problem !== null && connection?.problem !== undefined) {
    main.push(
      callout(w.problem, `${connection.problem} (${when(connection.problemAt)})`, "warning"),
    );
  }
  if (status.failures > 0) {
    main.push(callout(w.failures(String(status.failures)), undefined, "warning"));
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
  const made = connection !== null && connection.appId !== null;
  const initial =
    connection?.language ?? status.workspaceLanguage ?? languageOf(frame.context.language);
  const appName = input("text", {
    value: connection?.appName ?? "",
    placeholder: status.defaultNames[initial].app,
    maxLength: 35,
  });
  const botName = input("text", {
    value: connection?.botName ?? "",
    placeholder: status.defaultNames[initial].bot,
    maxLength: 80,
  });
  const icon = input("url", {
    value: connection?.iconUrl ?? "",
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
      made && connection?.appId !== null && connection?.appId !== undefined
        ? w.appMade(connection.appId)
        : w.appMissing,
    ),
    appBody,
  );

  // 4. The installation in the workspace, through Slack's own page.
  const installBody: HTMLElement[] = [];
  if (connected) {
    installBody.push(muted(w.installed(connection?.teamName ?? connection?.teamId ?? DASH)));
    if (connection?.connectedBy !== null && connection?.connectedBy !== undefined) {
      installBody.push(
        muted(
          w.installedBy(
            connection.connectedBy.name ?? connection.connectedBy.login,
            when(connection.connectedAt),
          ),
        ),
      );
    }
  } else {
    installBody.push(muted(w.notInstalled));
    const installStatus = statusLine();
    if (status.authorizeUrl !== null) {
      const url = status.authorizeUrl;
      // Opened from the press itself, before anything waits, as a frame's links must be.
      installBody.push(toolbar(button(w.installOpen, () => frame.open(url), "primary")));
    } else {
      const prepare = button(w.installPrepare, () => {
        void runCommand(frame, prepare, installStatus, words, "connect", {
          language: language.value(),
        });
      });
      prepare.disabled = !made || !addressOk || !token.set;
      installBody.push(toolbar(prepare));
    }
    installBody.push(muted(w.installHint), installStatus);
  }
  const installStep = step(
    connected ? "done" : made ? "todo" : "blocked",
    w.install,
    words,
    ...installBody,
  );

  const steps = el("ol", "steps");
  steps.append(addressStep, tokenStep, appStep, installStep);
  main.push(panel(w.steps, steps));

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

  // How the connection stands, and the secrets as the console says them.
  if (connection !== null && connection.appId !== null) {
    const secrets = SECRETS.map((name): [string, Node] => {
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
      connection.iconUrl === null
        ? w.iconState.none
        : connection.iconSet
          ? w.iconState.set
          : connection.iconProblem === "manual"
            ? w.iconState.manual
            : connection.iconProblem === null
              ? w.iconState.waiting
              : w.iconState.refused;
    const appPage = `https://api.slack.com/apps/${connection.appId}/general`;
    aside.push(
      panel(
        w.details,
        factsPlain([
          [w.workspace, connection.teamName ?? DASH],
          [w.bot, connection.botUserId ?? DASH],
          [w.handle, connection.botHandle === null ? DASH : `@${connection.botHandle}`],
          [w.icon, iconState],
          [w.shortcut, connection.shortcut ? w.shortcutOn : w.shortcutOff],
          [w.renewed, when(connection.rotatedAt)],
        ]),
        ...(connection.iconProblem === "manual" && !connection.iconSet
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
  // again, in this workspace or another.
  if (connection !== null && connection.appId !== null) {
    const tryParts: HTMLElement[] = [];
    if (connected) {
      const channel = input("text", { placeholder: "C0123ABCD", maxLength: 40 });
      const testStatus = statusLine();
      const send = button(w.test, () => {
        const value = channel.value.trim();
        void runCommand(
          frame,
          send,
          testStatus,
          words,
          "test",
          value.length > 0 ? { channel: value } : {},
        );
      });
      tryParts.push(
        field(w.testChannel, channel, w.testChannelHint),
        toolbar(send),
        testStatus,
        el("hr", "rule"),
      );
    }
    const outStatus = statusLine();
    let armed = false;
    const out = button(
      w.disconnect,
      () => {
        if (!armed) {
          armed = true;
          out.textContent = w.disconnectSure;
          return;
        }
        void runCommand(frame, out, outStatus, words, "disconnect");
      },
      "danger",
    );
    aside.push(
      panel(
        connected ? w.tryIt : w.disconnect,
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
