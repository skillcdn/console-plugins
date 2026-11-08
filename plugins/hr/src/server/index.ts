// The server module of HR: what the console runs in a thread of its own, reaching the console
// through `ctx` alone. Leave is its first area of work: the collections, the commands and the
// queries of leave, the hooks that hear a decision answered and people leaving or coming back,
// and the daily job. Announcements stand beside it. What other plugins may call and hear is the
// api and the events, the plugin's contract with them (README.md, "The contract"). Everything
// imported here is bundled into dist/server/index.js by the build; the pieces are exported by name
// for the tests.
import { definePlugin } from "@skillcdn/console/plugin";
import {
  announcement,
  announcementPicture,
  announcementsQuery,
  announcementView,
} from "./announcements.js";
import { collections } from "./collections.js";
import { api } from "./leave/api.js";
import { commands } from "./leave/commands.js";
import { hooks } from "./leave/hooks.js";
import { jobs } from "./leave/jobs.js";
import { queries } from "./leave/queries.js";
import { upgrades } from "./upgrades.js";

export {
  announcement,
  announcementPicture,
  announcementsQuery,
  announcementView,
} from "./announcements.js";
export {
  announcementPictures,
  announcements,
  chores,
  collections,
  config,
  holidays,
  ledger,
  marks,
  people,
  policies,
  requests,
  types,
} from "./collections.js";
export { EVENTS, type EventKind } from "./events.js";
export { api } from "./leave/api.js";
export {
  accrue,
  adjust,
  cancel,
  commands,
  configure,
  enroll,
  generateHolidays,
  holiday,
  offboard,
  policy,
  recount,
  request,
  reverse,
  setup,
  type,
} from "./leave/commands.js";
export {
  hooks,
  onDecisionAnswered,
  onPersonDeactivated,
  onPersonReactivated,
} from "./leave/hooks.js";
export { daily, jobs, runDaily } from "./leave/jobs.js";
export {
  balance,
  calendar,
  configQuery,
  exportQuery,
  holidaysQuery,
  ledgerQuery,
  overview,
  peopleQuery,
  policiesQuery,
  presetsQuery,
  preview,
  queries,
  requestsQuery,
  requestView,
  typesQuery,
} from "./leave/queries.js";
export { upgrades } from "./upgrades.js";

export default definePlugin({
  collections,
  commands: {
    ...commands,
    announcement,
    "announcement-picture": announcementPicture,
  },
  queries: {
    ...queries,
    announcements: announcementsQuery,
    "announcement-view": announcementView,
  },
  on: hooks,
  jobs,
  upgrades,
  api,
});
