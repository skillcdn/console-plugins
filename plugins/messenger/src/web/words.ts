// The words the pages show, in English and Korean, chosen by the language the console sends:
// the tag's pack, else its primary subtag's, else English. Nothing a page shows is a literal
// elsewhere.
import type {
  AddressState,
  HrState,
  MatchState,
  NoteCode,
  Outcome,
  RouteAs,
  RouteKind,
  SecretName,
} from "../shared/contracts.js";

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
    readonly make: string;
    readonly update: string;
    readonly install: string;
    readonly installed: (team: string) => string;
    readonly notInstalled: string;
    readonly installOpen: string;
    readonly installPrepare: string;
    readonly installHint: string;
    readonly installedBy: (who: string, when: string) => string;
    readonly done: string;
    readonly todo: string;
    readonly details: string;
    readonly workspace: string;
    readonly bot: string;
    readonly shortcut: string;
    readonly shortcutOn: string;
    readonly shortcutOff: string;
    readonly renewed: string;
    readonly secrets: string;
    readonly secretNames: Readonly<Record<SecretName, string>>;
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
    readonly failures: (count: string) => string;
  };
  readonly routes: {
    readonly title: string;
    readonly lead: string;
    readonly notConnected: string;
    readonly list: string;
    readonly none: string;
    readonly kind: string;
    readonly channel: string;
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
    readonly notConnected: string;
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
    readonly nobody: string;
    readonly more: (shown: string, total: string) => string;
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
    title: "Slack",
    lead: "The workspace's Slack, connected through an app the console makes and keeps.",
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
    appLanguage: "Names in Slack",
    make: "Make the app",
    update: "Update the app",
    install: "Installed in the workspace",
    installed: (team) => `Installed in ${team}.`,
    notInstalled: "Not installed yet.",
    installOpen: "Install in Slack",
    installPrepare: "Prepare the installation",
    installHint:
      "Someone who may install apps in the workspace presses it; Slack's page opens in a new tab and comes back here.",
    installedBy: (who, when) => `By ${who}, ${when}`,
    done: "Done",
    todo: "To do",
    details: "The connection",
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
      slackBotToken: "Bot token",
    },
    secretFrom: (source) => `Sealed from ${source}`,
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
      on: "Leave is requested from Slack with the shortcut, and each request's thread follows HR's events.",
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
    disconnect: "Disconnect",
    disconnectSure: "Press again to uninstall and delete",
    disconnectHint:
      "Uninstalls the app from the workspace and deletes it. Connecting again makes a new app: in this workspace, the routes and the matched accounts stay; in another, they go, and its people are matched within the hour.",
    failures: (count) => `${count} deliveries failed in the last day; the Activity page says why.`,
  },
  routes: {
    title: "Routes",
    lead: "Which events go to which channel, in which language, under whose name.",
    notConnected: "Connect Slack first: a route names a channel of the workspace.",
    list: "Routes",
    none: "No route yet: nothing goes to a channel.",
    kind: "What",
    channel: "Channel",
    language: "Language",
    as: "Under whose name",
    kinds: { "hr:leave-approved": "Leave, once approved" },
    kindHints: {
      "hr:leave-approved":
        "Who is out, when, and the kind of leave; never the reason. Struck through if it is cancelled.",
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
    notConnected:
      "Connect Slack first; then the people are matched within the hour, and every day after.",
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
      no_account: "No member of the workspace has their address.",
      not_checked: "Matched at the next run.",
    },
    all: "Everyone",
    person: "Person",
    state: "State",
    account: "Slack account",
    nobody: "Nobody here.",
    more: (shown, total) => `${shown} of ${total} shown.`,
  },
  activity: {
    title: "Activity",
    lead: "What the messenger did with each event it heard, kept for a month.",
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
    },
    notes: {
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
    title: "Slack",
    lead: "콘솔이 만들고 관리하는 앱으로 워크스페이스의 Slack을 연결합니다.",
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
    appLanguage: "Slack에 보이는 이름",
    make: "앱 만들기",
    update: "앱 업데이트",
    install: "워크스페이스에 설치",
    installed: (team) => `${team}에 설치됨.`,
    notInstalled: "아직 설치하지 않았습니다.",
    installOpen: "Slack에 설치",
    installPrepare: "설치 준비",
    installHint:
      "워크스페이스에 앱을 설치할 수 있는 사람이 누르세요. 새 탭에 Slack 페이지가 열리고, 설치하면 이 페이지로 돌아옵니다.",
    installedBy: (who, when) => `${who}, ${when}`,
    done: "완료",
    todo: "할 일",
    details: "연결",
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
      slackBotToken: "봇 토큰",
    },
    secretFrom: (source) => `${source}에서 봉인`,
    secretPasted: "관리자가 설정",
    secretUnset: "없음",
    expires: (when) => `${when} 만료`,
    hr: "HR",
    hrState: {
      on: "연결됨",
      off: "꺼짐",
      no_capability: "허용 안 됨",
      outside: "다른 버전",
    },
    hrHint: {
      on: "Slack에서 단축키로 휴가를 신청하고, 신청마다 HR의 알림을 따라 스레드가 이어집니다.",
      off: "HR이 켜져 있지 않아 단축키가 앱에 없고 스레드도 만들지 않습니다.",
      no_capability:
        "메신저에 HR의 api가 켜져 있지 않습니다. 관리자가 플러그인 설정 페이지에서 plugins:hr을 켜야 합니다.",
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
    disconnect: "연결 해제",
    disconnectSure: "한 번 더 누르면 제거하고 지웁니다",
    disconnectHint:
      "워크스페이스에서 앱을 제거하고 지웁니다. 다시 연결하면 새 앱을 만듭니다. 같은 워크스페이스면 채널 알림과 계정 연결이 그대로 남고, 다른 워크스페이스면 지워지며 그곳 사람들의 계정은 한 시간 안에 다시 연결됩니다.",
    failures: (count) =>
      `지난 하루 동안 ${count}건을 보내지 못했습니다. 전송 기록에서 이유를 보세요.`,
  },
  routes: {
    title: "채널 알림",
    lead: "어떤 알림을 어느 채널에, 어느 언어로, 누구 이름으로 보낼지 정합니다.",
    notConnected: "먼저 Slack을 연결하세요. 경로는 워크스페이스의 채널을 가리킵니다.",
    list: "경로",
    none: "아직 경로가 없어 채널로 가는 알림이 없습니다.",
    kind: "알림",
    channel: "채널",
    language: "언어",
    as: "누구 이름으로",
    kinds: { "hr:leave-approved": "승인된 휴가" },
    kindHints: {
      "hr:leave-approved":
        "누가, 언제, 어떤 휴가로 쉬는지. 사유는 넣지 않습니다. 취소되면 취소선을 긋습니다.",
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
    notConnected: "먼저 Slack을 연결하세요. 연결하면 한 시간 안에, 그 뒤로는 매일 맞춥니다.",
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
      no_account: "이 이메일을 쓰는 워크스페이스 멤버가 없습니다.",
      not_checked: "다음 맞추기에서 확인합니다.",
    },
    all: "모두",
    person: "사람",
    state: "상태",
    account: "Slack 계정",
    nobody: "해당하는 사람이 없습니다.",
    more: (shown, total) => `${total}명 중 ${shown}명을 보여 줍니다.`,
  },
  activity: {
    title: "전송 기록",
    lead: "메신저가 받은 알림마다 한 일을 한 달 동안 보관합니다.",
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
    },
    notes: {
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
      no_capability: () => "메신저에 HR의 api가 켜져 있지 않습니다.",
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
