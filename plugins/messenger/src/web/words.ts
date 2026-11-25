// The words the pages show, in English and Korean, chosen by the language the console sends:
// the tag's pack, else its primary subtag's, else English. Nothing a page shows is a literal
// elsewhere.
import type {
  AddressState,
  Cadence,
  FixedSecretName,
  HrState,
  MatchState,
  NoteCode,
  NoticeChoice,
  NoticeGroup,
  Outcome,
  RouteAs,
  RouteKind,
} from "../shared/contracts.js";

/** A note that must be read: a few words that say it, and the sentence under them. */
export interface Note {
  readonly title: string;
  readonly body: string;
}

export interface Words {
  readonly failed: string;
  readonly yes: string;
  readonly no: string;
  readonly never: string;
  readonly refresh: string;
  readonly openSettings: string;
  readonly languages: Readonly<Record<"en" | "ko", string>>;
  readonly connection: {
    readonly title: string;
    readonly lead: string;
    readonly next: string;
    readonly ready: string;
    readonly problem: string;
    readonly steps: string;
    readonly address: string;
    readonly addressState: Readonly<Record<AddressState, string>>;
    readonly addressHint: Readonly<Record<AddressState, string>>;
    readonly token: string;
    readonly tokenSet: (expires: string) => string;
    readonly tokenPasted: string;
    readonly tokenMissing: string;
    readonly app: string;
    readonly appMissing: string;
    readonly appMade: (appId: string) => string;
    readonly appLanguage: string;
    readonly appName: string;
    readonly appNameHint: string;
    readonly botName: string;
    readonly botNameHint: string;
    readonly icon: string;
    readonly iconHint: string;
    readonly handle: string;
    readonly iconState: Readonly<Record<"none" | "set" | "manual" | "waiting" | "refused", string>>;
    readonly iconManual: string;
    readonly openInSlack: string;
    readonly make: string;
    readonly update: string;
    readonly install: string;
    readonly installedIn: (names: string) => string;
    readonly notInstalled: string;
    readonly installOpen: string;
    readonly installAnother: string;
    readonly installPrepare: string;
    readonly installLink: (until: string) => string;
    readonly installHint: string;
    readonly distribution: string;
    readonly openDistribution: string;
    readonly workspaces: string;
    readonly noWorkspace: string;
    readonly people: string;
    readonly botToken: string;
    readonly tokenKept: string;
    readonly default: string;
    readonly makeDefault: string;
    readonly matchedCount: (count: string) => string;
    readonly notMatchedYet: string;
    readonly remove: string;
    readonly removeSure: string;
    readonly waiting: string;
    readonly accept: string;
    readonly acceptHint: string;
    readonly accountsTitle: string;
    readonly accounts: Readonly<Record<"told" | "administrator", string>>;
    readonly accountsHint: string;
    readonly told: string;
    readonly toldHint: (workspace: string) => string;
    readonly toldNone: string;
    readonly toldUnseen: (count: string) => string;
    readonly project: string;
    readonly toldAdd: string;
    readonly toldRemove: (project: string) => string;
    readonly done: string;
    readonly todo: string;
    readonly blocked: string;
    readonly appEdit: string;
    readonly details: string;
    readonly workspace: string;
    readonly bot: string;
    readonly shortcut: string;
    readonly shortcutOn: string;
    readonly shortcutOff: string;
    readonly renewed: string;
    readonly secrets: string;
    readonly secretNames: Readonly<Record<FixedSecretName, string>>;
    readonly secretFrom: (source: string) => string;
    readonly secretPasted: string;
    readonly secretUnset: string;
    readonly expires: (when: string) => string;
    readonly hr: string;
    readonly hrState: Readonly<Record<HrState, string>>;
    readonly hrHint: Readonly<Record<HrState, string>>;
    readonly hrVersion: (version: string, range: string) => string;
    readonly hrRole: string;
    readonly hrGranted: string;
    readonly hrNotGranted: string;
    readonly hrGrantHint: string;
    readonly tryIt: string;
    readonly testChannel: string;
    readonly testChannelHint: string;
    readonly test: string;
    readonly disconnect: string;
    readonly disconnectSure: string;
    readonly disconnectHint: string;
    readonly failures: (count: string) => Note;
  };
  readonly routes: {
    readonly title: string;
    readonly lead: string;
    readonly notConnected: Note;
    readonly list: string;
    readonly none: string;
    readonly kind: string;
    readonly channel: string;
    readonly workspace: string;
    readonly workspaceGone: string;
    readonly language: string;
    readonly as: string;
    readonly kinds: Readonly<Record<RouteKind, string>>;
    readonly kindHints: Readonly<Record<RouteKind, string>>;
    readonly asNames: Readonly<Record<RouteAs, string>>;
    readonly asHints: Readonly<Record<RouteAs, string>>;
    readonly remove: string;
    readonly add: string;
    readonly save: string;
    readonly channelPick: string;
    readonly channelPrivate: string;
    readonly noChannels: string;
    readonly connectFirst: string;
    readonly saved: string;
  };
  readonly people: {
    readonly title: string;
    readonly lead: string;
    readonly notConnected: Note;
    readonly matchNow: string;
    readonly lastMatched: string;
    readonly matchedAt: (when: string) => string;
    readonly neverMatched: string;
    readonly states: Readonly<Record<MatchState, string>>;
    readonly stateHints: Readonly<Record<MatchState, string>>;
    readonly all: string;
    readonly person: string;
    readonly state: string;
    readonly account: string;
    readonly accountIn: (name: string, workspace: string) => string;
    readonly nobody: string;
    readonly more: (shown: string, total: string) => string;
  };
  readonly notifications: {
    readonly title: string;
    readonly lead: string;
    readonly noAccount: Note;
    readonly choose: string;
    readonly chooseHint: string;
    readonly chooseHintOff: string;
    readonly offThere: string;
    readonly projectsOff: (names: string) => string;
    readonly openConsole: string;
    readonly groups: Readonly<Record<NoticeGroup, string>>;
    readonly kinds: Readonly<Record<NoticeChoice, string>>;
    readonly when: string;
    readonly cadences: Readonly<Record<Cadence, string>>;
    readonly at: string;
    readonly atHint: (zone: string) => string;
    readonly save: string;
    /** The console's own settings, where what one is told at all is chosen. */
    readonly where: string;
    readonly workspace: string;
    readonly nowhere: string;
    readonly whereHint: string;
    readonly waiting: (count: string) => string;
    readonly defaults: string;
    readonly defaultsHint: string;
    readonly reset: string;
  };
  readonly activity: {
    readonly title: string;
    readonly lead: string;
    readonly all: string;
    readonly outcomes: Readonly<Record<Outcome, string>>;
    readonly when: string;
    readonly event: string;
    readonly outcome: string;
    readonly note: string;
    readonly attempt: string;
    readonly none: string;
    readonly kinds: Readonly<Record<string, string>>;
    readonly notes: Readonly<Record<NoteCode, (detail: string) => string>>;
  };
}

