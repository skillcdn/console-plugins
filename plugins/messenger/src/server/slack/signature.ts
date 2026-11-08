// Slack signs every request it sends with the app's signing secret: `v0=` and the hex of an
// HMAC-SHA256 over `v0:<timestamp>:<body>`. The console verifies it with the secret, which it
// sealed when the app was made and which signs nothing; the plugin never holds it. A request
// older or newer than five minutes is refused too, so that one caught on the way is not replayed.
import type { PluginContext } from "@skillcdn/console/plugin";

export const SIGNING_SECRET = "slackSigningSecret";
/** How far a request's timestamp may be from the console's clock. */
export const SKEW_SECONDS = 300;

export async function verifiedFromSlack(
  ctx: PluginContext,
  headers: Readonly<Record<string, string>>,
  body: string,
): Promise<boolean> {
  const signature = headers["x-slack-signature"] ?? "";
  const timestamp = headers["x-slack-request-timestamp"] ?? "";
  if (!/^v0=[0-9a-fA-F]{64}$/.test(signature) || !/^\d{1,12}$/.test(timestamp)) {
    return false;
  }
  const now = Math.floor(ctx.now().getTime() / 1000);
  if (Math.abs(now - Number(timestamp)) > SKEW_SECONDS) {
    return false;
  }
  try {
    return await ctx.secrets.verify(
      SIGNING_SECRET,
      `v0:${timestamp}:${body}`,
      signature.slice(3).toLowerCase(),
      "hmac-sha256",
    );
  } catch {
    return false;
  }
}
