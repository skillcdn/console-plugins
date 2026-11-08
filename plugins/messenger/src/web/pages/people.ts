// The people page: each person and how they stand with Slack, matched to an account by email or
// why not, with the way to match everyone again now. The pictures come through the bridge.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import type { MatchState, PeopleReport } from "../../shared/contracts.js";
import {
  badge,
  button,
  callout,
  dateTimeIn,
  empty,
  errorBlock,
  factsRow,
  muted,
  page,
  pageHead,
  panelWith,
  pills,
  row,
  runCommand,
  sequenced,
  statusLine,
  type Tone,
  table,
  watch,
  who,
} from "../ui.js";
import type { Words } from "../words.js";

const STATES: readonly MatchState[] = ["no_email", "no_account", "not_checked", "matched"];
const TONES: Readonly<Record<MatchState, Tone>> = {
  matched: "success",
  no_email: "warning",
  no_account: "neutral",
  not_checked: "neutral",
};

export async function renderPeople(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const w = words.people;
  const when = dateTimeIn(frame.context.language);
  const node = page();
  root.replaceChildren(node);
  let chosen: MatchState | "all" = "all";
  const draw = sequenced(async (fresh) => {
    let report: PeopleReport;
    try {
      report = (await frame.query("people", {
        ...(chosen === "all" ? {} : { state: chosen }),
        limit: 200,
      })) as PeopleReport;
    } catch (error) {
      node.replaceChildren(errorBlock(error, words));
      return;
    }
    if (!fresh()) {
      return;
    }
    const matchStatus = statusLine();
    const matchNow = button(w.matchNow, () => {
      void runCommand(frame, matchNow, matchStatus, words, "match");
    });
    matchNow.disabled = !report.connected;
    const parts: HTMLElement[] = [pageHead(w.title, w.lead, matchNow)];
    parts.push(matchStatus);
    if (!report.connected) {
      parts.push(callout(w.notConnected, undefined, "warning"));
    }
    parts.push(
      factsRow([
        [w.state, report.matchedAt === null ? w.neverMatched : w.matchedAt(when(report.matchedAt))],
        ...STATES.map((state) => [w.states[state], String(report.counts[state])] as const),
      ]),
    );
    const filter = pills<MatchState | "all">(
      [
        { value: "all", label: w.all },
        ...STATES.map((state) => ({
          value: state,
          label: `${w.states[state]} ${report.counts[state]}`,
        })),
      ],
      chosen,
      w.state,
      (value) => {
        chosen = value;
        void draw();
      },
    );
    const rows = report.people.map((match) =>
      row([
        who(frame, match.person),
        badge(w.states[match.state], TONES[match.state]),
        match.slack === null ? muted(w.stateHints[match.state]) : match.slack.name,
      ]),
    );
    parts.push(
      panelWith(
        w.title,
        [filter.node],
        rows.length === 0 ? empty(w.nobody) : table([w.person, w.state, w.account], rows),
        ...(report.total > report.people.length
          ? [muted(w.more(String(report.people.length), String(report.total)))]
          : []),
      ),
    );
    node.replaceChildren(...parts);
  });
  await draw();
  watch(frame, draw);
}