const EN: Words = {
  failed: "Something went wrong.",
  yes: "Yes",
  no: "No",
  never: "Never",
  refresh: "Refresh",
  openSettings: "Open the plugin's settings",
  languages: { en: "English", ko: "Korean" },
  connection: {
    title: "Connection",
    lead: "Slack, connected through one app the console makes and keeps, installed in each workspace that takes it.",
    next: "Next",
    ready: "Ready",
    problem: "Something went wrong",
    steps: "Getting connected",
    address: "The console's address",
    addressState: {
      ok: "Reachable",
      none: "None",
      not_https: "Not https",
      private: "Private",
    },
    addressHint: {
      ok: "Slack reaches the console at this address.",
      none: "The deployment names no public address (PUBLIC_URL), so Slack cannot reach the console.",
      not_https:
        "Slack reaches an app over https alone; the deployment serves the console over https first.",
      private:
        "This address is on this machine or a private network, where Slack cannot reach it. Slack needs a public https address.",
    },
    token: "App configuration token",
    tokenSet: (expires) => `Set; renewed by the plugin, next before ${expires}`,
    tokenPasted: "Set by an administrator; the plugin renews it within the hour",
    tokenMissing:
      "Not set. At api.slack.com/apps, under Your App Configuration Tokens, generate a token for the workspace; an administrator pastes the access token and the refresh token on the plugin's settings page.",
    app: "The app",
    appMissing:
      "Not made yet. The plugin makes it from its manifest, with the configuration token.",
    appMade: (appId) => `Made in Slack (${appId}).`,
    appLanguage: "Language in Slack",
    appName: "App name",
    appNameHint: "Up to 35 characters, in any script. Left empty, the language's own.",
    botName: "Bot name",
    botNameHint:
      "Latin letters, digits, spaces, '.', '_' and '-', 80 at most: Slack makes the handle (@) from it. Renamed once installed, the handle may stay; disconnect and connect again while nobody uses the app.",
    icon: "Icon",
    iconHint:
      "The public https address of a square image of 512 to 2000 pixels, which Slack fetches.",
    handle: "Handle",
    iconState: {
      none: "Slack's own",
      set: "Set",
      manual: "Upload by hand",
      waiting: "Not set yet",
      refused: "Refused by Slack",
    },
    iconManual:
      "The configuration token may not set the icon: upload it on Slack's page of the app, under Display Information.",
    openInSlack: "Open in Slack",
    make: "Make the app",
    update: "Update the app",
    install: "Installed in a workspace",
    installedIn: (names) => `Installed in ${names}.`,
    notInstalled: "Not installed yet.",
    installOpen: "Install in Slack",
    installAnother: "Install in another workspace",
    installPrepare: "Prepare an installation link",
    installLink: (until) =>
      `Or hand this link to whoever may install apps there. It is good once, until ${until}:`,
    installHint:
      "Someone who may install apps in a workspace opens it in a new tab, with or without an account on the console; Slack then opens the app there.",
    distribution:
      "A workspace other than the one the app was made in takes it once its distribution is turned on, once, on Slack's page: Activate Public Distribution.",
    openDistribution: "Open Slack's distribution page",
    workspaces: "Workspaces",
    noWorkspace: "The app is not installed in a workspace yet.",
    people: "People",
    botToken: "Bot token",
    tokenKept: "Kept",
    default: "Default",
    makeDefault: "Make default",
    matchedCount: (count) => `${count} matched`,
    notMatchedYet: "Matched within the hour",
    remove: "Disconnect",
    removeSure: "Press again to uninstall",
    waiting: "Waiting",
    accept: "Accept",
    acceptHint:
      "A workspace that installed the app through a link waits until you accept it: nothing is matched or told there before. Accept a workspace you know; disconnect any other.",
    accountsTitle: "Whose account is whose, for agent accounts",
    accounts: { told: "On", administrator: "Not until an administrator accepts it" },
    accountsHint:
      "An agent account is told which member wrote to it in Slack, and takes a supervisor's word there as an instruction: so only of a workspace an administrator of the console accepted.",
    told: "Where projects are told",
    toldHint: (workspace) =>
      `Projects are told in ${workspace}, the default. Add only those told in another workspace; whoever has no account there is told in the default.`,
    toldNone: "No project is told here.",
    toldUnseen: (count) => `${count} more are projects you may not see.`,
    project: "Project",
    toldAdd: "Add",
    toldRemove: (project) => `Tell ${project} in the default again`,
    done: "Done",
    todo: "To do",
    blocked: "Opens once the steps above are done.",
    appEdit: "Change the language, the names or the icon",
    details: "The app",
    workspace: "Workspace",
    bot: "Bot user",
    shortcut: "Leave shortcut",
    shortcutOn: "In the app",
    shortcutOff: "Not in the app",
    renewed: "Token renewed",
    secrets: "Secrets",
    secretNames: {
      slackConfigToken: "App configuration token",
      slackConfigRefreshToken: "Configuration refresh token",
      slackClientSecret: "Client secret",
      slackSigningSecret: "Signing secret",
    },
    secretFrom: (source) => `Received from ${source}`,
    secretPasted: "Set by an administrator",
    secretUnset: "Not set",
    expires: (when) => `expires ${when}`,
    hr: "HR",
    hrState: {
      on: "Connected",
      off: "Off",
      no_capability: "Not allowed",
      outside: "Other version",
    },
    hrHint: {
      on: "Leave is requested and cancelled from Slack with the shortcut, and each request's thread follows HR's events.",
      off: "HR is not enabled, so the shortcut is not in the app and no thread is begun.",
      no_capability:
        "HR's api is not turned on for the messenger: an administrator turns on plugins:hr on the plugin's settings page.",
      outside:
        "This version of HR is not one the messenger was written for, so it leaves HR alone.",
    },
    hrVersion: (version, range) => `HR ${version}; the messenger reads ${range}`,
    hrRole: "Role asked of HR",
    hrGranted: "Granted",
    hrNotGranted: "Not granted",
    hrGrantHint:
      "Without HR's role the messenger cannot read a request, and no thread is begun. An administrator grants it on the plugin's settings page.",
    tryIt: "Try it",
    testChannel: "Channel",
    testChannelHint: "A channel's id (C0123ABCD); left empty, a direct message to you.",
    test: "Send a test message",
    disconnect: "Disconnect everything",
    disconnectSure: "Press again to uninstall and delete",
    disconnectHint:
      "Uninstalls the app from every workspace and deletes it, to start again with a new one. Each workspace keeps its routes and its matched accounts, which come back when the app is installed there again.",
    failures: (count) => ({
      title: `${count} deliveries failed in the last day`,
      body: "The Activity page says why.",
    }),
  },
  routes: {
    title: "Routes",
    lead: "Which events go to which channel, in which language, under whose name.",
    notConnected: {
      title: "Connect Slack first",
      body: "A route names a channel of a workspace.",
    },
    list: "Routes",
    none: "No route yet: nothing goes to a channel.",
    kind: "What",
    channel: "Channel",
    workspace: "Workspace",
    workspaceGone: "Not installed now",
    language: "Language",
    as: "Under whose name",
    kinds: { "hr:leave-approved": "Leave, once approved" },
    kindHints: {
      "hr:leave-approved":
        "Who is out and when, with the kind of leave where HR shows it to colleagues; never the reason. Struck through if it is cancelled.",
    },
    asNames: { person: "The person's", app: "The app's" },
    asHints: {
      person:
        "In the person's name and picture, under the app's mark; the app's, naming them, where their account is not matched.",
      app: "Always the app's, naming the person.",
    },
    remove: "Remove",
    add: "Add a route",
    save: "Save the route",
    channelPick: "Choose a channel",
    channelPrivate: "private",
    noChannels: "Slack lists no channel the app can post to.",
    connectFirst: "Connect Slack to choose a channel",
    saved: "Saved.",
  },
  people: {
    title: "People",
    lead: "Each person matched to their Slack account by email: the console's address against the workspace's members.",
    notConnected: {
      title: "Connect Slack first",
      body: "Then the people are matched within the hour, and every day after.",
    },
    matchNow: "Match now",
    lastMatched: "Last matched",
    matchedAt: (when) => when,
    neverMatched: "Not matched yet",
    states: {
      matched: "Matched",
      no_email: "No email",
      no_account: "No account",
      not_checked: "Not checked",
    },
    stateHints: {
      matched: "Messages about them carry their name; they may use the shortcut and the buttons.",
      no_email:
        "The console knows no address for them: an administrator writes it on the console's People page.",
      no_account: "No member of any workspace the app is in has their address.",
      not_checked: "Matched at the next run.",
    },
    all: "Everyone",
    person: "Person",
    state: "State",
    account: "Slack account",
    accountIn: (name, workspace) => `${name} in ${workspace}`,
    nobody: "Nobody here.",
    more: (shown, total) => `${shown} of ${total} shown.`,
  },
  notifications: {
    title: "My Slack notifications",
    lead: "Which of what the console tells you reaches you in Slack too, and when. Your agent chooses the same with notify.",
    noAccount: {
      title: "No Slack account of yours is matched",
      body: "None is matched in a workspace the app is in, so nothing reaches you yet: the address in Slack is the one the console knows for you.",
    },
    choose: "What, and when",
    chooseHint:
      "What is off in the console stays off in Slack. Turn it on in its notification settings, or by a task's bell.",
    chooseHintOff:
      "What is dimmed is off in the console. Turn it on in its notification settings, or by a task's bell.",
    offThere: "Off in the console",
    projectsOff: (names) =>
      `Projects off in the console: ${names}. Of those, only tasks whose bell is on are sent.`,
    openConsole: "Console notification settings",
    groups: {
      tasks: "Tasks",
      decisions: "Decisions",
      agents: "Agent accounts",
      followed: "Tasks whose bell is on",
    },
    kinds: {
      assigned: "Given to you",
      ready: "Ready to begin",
      moved: "Moved",
      changed: "Changed",
      commented: "Comment",
      archived: "Put away",
      decision: "Waits for your answer",
      answered: "Your question was answered",
      agent: "Your agent account",
      followed: "Everything on them",
    },
    when: "When",
    cadences: { now: "As it happens", daily: "Once a day" },
    at: "At",
    atHint: (zone) => `In the workspace's time zone, ${zone}, within a few minutes after.`,
    save: "Save",
    where: "Where",
    workspace: "Workspace",
    nowhere: "Nowhere yet.",
    whereHint:
      "In a direct message, in the workspace the project is told in where you have an account there, else the default.",
    waiting: (count) => `${count} waiting for the day's message.`,
    defaults: "Back to the defaults",
    defaultsHint: "Everything the console tells you, as it happens.",
    reset: "Reset",
  },
  activity: {
    title: "Activity",
    lead: "How each notification the messenger had someone to send to went, kept for a month. Whose it was and what it was about are not shown.",
    all: "All",
    outcomes: { sent: "Sent", skipped: "Passed over", failed: "Failed" },
    when: "When",
    event: "Event",
    outcome: "Outcome",
    note: "What happened",
    attempt: "Try",
    none: "Nothing yet.",
    kinds: {
      "plugin:hr:leave-requested": "Leave requested",
      "plugin:hr:leave-advanced": "Next step",
      "plugin:hr:leave-approved": "Leave approved",
      "plugin:hr:leave-rejected": "Leave rejected",
      "plugin:hr:leave-returned": "Sent back",
      "plugin:hr:leave-cancelling": "Cancellation asked",
      "plugin:hr:leave-cancelled": "Leave cancelled",
      "plugin:hr:leave-kept": "Leave kept",
      "console:task.created": "Task created",
      "console:task.updated": "Task changed",
      "console:task.moved": "Task moved",
      "console:task.commented": "Task commented",
      "console:task.archived": "Task put away",
      "console:decision.raised": "Decision raised",
      "console:decision.addressed": "Decision addressed",
      "console:decision.answered": "Decision answered",
      "console:agent.state_changed": "Agent account state",
    },
    notes: {
      told: (count) => (count === "1" ? "Sent on to 1 person." : `Sent on to ${count} people.`),
      unreached: () => "Nobody the console told of it takes it in Slack.",
      thread: () => "The conversation is begun and the step asked.",
      nobody: () => "Nobody of this request is in Slack.",
      next_step: () => "The step is closed and the next asked.",
      approved: (posts) => `Said in the thread; ${posts} channel posts.`,
      approved_partly: (channels) => `Said in the thread; not posted to ${channels}.`,
      rejected: () => "The rejection is said in the thread.",
      returned: () => "The request sent back is said in the thread.",
      cancel_asked: () => "The cancellation is asked in the thread.",
      cancelled: (places) => `Struck through in ${places} places.`,
      kept: () => "The leave kept is said in the thread.",
      no_thread: () => "Nothing was told of this request before.",
      not_leave: () => "Not an event the messenger tells.",
      not_connected: () => "Slack is not connected.",
      no_capability: () => "HR's api is not turned on for the messenger.",
      outside: (version) => `HR ${version} is not a version the messenger reads.`,
      no_grant: () => "The messenger holds no role in HR to read the request.",
      hidden: () => "HR does not show the messenger the request.",
      slack: (code) => `Slack refused: ${code}.`,
      console: (code) => `The console refused: ${code}.`,
      rate_limited: () => "Slack asked to wait; the console tries again.",
      failed: () => "Something went wrong.",
    },
  },
};

