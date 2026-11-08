// What the console and the other plugins tell the messenger: HR's leave events, which the thread
// and the routes tell in Slack; HR enabled, disabled or upgraded, which puts the leave shortcut in
// the app's manifest or takes it away; and a person's address changed, or their coming back or
// leaving, which their link to an account follows.
import {
  type HookHandler,
  type PluginContext,
  PluginError,
  type PluginHookEvent,
} from "@skillcdn/console/plugin";
import { keepManifest } from "./connection.js";
import { HR } from "./integrations/hr/contract.js";
import { leaveHooks } from "./integrations/hr/thread.js";
import { onPersonChanged } from "./matching.js";
import { noteProblem } from "./store.js";

/** HR came, went or changed: the shortcut follows, written only where the manifest differs. */
export async function onLifecycle(ctx: PluginContext, event: PluginHookEvent): Promise<void> {
  const data = event.data as { readonly key?: unknown } | null;
  if (data?.key !== HR) {
    return;
  }
  try {
    await keepManifest(ctx);
  } catch (error) {
    if (error instanceof PluginError && error.code === "rate_limited") {
      throw error;
    }
    // A manifest that cannot be written now is written by the hourly job; the page says why.
    ctx.log.warn("the app's manifest was not written after HR changed", {
      code: error instanceof PluginError ? error.code : null,
    });
    await noteProblem(ctx, error instanceof Error ? error.message : null);
  }
}

export const hooks: Readonly<Record<string, HookHandler>> = {
  ...leaveHooks,
  "console:plugin.enabled": onLifecycle,
  "console:plugin.disabled": onLifecycle,
  "console:plugin.upgraded": onLifecycle,
  "console:person.email_changed": onPersonChanged,
  "console:person.reactivated": onPersonChanged,
  "console:person.deactivated": onPersonChanged,
};
