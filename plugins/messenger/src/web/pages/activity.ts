// The activity page: what the messenger did with each event it heard, newest first, narrowed to
// what was sent, passed over or failed, with what happened in a line.
import type { PluginFrame } from "@skillcdn/console/plugin/web";
import { type ActivityRow, NOTES, type NoteCode, type Outcome } from "../../shared/contracts.js";
import {
  badge,
  dateTimeIn,
  empty,
  errorBlock,
  page,
  pageHead,
  panelWith,
  pills,
  row,
  sequenced,
  type Tone,
  table,
  watch,
} from "../ui.js";
import type { Words } from "../words.js";

const OUTCOMES: readonly Outcome[] = ["sent", "skipped", "failed"];

/** A delivery's note in the reader's words: its code, and what follows the colon. */
function noteIn(words: Words, note: string): string {
  const at = note.indexOf(":");
  const code = at < 0 ? note : note.slice(0, at);
  const detail = at < 0 ? "" : note.slice(at + 1);
  return (NOTES as readonly string[]).includes(code)
    ? words.activity.notes[code as NoteCode](detail)
    : note;
}
const TONES: Readonly<Record<Outcome, Tone>> = {
  sent: "success",
  skipped: "neutral",
  failed: "danger",
};

export async function renderActivity(
  root: HTMLElement,
  frame: PluginFrame,
  words: Words,
): Promise<void> {
  const w = words.activity;
  const when = dateTimeIn(frame.context.language);
  const node = page();
  root.replaceChildren(node);
  let chosen: Outcome | "all" = "all";
  const draw = sequenced(async (fresh) => {
    let rows: readonly ActivityRow[];
    try {
      rows = (await frame.query("activity", {
        ...(chosen === "all" ? {} : { outcome: chosen }),
        limit: 100,
      })) as readonly ActivityRow[];
    } catch (error) {
      node.replaceChildren(errorBlock(error, words));
      return;
    }
    if (!fresh()) {
      return;
    }
    const filter = pills<Outcome | "all">(
      [
        { value: "all", label: w.all },
        ...OUTCOMES.map((outcome) => ({ value: outcome, label: w.outcomes[outcome] })),
      ],
      chosen,
      w.outcome,
      (value) => {
        chosen = value;
        void draw();
      },
    );
    const lines = rows.map((line) =>
      row([
        when(line.at),
        w.kinds[line.kind] ?? line.kind,
        badge(w.outcomes[line.outcome], TONES[line.outcome]),
        noteIn(words, line.note),
        String(line.attempt),
      ]),
    );
    node.replaceChildren(
      pageHead(w.title, w.lead),
      panelWith(
        w.title,
        [filter.node],
        lines.length === 0
          ? empty(w.none)
          : table([w.when, w.event, w.outcome, w.note, w.attempt], lines),
      ),
    );
  });
  await draw();
  watch(frame, draw);
}
