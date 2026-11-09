// What the app is called and looks like in Slack: the app's name and its bot's, chosen when it is
// connected or the language's own, and its icon, a public image Slack is told to fetch. The app's
// name takes any script; the bot's takes Latin letters alone, since Slack makes the bot's handle
// (@) from it and refuses a name it cannot. The plugin reads the handle back once it is installed.
import { type PluginContext, PluginError } from "@skillcdn/console/plugin";
import { addressState } from "./address.js";
import { refusalOf, SlackError, slack, textOf } from "./slack/api.js";
import { clean } from "./slack/blocks.js";
import { serverWords } from "./words.js";

/** The most characters of an app's name in Slack. */
const APP_NAME_AT_MOST = 35;
/** A bot's name as Slack takes it, and so a handle can be made of it. */
const BOT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;
/** A handle as Slack answers one. */
const HANDLE = /^[a-z0-9._-]{1,80}$/;

/** The names and the icon someone chose; null where the default stands. */
export interface Chosen {
  readonly appName: string | null;
  readonly botName: string | null;
  readonly iconUrl: string | null;
}

/** What was given, else what was chosen before; an empty value goes back to the default. */
function pick(given: string | undefined, before: string | null): string | null {
  if (given === undefined) {
    return before;
  }
  const trimmed = given.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function hasControl(text: string): boolean {
  return [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || (code >= 127 && code < 160);
  });
}

/** The names and the icon `connect` was given, checked before anything is asked of Slack. */
export function chosenOf(
  ctx: PluginContext,
  given: {
    readonly appName: string | undefined;
    readonly botName: string | undefined;
    readonly icon: string | undefined;
  },
  before: Chosen,
): Chosen {
  const words = serverWords(ctx.language).refused;
  const appName = pick(given.appName, before.appName);
  if (appName !== null && ([...appName].length > APP_NAME_AT_MOST || hasControl(appName))) {
    throw new PluginError("app_name", words.appName);
  }
  const botName = pick(given.botName, before.botName);
  if (botName !== null && !BOT_NAME.test(botName)) {
    throw new PluginError("bot_name", words.botName);
  }
  const iconUrl = pick(given.icon, before.iconUrl);
  if (iconUrl !== null && (iconUrl.length > 1000 || addressState(iconUrl) !== "ok")) {
    throw new PluginError("icon", words.icon);
  }
  return { appName, botName, iconUrl };
}

/** Slack's refusal of a manifest in the caller's words, naming the name it was about. */
export function manifestRefusal(ctx: PluginContext, error: unknown): PluginError {
  if (error instanceof SlackError && error.code === "invalid_manifest") {
    const words = serverWords(ctx.language).refused;
    const about = (field: string) =>
      error.problems.find((problem) => problem.pointer.startsWith(field));
    const app = about("/display_information/name");
    if (app !== undefined) {
      return new PluginError("app_name", words.appNameRefused(clean(app.message, 300)));
    }
    const bot = about("/features/bot_user/display_name");
    if (bot !== undefined) {
      return new PluginError("bot_name", words.botNameRefused(clean(bot.message, 300)));
    }
  }
  return refusalOf(ctx, error);
}

/** The bot's handle as Slack made it, read with the bot's token; none where Slack does not say. */
export async function handleOf(ctx: PluginContext, botUserId: string): Promise<string | null> {
  try {
    const name = textOf(await slack(ctx, "users.info", { user: botUserId }), "user.name");
    return name !== null && HANDLE.test(name) ? name : null;
  } catch (error) {
    ctx.log.warn("the bot's handle was not read", {
      code: error instanceof SlackError ? error.code : null,
    });
    return null;
  }
}
