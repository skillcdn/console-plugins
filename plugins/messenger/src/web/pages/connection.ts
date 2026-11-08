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
  DASH,
  dateTimeIn,
  el,
  errorBlock,
  factsRow,
  field,
  input,
  muted,
  page,
  pageHead,
  panel,
  pills,
  row,
  runCommand,
  sequenced,
  statusLine,
  table,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

const SETTINGS = "/settings/plugins/messenger";

function step(done: boolean, title: string, words: Words, ...body: HTMLElement[]): HTMLLIElement {
  const item = el("li", `step${done ? " step-done" : ""}`);
  const head = el("div", "step-head");
  head.append(
    el("span", "step-title", title),
    badge(done ? words.connection.done : words.connection.todo, done ? "success" : "neutral"),
  );
  const content = el("div", "step-body");
  content.append(...body);
  item.append(head, content);
  return item;
}

function build(frame: PluginFrame, words: Words, status: StatusReport): HTMLElement[] {
  const w = words.connection;
  const when = dateTimeIn(frame.context.language);
  const connection = status.connection;
  const connected = connection?.phase === "connected";
  const parts: HTMLElement[] = [pageHead(w.title, w.lead)];

  if (connection?.problem !== null && connection?.problem !== undefined) {
    parts.push(
      callout(w.problem, `${connection.problem} (${when(connection.problemAt)})`, "warning"),
    );
  }
  if (status.failures > 0) {
    parts.push(callout(w.failures(String(status.failures)), undefined, "warning"));
  }

  // 1. The console's address.
  const addressOk = status.address.state === "ok";
  const addressStep = step(
    addressOk,
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
    token.set,
    w.token,
    words,
    muted(tokenText),
    toolbar(button(words.openSettings, () => frame.navigate(SETTINGS), "secondary", true)),
  );

  // 3. The app, made from the manifest.
  const made = connection !== null && connection.appId !== null;
  const language = pills<Language>(
    LANGUAGES.map((value) => ({ value, label: words.languages[value] })),
    connection?.language ?? languageOf(frame.context.workspace?.languages?.[0]),
    w.appLanguage,
  );
  const makeStatus = statusLine();
  const make = button(
    made ? w.update : w.make,
    () => {
      void runCommand(frame, make, makeStatus, words, "connect", { language: language.value() });
    },
    made ? "secondary" : "primary",
  );
  make.disabled = !addressOk || !token.set;
  const appStep = step(
    made,
    w.app,
    words,
    muted(
      made && connection?.appId !== null && connection?.appId !== undefined
        ? w.appMade(connection.appId)
        : w.appMissing,
    ),
    field(w.appLanguage, language.node),
    toolbar(make),
    makeStatus,
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
  const installStep = step(connected, w.install, words, ...installBody);

  const steps = el("ol", "steps");
  steps.append(addressStep, tokenStep, appStep, installStep);
  parts.push(panel(w.steps, steps));

  // How the connection stands, and the secrets as the console says them.
  if (connection !== null && connection.appId !== null) {
    const secrets = SECRETS.map((name) => {
      const secret = status.secrets[name];
      const stood = !secret.set
        ? w.secretUnset
        : secret.source === "administrator"
          ? w.secretPasted
          : w.secretFrom(secret.source ?? DASH);
      return row([
        w.secretNames[name],
        badge(stood, secret.set ? "success" : "neutral"),
        secret.expiresAt === null ? DASH : w.expires(when(secret.expiresAt)),
      ]);
    });
    parts.push(
      panel(
        w.details,
        factsRow([
          [w.workspace, connection.teamName ?? DASH],
          [w.bot, connection.botUserId ?? DASH],
          [w.shortcut, connection.shortcut ? w.shortcutOn : w.shortcutOff],
          [w.renewed, when(connection.rotatedAt)],
        ]),
        el("h3", "subheading", w.secrets),
        table(["", "", ""], secrets),
      ),
    );
  }

  // What HR is to the messenger: reachable, and the role it asks there.
  const hr = status.hr;
  const granted = hr.asked.every((role) => hr.granted.includes(role));
  const hrParts: HTMLElement[] = [
    toolbar(badge(w.hrState[hr.state], hr.state === "on" ? "success" : "neutral")),
    muted(w.hrHint[hr.state]),
  ];
  if (hr.version !== null) {
    hrParts.push(muted(w.hrVersion(hr.version, hr.range)));
  }
  hrParts.push(
    toolbar(
      el("span", "label", w.hrRole),
      badge(granted ? w.hrGranted : w.hrNotGranted, granted ? "success" : "warning"),
    ),
  );
  if (!granted || hr.state === "no_capability") {
    hrParts.push(
      muted(w.hrGrantHint),
      toolbar(button(words.openSettings, () => frame.navigate(SETTINGS), "secondary", true)),
    );
  }
  parts.push(panel(w.hr, ...hrParts));

  // A test message, and the way out.
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
    parts.push(
      panel(
        w.tryIt,
        field(w.testChannel, channel, w.testChannelHint),
        toolbar(send),
        testStatus,
        el("hr", "rule"),
        muted(w.disconnectHint),
        toolbar(out),
        outStatus,
      ),
    );
  }
  return parts;
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
