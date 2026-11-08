// The server module of the messenger: what the console runs in a thread of its own, reaching the
// console through `ctx` alone, and Slack through `ctx.fetch` with the secrets the console holds.
// The connection, the matching and the routes are the role holders' commands and queries; Slack's
// presses come in at the endpoint `slack` and the installation's return at `slack-oauth`; HR's
// events, HR's lifecycle and the people's changes come in at the hooks; the jobs keep the token,
// the manifest and the matching current. Everything imported here is bundled into
// dist/server/index.js by the build; the pieces are exported by name for the tests.
import { definePlugin } from "@skillcdn/console/plugin";
import { activity } from "./activity.js";
import { collections } from "./collections.js";
import { connect, disconnect, status, test } from "./connection.js";
import { hooks } from "./hooks.js";
import { jobs } from "./jobs.js";
import { match, people } from "./matching.js";
import { slackOauthEndpoint } from "./oauth.js";
import { channels, route, routesQuery, unroute } from "./routes.js";
import { slackEndpoint } from "./slack/interactions.js";

export { activity } from "./activity.js";
export {
  collections,
  connections,
  deliveries,
  links,
  routes,
  threads,
} from "./collections.js";
export {
  connect,
  disconnect,
  keepConnection,
  keepManifest,
  renewConfigToken,
  status,
  test,
} from "./connection.js";
export { hooks, onLifecycle } from "./hooks.js";
export { HR_VERSIONS } from "./integrations/hr/contract.js";
export { LEAVE_EVENTS, onLeaveEvent } from "./integrations/hr/thread.js";
export { jobs, keep, match as matchJob } from "./jobs.js";
export { match, matchEveryone, matchOne, onPersonChanged, people } from "./matching.js";
export { slackOauthEndpoint } from "./oauth.js";
export { channels, route, routesQuery, unroute } from "./routes.js";
export { slackEndpoint } from "./slack/interactions.js";

export default definePlugin({
  collections,
  commands: { connect, disconnect, test, match, route, unroute },
  queries: { status, people, routes: routesQuery, channels, activity },
  endpoints: { slack: slackEndpoint, "slack-oauth": slackOauthEndpoint },
  on: hooks,
  jobs,
});
