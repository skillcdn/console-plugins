// Setup, the teams: who is on each and who approves them, unless a person has approvers of their own.
import type { PeopleReport, PersonBrief, TeamView } from "../../shared/contracts.js";
import {
  actions,
  button,
  el,
  empty,
  errorBlock,
  faces,
  field,
  form,
  group,
  input,
  muted,
  onSubmit,
  panelWith,
  peoplePicker,
  personLabel,
  runCommand,
  say,
  sequenced,
  stack,
  statusLine,
  submitButton,
} from "../ui.js";
import { keyFrom, type SetupView } from "./setup-shared.js";

function teamForm(
  item: TeamView | null,
  people: readonly PersonBrief[],
  taken: readonly string[],
  view: SetupView,
  onSaved: () => Promise<void>,
  onClose: () => void,
): HTMLFormElement {
  const { frame, words } = view;
  const name = input("text", { value: item?.team.name ?? "", maxLength: 80, required: true });
  const approvers = peoplePicker(people, item?.team.approverIds ?? [], words);
  const submit = submitButton(words.saveTeam);
  const status = statusLine();
  const node = form(
    field(words.teamNameLabel, name),
    group(
      words.teamApprovers,
      approvers.node,
      el("span", "sc-field-hint", words.teamApproversHint),
    ),
    actions(submit, button(words.close, onClose, "ghost")),
    status,
  );
  onSubmit(node, async () => {
    const chosen = approvers.value();
    const logins = chosen.map((id) => people.find((person) => person.id === id)?.login ?? id);
    const args: Record<string, unknown> = {
      key: item?.team.key ?? keyFrom(name.value, taken, "team"),
      name: name.value.trim(),
      ...(chosen.length === 0 ? { clear: true } : { approvers: logins }),
    };
    const result = await runCommand(frame, submit, status, words, "team", args);
    if (result !== null) {
      await onSaved();
    }
  });
  return node;
}

export async function teamsTab(body: HTMLElement, view: SetupView): Promise<void> {
  const { frame, words, format } = view;
  const list = stack();
  const status = statusLine();
  let people: PersonBrief[] = [];
  let keys: string[] = [];

  const refresh = sequenced(async (fresh) => {
    try {
      const [teams, report] = await Promise.all([
        frame.query("teams") as Promise<readonly TeamView[]>,
        frame.query("people", { balances: false }) as Promise<PeopleReport>,
      ]);
      if (fresh()) {
        people = report.people.filter((row) => row.status === "active").map((row) => row.person);
        draw(teams);
      }
    } catch (error) {
      if (fresh()) {
        list.replaceChildren(errorBlock(error, words));
      }
    }
  });
  const saved = async () => {
    say(status, words.saved, "ok");
    await refresh();
  };
  const open = (item: TeamView | null) =>
    list.replaceChildren(teamForm(item, people, keys, view, saved, () => void refresh()));

  function draw(teams: readonly TeamView[]): void {
    keys = teams.map((item) => item.team.key);
    if (teams.length === 0) {
      list.replaceChildren(empty(words.teamsEmpty));
      return;
    }
    const rows = el("ul", "team-rows");
    for (const item of teams) {
      const row = el("li", "team-row");
      const text = el("div", "team-text");
      text.append(
        el("p", "team-name", item.team.name),
        el(
          "p",
          "sc-muted team-sub",
          item.approvers.length === 0
            ? words.teamNoApprover
            : words.teamApprovedBy(item.approvers.map(personLabel).join(", ")),
        ),
      );
      const members = el("div", "team-members");
      members.append(
        faces(frame, item.members, 6),
        el("span", "sc-muted", words.peopleCount(format.number(item.members.length))),
      );
      const side = el("div", "rule-actions");
      const remove = button(
        words.remove,
        () => {
          void (async () => {
            const result = await runCommand(frame, remove, status, words, "team", {
              key: item.team.key,
              remove: true,
            });
            if (result !== null) {
              await saved();
            }
          })();
        },
        "ghost",
        true,
      );
      side.append(
        button(words.edit, () => open(item), "ghost", true),
        remove,
      );
      row.append(text, members, side);
      rows.append(row);
    }
    list.replaceChildren(rows);
  }

  body.append(
    panelWith(
      words.tabs.teams,
      [button(words.newTeam, () => open(null), "primary", true)],
      muted(words.teamsHint),
      status,
      list,
    ),
  );
  await refresh();
}
