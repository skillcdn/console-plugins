// What a message or a form shows in Slack, as Slack's blocks. Every word a person wrote, a name,
// a reason, a note, is escaped before it is put into Slack's markup: Slack reads `<`, `>` and `&`
// as the start of a mention, a link or a broadcast to a whole channel, so a reason that says
// `<!channel>` would otherwise ring everyone. Lengths are held to Slack's own bounds.

export type Block = Readonly<Record<string, unknown>>;

/** Text a person wrote, made safe for Slack's markup: no mention, no link, no broadcast. */
export function safe(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The control characters taken out, a run of space made one, held to `max` characters. */
export function clean(text: string, max: number): string {
  const plain = [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code < 160) ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return [...plain].length > max ? `${[...plain].slice(0, max - 1).join("")}…` : plain;
}

/** A reason or a note as it was written, its lines kept, its control characters taken out. */
export function paragraph(text: string, max: number): string {
  const kept = [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return character === "\n" ? "\n" : code < 32 || (code >= 127 && code < 160) ? " " : character;
    })
    .join("")
    .trim();
  return [...kept].length > max ? `${[...kept].slice(0, max - 1).join("")}…` : kept;
}

/** A member mentioned, which notifies them. */
export function mention(memberId: string): string {
  return `<@${memberId}>`;
}

/** A link of the console's, its words escaped. */
export function link(url: string, words: string): string {
  return `<${url}|${safe(words)}>`;
}

/** Struck through, each line on its own, since Slack strikes within a line alone. */
export function strike(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim().length === 0 ? line : `~${line}~`))
    .join("\n");
}

export function section(markup: string): Block {
  return { type: "section", text: { type: "mrkdwn", text: markup.slice(0, 3000) } };
}

export function context(...markup: readonly string[]): Block {
  return {
    type: "context",
    elements: markup
      .filter((text) => text.length > 0)
      .slice(0, 10)
      .map((text) => ({ type: "mrkdwn", text: text.slice(0, 3000) })),
  };
}

export function plain(
  text: string,
  max = 3000,
): { readonly type: "plain_text"; readonly text: string } {
  return { type: "plain_text", text: [...text].slice(0, max).join("") };
}

/** Buttons that answer a decision, each with the decision's id as its value. */
export function decide(
  decisionId: string,
  labels: { readonly approve: string; readonly reject: string },
): Block {
  return {
    type: "actions",
    block_id: "decide",
    elements: [
      {
        type: "button",
        action_id: "approve",
        style: "primary",
        text: plain(labels.approve, 75),
        value: decisionId,
      },
      {
        type: "button",
        action_id: "reject",
        style: "danger",
        text: plain(labels.reject, 75),
        value: decisionId,
      },
    ],
  };
}

/** What a notification shows where blocks are not read: the first line, in plain words. */
export function fallback(text: string): string {
  return safe(clean(text, 300));
}
