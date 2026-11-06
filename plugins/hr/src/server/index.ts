// The server module of HR: what the console runs in a thread of its own, reaching the console
// through `ctx` alone. Leave is its first area of work: the collections, the commands and the
// queries of leave, the hook that hears a decision answered, and the daily job. Everything
// imported here is bundled into dist/server/index.js by the build; the pieces are exported by
// name for the tests.
import { definePlugin } from "@skillcdn/console/plugin";
import { collections } from "./collections.js";
import { commands } from "./leave/commands.js";
import { hooks } from "./leave/hooks.js";
import { jobs } from "./leave/jobs.js";
import { queries } from "./leave/queries.js";

export {
  collections,
  holidays,
  ledger,
  marks,
  people,
  policies,
  requests,
  types,
} from "./collections.js";
export {
  accrue,
  adjust,
  cancel,
  commands,
  enroll,
  generateHolidays,
  holiday,
  offboard,
  policy,
  request,
  setup,
  type,
} from "./leave/commands.js";
export { hooks, onDecisionAnswered } from "./leave/hooks.js";
export { daily, jobs, runDaily } from "./leave/jobs.js";
export {
  balance,
  calendar,
  exportQuery,
  holidaysQuery,
  ledgerQuery,
  overview,
  peopleQuery,
  policiesQuery,
  presetsQuery,
  queries,
  requestsQuery,
  typesQuery,
} from "./leave/queries.js";

export default definePlugin({
  collections,
  commands,
  queries,
  on: hooks,
  jobs,
});
