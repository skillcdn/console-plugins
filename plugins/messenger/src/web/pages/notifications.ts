// A member's own Slack notifications (ADR-0017): which of what the console tells them reaches them
// in Slack too, each kind a chip in the groups of the console's own settings and the tasks they
// turned on themselves beside them, at once or in one message a day at a time of the workspace's
// zone; where they are told, and what waits for the day's message. What they are told at all is
// the console's to say, and the page leads to its settings: a kind that is off there is shown as
// off and cannot be chosen here, with what was chosen of it kept for when it is on there again.
// Saving runs the command `notify`, as their agent would.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import {
  CADENCES,
  type Cadence,
  CONSOLE_NOTIFICATIONS_PATH,
  FOLLOWED,
  NOTICE_CHOICES,
  NOTICE_GROUPS,
  type NoticeChoice,
  type NoticeGroup,
  type NoticesView,
} from "../../shared/contracts.js";
import {
  actions,
  button,
  callout,
  checks,
  columns,
  errorBlock,
  factsPlain,
  field,
  input,
  lead,
  muted,
  onSubmit,
  page,
  pageHead,
  panel,
  panelWith,
  pills,
  runCommand,
  sequenced,
  settingsForm,
  settingsRow,
  statusLine,
  submitButton,
  toolbar,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

const GROUPS = Object.keys(NOTICE_GROUPS) as NoticeGroup[];

function build(frame: PluginFrame, words: Words, view: NoticesView): HTMLElement[] {
  const w = words.notifications;
  const main: HTMLElement[] = [];
  const aside: HTMLElement[] = [];
  if (view.accounts.length === 0) {
    main.push(callout(w.noAccount.title, w.noAccount.body, "warning"));
  }

  // The tasks turned on one by one are no kind of the console's, and come whatever its kinds say.
  const there = view.console?.kinds ?? null;
  const offThere = (choice: NoticeChoice): boolean =>
    choice !== FOLLOWED && there !== null && !there[choice];
  const groups = GROUPS.map((group) => ({
    name: w.groups[group],
    chips: checks<NoticeChoice>(
      NOTICE_GROUPS[group].map((choice) => ({
        value: choice,
        label: w.kinds[choice],
        locked: offThere(choice) ? w.offThere : undefined,
      })),
      new Set(NOTICE_GROUPS[group].filter((choice) => view.kinds[choice])),
      w.groups[group],
    ),
  }));
  const at = input("time", { value: view.at, maxLength: 5 });
  at.classList.add("pl-messenger-field-short");
  const atField = field(w.at, at, w.atHint(view.timeZone));
  atField.hidden = view.cadence !== "daily";
  const cadence = pills<Cadence>(
    CADENCES.map((value) => ({ value, label: w.cadences[value] })),
    view.cadence,
    w.when,
    (chosen) => {
      atField.hidden = chosen !== "daily";
    },
  );
  const said = statusLine("save");
  const save = submitButton(w.save);
  // Each choice a row of the console's settings form, its name beside its control, so that a short
  // choice stands at a bounded width beside what it is rather than across the pane. What one is
  // told at all is the console's own setting, a kind off there sent by nobody: the form begins
  // with that, the way to it at the panel's head, since a kind is turned on there before it is
  // here.
  const node = settingsForm(
    lead(NOTICE_CHOICES.some(offThere) ? w.chooseHintOff : w.chooseHint),
    ...groups.map(({ name, chips }) => settingsRow(name, chips.node)),
    settingsRow(w.when, cadence.node, atField),
    actions(save, said),
  );
  onSubmit(node, async () => {
    const on = groups.flatMap(({ chips }) => chips.chosen());
    await runCommand(frame, save, said, words, "notify", {
      on,
      off: NOTICE_CHOICES.filter((choice) => !on.includes(choice)),
      cadence: cadence.value(),
      ...(cadence.value() === "daily" && at.value.length === 5 ? { at: at.value } : {}),
    });
  });
  main.push(
    panelWith(
      w.choose,
      [button(w.openConsole, () => frame.navigate(CONSOLE_NOTIFICATIONS_PATH), "secondary", true)],
      node,
    ),
  );
  // Where the messages go, which projects are told of nothing, and what waits for the day's. With
  // no account the warning above says so already, and the pane keeps only how a place is chosen.
  const projectsOff = (view.console?.projectsOff ?? []).map((project) => project.name);
  aside.push(
    panel(
      w.where,
      ...(view.accounts.length === 0
        ? []
        : [
            factsPlain(
              view.accounts.map((account) => [w.workspace, account.teamName ?? account.teamId]),
            ),
          ]),
      muted(w.whereHint),
      ...(projectsOff.length > 0 ? [muted(w.projectsOff(projectsOff.join(", ")))] : []),
      ...(view.cadence === "daily" ? [muted(w.waiting(String(view.waiting)))] : []),
    ),
  );
  if (view.chosen) {
    // Said on the form's line, which keeps it over the drawing that follows, as a save is.
    const reset = button(
      w.reset,
      () => {
        void runCommand(frame, reset, said, words, "notify", { reset: true });
      },
      "secondary",
      true,
    );
    aside.push(panel(w.defaults, muted(w.defaultsHint), toolbar(reset)));
  }
  return [pageHead(w.title, w.lead), columns(main, aside)];
}

export async function renderNotifications(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const node = page();
  root.replaceChildren(node);
  const draw = sequenced(async (fresh) => {
    let view: NoticesView;
    try {
      view = (await frame.query("notices")) as NoticesView;
    } catch (error) {
      node.replaceChildren(errorBlock(error, words));
      return;
    }
    if (fresh()) {
      node.replaceChildren(...build(frame, words, view));
    }
  });
  await draw();
  watch(frame, draw);
}