const KO: Words = {
  failed: "문제가 생겼습니다.",
  yes: "예",
  no: "아니요",
  never: "없음",
  refresh: "새로고침",
  openSettings: "플러그인 설정 열기",
  languages: { en: "영어", ko: "한국어" },
  connection: {
    title: "연결",
    lead: "콘솔이 만들고 관리하는 앱 하나로 Slack을 연결하고, 받아들이는 워크스페이스마다 설치합니다.",
    next: "다음 할 일",
    ready: "준비 완료",
    problem: "문제가 생겼습니다",
    steps: "연결하기",
    address: "콘솔 주소",
    addressState: {
      ok: "연결 가능",
      none: "없음",
      not_https: "https 아님",
      private: "사설 주소",
    },
    addressHint: {
      ok: "Slack이 이 주소로 콘솔에 닿습니다.",
      none: "배포에 공개 주소(PUBLIC_URL)가 없어 Slack이 콘솔에 닿을 수 없습니다.",
      not_https: "Slack은 https로만 앱에 닿습니다. 배포에서 먼저 콘솔을 https로 서비스해야 합니다.",
      private:
        "이 주소는 이 컴퓨터나 사설망에 있어 Slack이 닿을 수 없습니다. Slack에는 공개된 https 주소가 필요합니다.",
    },
    token: "앱 설정 토큰",
    tokenSet: (expires) => `설정됨. 플러그인이 갱신하며, 다음 갱신은 ${expires} 전`,
    tokenPasted: "관리자가 설정함. 플러그인이 한 시간 안에 갱신합니다",
    tokenMissing:
      "설정되지 않았습니다. api.slack.com/apps의 Your App Configuration Tokens에서 워크스페이스의 토큰을 만들고, 관리자가 Access Token과 Refresh Token을 플러그인 설정 페이지에 붙여 넣으세요.",
    app: "앱",
    appMissing: "아직 만들지 않았습니다. 플러그인이 설정 토큰으로 매니페스트에서 앱을 만듭니다.",
    appMade: (appId) => `Slack에 만들어짐 (${appId}).`,
    appLanguage: "Slack에서 쓰는 언어",
    appName: "앱 이름",
    appNameHint: "35자까지, 한글도 됩니다. 비우면 언어별 기본값입니다.",
    botName: "봇 이름",
    botNameHint:
      "라틴 문자, 숫자, 공백, '.', '_', '-'로 80자까지. Slack이 이 이름에서 핸들(@)을 만듭니다. 설치한 뒤 바꾸면 핸들은 그대로일 수 있으니, 아무도 쓰지 않을 때 연결을 해제하고 다시 연결하세요.",
    icon: "아이콘",
    iconHint: "512~2000px 정사각형 이미지의 공개 https 주소. Slack이 직접 가져갑니다.",
    handle: "핸들",
    iconState: {
      none: "Slack 기본",
      set: "올림",
      manual: "손으로 올려야 함",
      waiting: "아직 올리지 않음",
      refused: "Slack이 받지 않음",
    },
    iconManual:
      "설정 토큰으로는 아이콘을 올릴 수 없습니다. Slack의 앱 페이지 Display Information에서 올리세요.",
    openInSlack: "Slack에서 열기",
    make: "앱 만들기",
    update: "앱 업데이트",
    install: "워크스페이스에 설치",
    installedIn: (names) => `${names}에 설치됨.`,
    notInstalled: "아직 설치하지 않았습니다.",
    installOpen: "Slack에 설치",
    installAnother: "다른 워크스페이스에 설치",
    installPrepare: "설치 링크 만들기",
    installLink: (until) =>
      `또는 그곳에 앱을 설치할 수 있는 사람에게 이 링크를 전하세요. ${until}까지 한 번 쓸 수 있습니다:`,
    installHint:
      "워크스페이스에 앱을 설치할 수 있는 사람이 새 탭에서 엽니다. 콘솔 계정이 없어도 됩니다. 설치하면 Slack이 그곳에서 앱을 엽니다.",
    distribution:
      "앱을 만든 워크스페이스가 아닌 곳에 설치하려면, Slack 페이지의 Activate Public Distribution에서 배포를 한 번 활성화해야 합니다.",
    openDistribution: "Slack 배포 페이지 열기",
    workspaces: "워크스페이스",
    noWorkspace: "아직 앱을 설치한 워크스페이스가 없습니다.",
    people: "사람",
    botToken: "봇 토큰",
    tokenKept: "보관됨",
    default: "기본",
    makeDefault: "기본으로",
    matchedCount: (count) => `${count}명 연결`,
    notMatchedYet: "한 시간 안에 연결",
    remove: "연결 해제",
    removeSure: "한 번 더 누르면 제거합니다",
    waiting: "수락 대기",
    accept: "수락",
    acceptHint:
      "링크로 앱을 설치한 워크스페이스는 수락할 때까지 기다립니다. 그 전에는 계정을 연결하지도, 알리지도 않습니다. 아는 워크스페이스만 수락하고, 아니면 연결을 해제하세요.",
    accountsTitle: "에이전트 계정에 알리는 계정 연결",
    accounts: { told: "활성", administrator: "관리자의 수락이 필요함" },
    accountsHint:
      "에이전트 계정은 Slack에서 어느 구성원이 썼는지 듣고, 감독자의 말을 지시로 받습니다. 그래서 콘솔 관리자가 수락한 워크스페이스의 계정 연결만 알립니다.",
    told: "프로젝트를 알리는 곳",
    toldHint: (workspace) =>
      `프로젝트는 기본 워크스페이스인 ${workspace}에 알립니다. 다른 워크스페이스에 알릴 것만 추가하세요. 그곳에 계정이 없는 사람에게는 기본 워크스페이스에서 알립니다.`,
    toldNone: "여기에 알리는 프로젝트가 없습니다.",
    toldUnseen: (count) => `볼 수 없는 프로젝트 ${count}개가 더 있습니다.`,
    project: "프로젝트",
    toldAdd: "추가",
    toldRemove: (project) => `${project}: 기본 워크스페이스로 되돌리기`,
    done: "완료",
    todo: "할 일",
    blocked: "위 단계를 마치면 열립니다.",
    appEdit: "언어, 이름, 아이콘 바꾸기",
    details: "앱",
    workspace: "워크스페이스",
    bot: "봇 사용자",
    shortcut: "휴가 단축키",
    shortcutOn: "앱에 있음",
    shortcutOff: "앱에 없음",
    renewed: "토큰 갱신",
    secrets: "비밀 값",
    secretNames: {
      slackConfigToken: "앱 설정 토큰",
      slackConfigRefreshToken: "설정 갱신 토큰",
      slackClientSecret: "클라이언트 시크릿",
      slackSigningSecret: "서명 시크릿",
    },
    secretFrom: (source) => `${source}에서 받아 저장됨`,
    secretPasted: "관리자가 설정",
    secretUnset: "없음",
    expires: (when) => `${when} 만료`,
    hr: "HR",
    hrState: {
      on: "연결됨",
      off: "비활성",
      no_capability: "허용 안 됨",
      outside: "다른 버전",
    },
    hrHint: {
      on: "Slack에서 단축키로 휴가를 신청하고 취소하며, 신청마다 HR의 알림을 따라 스레드가 이어집니다.",
      off: "HR이 활성화되어 있지 않아 단축키가 앱에 없고 스레드도 만들지 않습니다.",
      no_capability:
        "메신저에 HR의 api가 활성화되어 있지 않습니다. 관리자가 플러그인 설정 페이지에서 plugins:hr을 활성화해야 합니다.",
      outside: "메신저가 읽도록 만들어진 HR 버전이 아니라 HR을 건드리지 않습니다.",
    },
    hrVersion: (version, range) => `HR ${version}, 메신저가 읽는 범위 ${range}`,
    hrRole: "HR에 요청한 역할",
    hrGranted: "부여됨",
    hrNotGranted: "부여되지 않음",
    hrGrantHint:
      "HR의 역할이 없으면 메신저가 신청을 읽지 못해 스레드를 만들지 않습니다. 관리자가 플러그인 설정 페이지에서 부여합니다.",
    tryIt: "시험해 보기",
    testChannel: "채널",
    testChannelHint: "채널 ID(C0123ABCD). 비워 두면 나에게 DM으로 보냅니다.",
    test: "시험 메시지 보내기",
    disconnect: "모두 연결 해제",
    disconnectSure: "한 번 더 누르면 제거하고 지웁니다",
    disconnectHint:
      "모든 워크스페이스에서 앱을 제거하고 지워, 새 앱으로 다시 시작합니다. 워크스페이스마다 채널 알림과 계정 연결은 남아, 그곳에 다시 설치하면 돌아옵니다.",
    failures: (count) => ({
      title: `지난 하루 동안 ${count}건을 보내지 못했습니다`,
      body: "전송 기록에서 이유를 보세요.",
    }),
  },
  routes: {
    title: "채널 알림",
    lead: "어떤 알림을 어느 채널에, 어느 언어로, 누구 이름으로 보낼지 정합니다.",
    notConnected: {
      title: "먼저 Slack을 연결하세요",
      body: "경로는 워크스페이스의 채널을 가리킵니다.",
    },
    list: "경로",
    none: "아직 경로가 없어 채널로 가는 알림이 없습니다.",
    kind: "알림",
    channel: "채널",
    workspace: "워크스페이스",
    workspaceGone: "지금은 설치되지 않음",
    language: "언어",
    as: "누구 이름으로",
    kinds: { "hr:leave-approved": "승인된 휴가" },
    kindHints: {
      "hr:leave-approved":
        "누가 언제 쉬는지 알립니다. 휴가 종류는 HR 설정에서 동료에게 보일 때만 넣고, 사유는 넣지 않습니다. 취소되면 취소선을 긋습니다.",
    },
    asNames: { person: "당사자 이름", app: "앱 이름" },
    asHints: {
      person:
        "당사자의 이름과 사진으로, 앱 표시와 함께 올립니다. 계정이 연결되지 않은 사람은 앱 이름으로 올리고 본문에 이름을 적습니다.",
      app: "항상 앱 이름으로 올리고 본문에 이름을 적습니다.",
    },
    remove: "삭제",
    add: "경로 추가",
    save: "경로 저장",
    channelPick: "채널 선택",
    channelPrivate: "비공개",
    noChannels: "앱이 글을 올릴 수 있는 채널이 없습니다.",
    connectFirst: "Slack을 연결하면 채널을 고를 수 있습니다",
    saved: "저장했습니다.",
  },
  people: {
    title: "계정 연결",
    lead: "콘솔의 이메일과 워크스페이스 멤버를 맞춰, 사람마다 Slack 계정을 연결합니다.",
    notConnected: {
      title: "먼저 Slack을 연결하세요",
      body: "연결하면 한 시간 안에, 그 뒤로는 매일 계정을 맞춥니다.",
    },
    matchNow: "지금 맞추기",
    lastMatched: "마지막으로 맞춘 때",
    matchedAt: (when) => when,
    neverMatched: "아직 맞추지 않음",
    states: {
      matched: "연결됨",
      no_email: "이메일 없음",
      no_account: "계정 없음",
      not_checked: "확인 전",
    },
    stateHints: {
      matched: "이 사람에 관한 메시지에 이름이 실리고, 단축키와 버튼을 쓸 수 있습니다.",
      no_email: "콘솔에 이메일이 없습니다. 관리자가 콘솔의 사람 페이지에서 적어야 합니다.",
      no_account: "앱이 설치된 어느 워크스페이스에도 이 이메일을 쓰는 멤버가 없습니다.",
      not_checked: "다음 맞추기에서 확인합니다.",
    },
    all: "모두",
    person: "사람",
    state: "상태",
    account: "Slack 계정",
    accountIn: (name, workspace) => `${workspace}의 ${name}`,
    nobody: "해당하는 사람이 없습니다.",
    more: (shown, total) => `${total}명 중 ${shown}명을 보여 줍니다.`,
  },
  notifications: {
    title: "내 Slack 알림",
    lead: "콘솔이 알려 주는 것 가운데 무엇을 언제 Slack으로도 받을지 정합니다. 내 에이전트도 notify로 똑같이 정할 수 있습니다.",
    noAccount: {
      title: "연결된 내 Slack 계정이 없습니다",
      body: "앱이 설치된 워크스페이스에 내 계정이 연결되어 있지 않아 아직 아무것도 받지 못합니다. Slack의 이메일이 콘솔에 있는 내 이메일과 같아야 합니다.",
    },
    choose: "무엇을, 언제",
    chooseHint:
      "콘솔에서 비활성화된 알림은 Slack으로도 오지 않습니다. 콘솔 알림 설정이나 작업의 종에서 활성화할 수 있습니다.",
    chooseHintOff:
      "흐리게 보이는 알림은 콘솔에서 비활성화되어 있습니다. 콘솔 알림 설정이나 작업의 종에서 활성화할 수 있습니다.",
    offThere: "콘솔에서 비활성화됨",
    projectsOff: (names) =>
      `콘솔에서 비활성화된 프로젝트: ${names}. 직접 활성화한 작업의 소식만 옵니다.`,
    openConsole: "콘솔 알림 설정",
    groups: {
      tasks: "작업",
      decisions: "결정",
      agents: "에이전트 계정",
      followed: "직접 활성화한 작업",
    },
    kinds: {
      assigned: "나에게 맡겨짐",
      ready: "시작할 수 있음",
      moved: "상태 변경",
      changed: "내용 변경",
      commented: "댓글",
      archived: "보관됨",
      decision: "내 답을 기다리는 결정",
      answered: "내 질문에 답변",
      agent: "내 에이전트 계정",
      followed: "모든 소식",
    },
    when: "언제",
    cadences: { now: "그때그때", daily: "하루 한 번" },
    at: "시각",
    atHint: (zone) => `워크스페이스 시간대(${zone}) 기준이며, 그 시각부터 몇 분 안에 보냅니다.`,
    save: "저장",
    where: "받는 곳",
    workspace: "워크스페이스",
    nowhere: "아직 없음.",
    whereHint:
      "DM으로 받습니다. 프로젝트를 알리는 워크스페이스에 내 계정이 있으면 그곳에서, 없으면 기본 워크스페이스에서 받습니다.",
    waiting: (count) => `하루 알림을 기다리는 것 ${count}건.`,
    defaults: "기본값으로",
    defaultsHint: "콘솔이 알려 주는 것을 모두, 그때그때 받습니다.",
    reset: "되돌리기",
  },
  activity: {
    title: "전송 기록",
    lead: "메신저가 전달할 사람이 있던 알림의 결과를 한 달 동안 보관합니다. 누구에게 온 무슨 내용인지는 보이지 않습니다.",
    all: "모두",
    outcomes: { sent: "보냄", skipped: "건너뜀", failed: "실패" },
    when: "시각",
    event: "알림",
    outcome: "결과",
    note: "내용",
    attempt: "시도",
    none: "아직 없습니다.",
    kinds: {
      "plugin:hr:leave-requested": "휴가 신청",
      "plugin:hr:leave-advanced": "다음 결재",
      "plugin:hr:leave-approved": "휴가 승인",
      "plugin:hr:leave-rejected": "휴가 반려",
      "plugin:hr:leave-returned": "보완 요청",
      "plugin:hr:leave-cancelling": "취소 결재 요청",
      "plugin:hr:leave-cancelled": "휴가 취소",
      "plugin:hr:leave-kept": "휴가 유지",
      "console:task.created": "작업 생성",
      "console:task.updated": "작업 변경",
      "console:task.moved": "작업 이동",
      "console:task.commented": "작업 댓글",
      "console:task.archived": "작업 보관",
      "console:decision.raised": "결정 요청",
      "console:decision.addressed": "결정 담당 지정",
      "console:decision.answered": "결정 답변",
      "console:agent.state_changed": "에이전트 계정 상태",
    },
    notes: {
      told: (count) => `${count}명에게 전달했습니다.`,
      unreached: () => "콘솔이 알린 사람 가운데 Slack으로 받는 사람이 없습니다.",
      thread: () => "대화를 열고 결재를 요청했습니다.",
      nobody: () => "이 신청에 관련된 사람이 Slack에 없습니다.",
      next_step: () => "결재 단계를 닫고 다음 단계를 요청했습니다.",
      approved: (posts) => `스레드에 알리고 채널에 ${posts}건 올렸습니다.`,
      approved_partly: (channels) => `스레드에 알렸지만 ${channels}에는 올리지 못했습니다.`,
      rejected: () => "반려를 스레드에 알렸습니다.",
      returned: () => "보완 요청을 스레드에 알렸습니다.",
      cancel_asked: () => "취소 결재를 스레드에서 요청했습니다.",
      cancelled: (places) => `${places}곳에 취소선을 그었습니다.`,
      kept: () => "휴가 유지를 스레드에 알렸습니다.",
      no_thread: () => "이 신청은 전에 알린 것이 없습니다.",
      not_leave: () => "메신저가 알리는 알림이 아닙니다.",
      not_connected: () => "Slack이 연결되지 않았습니다.",
      no_capability: () => "메신저에 HR의 api가 활성화되어 있지 않습니다.",
      outside: (version) => `메신저가 읽지 않는 HR 버전입니다(${version}).`,
      no_grant: () => "메신저에 신청을 읽을 HR 역할이 없습니다.",
      hidden: () => "HR이 메신저에게 이 신청을 보여 주지 않습니다.",
      slack: (code) => `Slack이 거절했습니다: ${code}.`,
      console: (code) => `콘솔이 거절했습니다: ${code}.`,
      rate_limited: () => "Slack이 기다려 달라고 해서 콘솔이 다시 시도합니다.",
      failed: () => "문제가 생겼습니다.",
    },
  },
};

const PACKS: Readonly<Record<string, Words>> = { en: EN, ko: KO };

/** The pack of a language: the tag's, else its primary subtag's, else English. */
export function wordsFor(language: string): Words {
  const tag = language.toLowerCase();
  return PACKS[tag] ?? PACKS[tag.split("-")[0] ?? ""] ?? EN;
}
