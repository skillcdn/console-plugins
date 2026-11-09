// The words the server module puts in front of people, in English and Korean: what a command
// answers and what it refuses with, in the caller's language; what Slack shows, in the language
// of whoever reads it (the person a form or a refusal is for, the requester of a thread, the
// deciders a step asks, the route's for a channel); and the names the app takes in Slack.
import type { Language } from "../shared/contracts.js";

/** The parts of a day as hr spells them, in the words a message says them in. */
export type PartWord = "none" | "am" | "pm" | "q1" | "q2" | "q3" | "q4";

export interface ServerWords {
  readonly refused: {
    readonly noRole: string;
    readonly noAddress: string;
    readonly notHttps: (url: string) => string;
    readonly privateAddress: (url: string) => string;
    readonly noConfigToken: string;
    readonly configTokenGone: string;
    readonly notMade: string;
    readonly notConnected: string;
    readonly callerNotMatched: string;
    readonly sealFailed: (what: string) => string;
    readonly slackSaid: (error: string) => string;
    readonly slackWait: (seconds: string) => string;
    readonly unknownChannel: (channel: string) => string;
    readonly privateNotMember: (channel: string) => string;
    readonly unknownRoute: string;
    readonly unknownPerson: string;
    readonly oauthStale: string;
    readonly oauthRefused: (error: string) => string;
  };
  readonly said: {
    readonly appMade: (url: string) => string;
    readonly appUpdated: (url: string) => string;
    readonly appInstalledUpdated: string;
    readonly disconnected: string;
    readonly disconnectedAppLeft: string;
    readonly testSent: (where: string) => string;
    readonly matched: (matched: string, unmatched: string) => string;
    readonly matchedOne: (name: string) => string;
    readonly notMatchedOne: (name: string) => string;
    readonly routeSaved: (id: string, channel: string) => string;
    readonly routeRemoved: (id: string) => string;
  };
  readonly app: {
    readonly name: string;
    readonly botName: string;
    readonly description: string;
    readonly shortcutName: string;
    readonly shortcutDescription: string;
    readonly test: string;
  };
  readonly form: {
    readonly title: string;
    readonly submit: string;
    readonly close: string;
    readonly kind: string;
    readonly from: string;
    readonly to: string;
    readonly toHint: string;
    /** The field of a part of a day, for a kind taken in halves, and for one taken in quarters. */
    readonly partHalf: string;
    readonly partQuarter: string;
    readonly partHint: string;
    readonly reason: string;
    readonly reasonRequired: string;
    readonly left: (list: string) => string;
    readonly toBeforeFrom: string;
    readonly failed: string;
    readonly noKinds: string;
    readonly notLinkedTitle: string;
    readonly notLinked: string;
    readonly notEnrolledTitle: string;
    readonly notEnrolled: string;
    readonly unavailableTitle: string;
    readonly unavailable: string;
  };
  /** One's upcoming leave on the form, and its cancellation, a form pushed over it. */
  readonly cancel: {
    readonly upcoming: string;
    readonly button: string;
    readonly states: Readonly<Record<"requested" | "returned" | "approved" | "cancelling", string>>;
    readonly more: (count: string, link: string | null) => string;
    readonly seeAll: string;
    readonly title: string;
    readonly submit: string;
    readonly back: string;
    readonly now: string;
    readonly decision: (names: string) => string;
    readonly decisionNobody: string;
    readonly cannot: string;
    readonly gone: string;
    readonly done: string;
    readonly asked: (names: string) => string;
    readonly askedNobody: string;
    readonly failed: string;
  };
  readonly press: {
    readonly notYours: (link: string) => string;
    readonly answered: string;
    readonly failed: string;
  };
  readonly thread: {
    readonly title: string;
    readonly requestedBy: (name: string) => string;
    readonly recordedBy: (name: string) => string;
    readonly late: string;
    readonly reason: string;
    readonly ask: (who: string) => string;
    readonly askCancel: (who: string) => string;
    readonly askNobody: string;
    readonly notInSlack: (names: string) => string;
    readonly onConsole: (link: string) => string;
    readonly about: (name: string, span: string) => string;
    readonly approve: string;
    readonly reject: string;
    readonly closedApproved: (name: string) => string;
    readonly closedRejected: (name: string) => string;
    readonly closedReturned: (name: string) => string;
    readonly closedAnswered: string;
    readonly closedCancelled: string;
    readonly approved: string;
    readonly rejected: (name: string) => string;
    readonly returned: (name: string) => string;
    readonly cancelling: string;
    readonly cancelled: string;
    readonly kept: string;
    readonly note: string;
    readonly someone: string;
  };
  readonly channel: {
    readonly mine: (span: string, kind: string) => string;
    readonly theirs: (name: string, span: string, kind: string) => string;
    readonly cancelled: string;
  };
  readonly days: (count: string) => string;
  readonly parts: Readonly<Record<PartWord, string>>;
  readonly decisions: string;
}

const EN: ServerWords = {
  refused: {
    noRole: "Only whoever holds the messenger role, or an administrator, may do this.",
    noAddress:
      "This console has no public address (PUBLIC_URL), so Slack cannot reach it: the deployment sets one first.",
    notHttps: (url) =>
      `Slack reaches a console over https only, and this console's address is ${url}: the deployment serves it over https first.`,
    privateAddress: (url) =>
      `Slack cannot reach ${url}, an address on this machine or a private network: the console needs a public address first.`,
    noConfigToken:
      "No app configuration token is set: an administrator pastes it, and its refresh token, on the console's settings page for this plugin first.",
    configTokenGone:
      "The app configuration token has expired and could not be renewed: an administrator pastes a new one, and its refresh token, on the console's settings page.",
    notMade: "There is no Slack app yet: run connect first.",
    notConnected: "Slack is not connected: install the app in the workspace first.",
    callerNotMatched:
      "Your console account is not matched to a Slack account, so there is nobody to send it to: name a channel instead.",
    sealFailed: (what) =>
      `Slack's answer did not give the console ${what} to keep, so nothing was saved; try again.`,
    slackSaid: (error) => `Slack refused: ${error}.`,
    slackWait: (seconds) => `Slack asked to wait ${seconds} seconds; try again then.`,
    unknownChannel: (channel) => `Slack knows no channel ${channel} that the app can see.`,
    privateNotMember: (channel) =>
      `#${channel} is private and the app is not in it: invite the app to the channel in Slack first.`,
    unknownRoute: "There is no such route.",
    unknownPerson: "There is nobody with that login in the console.",
    oauthStale:
      "The installation was not started here, or took more than fifteen minutes: start it again from the Connection page.",
    oauthRefused: (error) => `Slack did not install the app: ${error}.`,
  },
  said: {
    appMade: (url) =>
      `The Slack app is made. Someone who may install apps in the workspace opens this address to install it: ${url}`,
    appUpdated: (url) =>
      `The Slack app is up to date. To install it in the workspace, open this address: ${url}`,
    appInstalledUpdated: "The Slack app is up to date and installed.",
    disconnected:
      "The app is uninstalled from the workspace and deleted. connect makes a new one, in this workspace or another.",
    disconnectedAppLeft:
      "The app is no longer used, but the configuration token could not delete it in Slack: delete it at api.slack.com/apps. connect makes a new one.",
    testSent: (where) => `A test message went to ${where}.`,
    matched: (matched, unmatched) =>
      `Matched ${matched} people to Slack accounts by email; ${unmatched} have none.`,
    matchedOne: (name) => `${name} is matched to a Slack account.`,
    notMatchedOne: (name) => `${name} has no Slack account with their email.`,
    routeSaved: (id, channel) => `Route ${id} sends it to #${channel}.`,
    routeRemoved: (id) => `Route ${id} is removed.`,
  },
  app: {
    name: "Console",
    botName: "console",
    description: "What the console's plugins have for you, and the answers you give them here.",
    // Never "leave": Slack's own `/leave` leaves the channel, and the `/` menu lists the two together.
    shortcutName: "Time off",
    shortcutDescription: "Request or cancel time off, with your balance and upcoming days.",
    test: "The console's messenger is connected. What the console's plugins have for people comes here.",
  },
  form: {
    title: "Time off",
    submit: "Request",
    close: "Close",
    kind: "Kind",
    from: "First day",
    to: "Last day",
    toHint: "Leave it empty for a single day.",
    partHalf: "Half day",
    partQuarter: "Half or quarter day",
    partHint: "Half days and quarter days are offered on a single day.",
    reason: "Reason",
    reasonRequired: "This kind of leave asks for a reason.",
    left: (list) => `Left: ${list}`,
    toBeforeFrom: "The last day comes before the first.",
    failed: "The request did not go through. Try again, or request it on the console.",
    noKinds: "There is no kind of leave you may request.",
    notLinkedTitle: "Not linked",
    notLinked:
      "Your Slack account is not linked to the console. Accounts are matched by email: ask whoever keeps the messenger to check yours.",
    notEnrolledTitle: "Not enrolled",
    notEnrolled: "You are not enrolled for leave, so you cannot request it. Ask HR to enroll you.",
    unavailableTitle: "Not available",
    unavailable: "Leave cannot be requested from Slack now. Request it on the console.",
  },
  cancel: {
    upcoming: "Your upcoming time off",
    button: "Cancel",
    states: {
      requested: "Waiting",
      returned: "Sent back",
      approved: "Approved",
      cancelling: "Cancellation waiting",
    },
    more: (count, link) =>
      link === null ? `${count} more, on the console.` : `${count} more · ${link}`,
    seeAll: "See all on the console",
    title: "Cancel time off",
    submit: "Cancel it",
    back: "Back",
    now: "It is cancelled at once.",
    decision: (names) => `It is cancelled once ${names} approves.`,
    decisionNobody: "It is cancelled once a decision approves it.",
    cannot: "This leave cannot be cancelled now.",
    gone: "This leave is not there any more.",
    done: "Cancelled.",
    asked: (names) => `The cancellation waits for ${names} to decide.`,
    askedNobody: "The cancellation waits for a decision.",
    failed: "It was not cancelled. Try again, or cancel it on the console.",
  },
  press: {
    notYours: (link) =>
      `This decision is not yours to answer from Slack. Open it among your decisions on the console: ${link}`,
    answered: "This decision is already answered.",
    failed: "Your answer did not go through. Try again, or answer it on the console.",
  },
  thread: {
    title: "Leave request",
    requestedBy: (name) => `${name} requests leave`,
    recordedBy: (name) => `Recorded by ${name}`,
    late: "Requested after the notice this kind asks",
    reason: "Reason",
    ask: (who) => `${who}, please approve or reject.`,
    askCancel: (who) => `${who}, the cancellation of this leave waits for you.`,
    askNobody: "This waits for a decision on the console.",
    notInSlack: (names) => `Also asked, not in Slack: ${names}`,
    onConsole: (link) => `To send it back with a note, answer it on the console: ${link}`,
    about: (name, span) => `About ${name}'s leave, ${span}`,
    approve: "Approve",
    reject: "Reject",
    closedApproved: (name) => `Approved by ${name}`,
    closedRejected: (name) => `Rejected by ${name}`,
    closedReturned: (name) => `Sent back by ${name}`,
    closedAnswered: "Answered",
    closedCancelled: "Cancelled",
    approved: "Approved.",
    rejected: (name) => `Rejected by ${name}.`,
    returned: (name) => `Sent back by ${name}.`,
    cancelling: "The cancellation of this leave waits for a decision.",
    cancelled: "This leave is cancelled.",
    kept: "The cancellation was rejected; the leave stands.",
    note: "Note",
    someone: "someone",
  },
  channel: {
    mine: (span, kind) => `On leave ${span} (${kind})`,
    theirs: (name, span, kind) => `${name} is on leave ${span} (${kind})`,
    cancelled: "cancelled",
  },
  days: (count) => (count === "1" ? "1 day" : `${count} days`),
  parts: {
    none: "Whole day",
    am: "Morning half",
    pm: "Afternoon half",
    q1: "Early-morning quarter",
    q2: "Late-morning quarter",
    q3: "Early-afternoon quarter",
    q4: "Late-afternoon quarter",
  },
  decisions: "Decisions",
};

const KO: ServerWords = {
  refused: {
    noRole: "메신저 담당이나 관리자만 할 수 있습니다.",
    noAddress:
      "이 콘솔에는 공개 주소(PUBLIC_URL)가 없어 Slack이 닿을 수 없습니다. 배포에서 먼저 주소를 정해야 합니다.",
    notHttps: (url) =>
      `Slack은 https로만 콘솔에 닿는데, 이 콘솔의 주소는 ${url}입니다. 배포에서 먼저 https로 서비스해야 합니다.`,
    privateAddress: (url) =>
      `${url}은 이 컴퓨터나 사설망의 주소라 Slack이 닿을 수 없습니다. 콘솔에 먼저 공개 주소가 있어야 합니다.`,
    noConfigToken:
      "앱 설정 토큰이 없습니다. 관리자가 콘솔의 이 플러그인 설정 페이지에 토큰과 갱신 토큰을 먼저 붙여 넣어야 합니다.",
    configTokenGone:
      "앱 설정 토큰이 만료되었고 갱신하지 못했습니다. 관리자가 콘솔 설정 페이지에 새 토큰과 갱신 토큰을 붙여 넣어야 합니다.",
    notMade: "아직 Slack 앱이 없습니다. connect를 먼저 실행하세요.",
    notConnected: "Slack이 연결되지 않았습니다. 먼저 워크스페이스에 앱을 설치하세요.",
    callerNotMatched:
      "콘솔 계정이 Slack 계정과 연결되지 않아 보낼 사람이 없습니다. 채널을 지정하세요.",
    sealFailed: (what) =>
      `Slack의 응답에서 콘솔이 보관할 ${what}을(를) 받지 못해 아무것도 저장하지 않았습니다. 다시 시도하세요.`,
    slackSaid: (error) => `Slack이 거절했습니다: ${error}.`,
    slackWait: (seconds) => `Slack이 ${seconds}초 기다려 달라고 했습니다. 그 뒤에 다시 시도하세요.`,
    unknownChannel: (channel) => `앱이 볼 수 있는 채널 중에 ${channel}이(가) 없습니다.`,
    privateNotMember: (channel) =>
      `#${channel}은(는) 비공개 채널이고 앱이 들어가 있지 않습니다. Slack에서 먼저 앱을 채널에 초대하세요.`,
    unknownRoute: "그런 경로가 없습니다.",
    unknownPerson: "콘솔에 그 로그인을 쓰는 사람이 없습니다.",
    oauthStale:
      "설치가 여기서 시작되지 않았거나 15분을 넘겼습니다. 연결 페이지에서 다시 시작하세요.",
    oauthRefused: (error) => `Slack이 앱을 설치하지 않았습니다: ${error}.`,
  },
  said: {
    appMade: (url) =>
      `Slack 앱을 만들었습니다. 워크스페이스에 앱을 설치할 수 있는 사람이 이 주소를 열어 설치하세요: ${url}`,
    appUpdated: (url) =>
      `Slack 앱이 최신입니다. 워크스페이스에 설치하려면 이 주소를 여세요: ${url}`,
    appInstalledUpdated: "Slack 앱이 최신이고 설치되어 있습니다.",
    disconnected:
      "워크스페이스에서 앱을 제거하고 지웠습니다. connect로 새 앱을 만들 수 있고, 다른 워크스페이스에도 연결할 수 있습니다.",
    disconnectedAppLeft:
      "이제 이 앱을 쓰지 않지만, 설정 토큰으로 Slack에서 지우지는 못했습니다. api.slack.com/apps에서 지우세요. connect로 새 앱을 만들 수 있습니다.",
    testSent: (where) => `${where}에 시험 메시지를 보냈습니다.`,
    matched: (matched, unmatched) =>
      `이메일로 ${matched}명을 Slack 계정과 연결했습니다. ${unmatched}명은 계정이 없습니다.`,
    matchedOne: (name) => `${name} 님을 Slack 계정과 연결했습니다.`,
    notMatchedOne: (name) => `${name} 님의 이메일로 된 Slack 계정이 없습니다.`,
    routeSaved: (id, channel) => `경로 ${id}: #${channel}(으)로 보냅니다.`,
    routeRemoved: (id) => `경로 ${id}를 지웠습니다.`,
  },
  app: {
    name: "콘솔",
    botName: "console",
    description: "콘솔의 플러그인이 전하는 것, 그리고 여기서 하는 답.",
    shortcutName: "휴가",
    shortcutDescription: "휴가를 신청하거나 취소합니다. 남은 휴가와 예정된 휴가도 봅니다.",
    test: "콘솔의 메신저가 연결되었습니다. 콘솔 플러그인이 사람들에게 전할 것이 여기로 옵니다.",
  },
  form: {
    title: "휴가",
    submit: "신청",
    close: "닫기",
    kind: "종류",
    from: "시작일",
    to: "종료일",
    toHint: "하루면 비워 두세요.",
    partHalf: "반차",
    partQuarter: "반차·반반차",
    partHint: "반차와 반반차는 하루를 신청할 때만 고를 수 있습니다.",
    reason: "사유",
    reasonRequired: "이 휴가는 사유가 필요합니다.",
    left: (list) => `남은 휴가: ${list}`,
    toBeforeFrom: "종료일이 시작일보다 앞입니다.",
    failed: "신청하지 못했습니다. 다시 시도하거나 콘솔에서 신청하세요.",
    noKinds: "신청할 수 있는 휴가 종류가 없습니다.",
    notLinkedTitle: "연결되지 않음",
    notLinked:
      "Slack 계정이 콘솔과 연결되어 있지 않습니다. 계정은 이메일로 연결되니 메신저 담당에게 확인을 부탁하세요.",
    notEnrolledTitle: "휴가 대상 아님",
    notEnrolled:
      "휴가 대상으로 등록되어 있지 않아 신청할 수 없습니다. 인사 담당에게 등록을 요청하세요.",
    unavailableTitle: "사용할 수 없음",
    unavailable: "지금은 Slack에서 휴가를 신청할 수 없습니다. 콘솔에서 신청하세요.",
  },
  cancel: {
    upcoming: "예정된 내 휴가",
    button: "취소",
    states: {
      requested: "결재 대기",
      returned: "보완 요청됨",
      approved: "승인됨",
      cancelling: "취소 결재 중",
    },
    more: (count, link) =>
      link === null ? `외 ${count}건은 콘솔에서 볼 수 있습니다.` : `외 ${count}건 · ${link}`,
    seeAll: "콘솔에서 모두 보기",
    title: "휴가 취소",
    submit: "취소하기",
    back: "돌아가기",
    now: "누르면 바로 취소됩니다.",
    decision: (names) => `누르면 ${names} 님의 결재를 거쳐 취소됩니다.`,
    decisionNobody: "누르면 결재를 거쳐 취소됩니다.",
    cannot: "이 휴가는 지금 취소할 수 없습니다.",
    gone: "이 휴가를 찾을 수 없습니다.",
    done: "취소했습니다.",
    asked: (names) => `취소 결재를 올렸습니다. ${names} 님이 결재합니다.`,
    askedNobody: "취소 결재를 올렸습니다.",
    failed: "취소하지 못했습니다. 다시 시도하거나 콘솔에서 취소하세요.",
  },
  press: {
    notYours: (link) =>
      `이 결정은 Slack에서 답할 수 없습니다. 콘솔의 내 결정에서 확인하세요: ${link}`,
    answered: "이미 답한 결정입니다.",
    failed: "답이 전달되지 않았습니다. 다시 시도하거나 콘솔에서 답하세요.",
  },
  thread: {
    title: "휴가 신청",
    requestedBy: (name) => `${name} 님의 휴가 신청`,
    recordedBy: (name) => `${name} 님이 대신 등록`,
    late: "신청 기한이 지난 신청",
    reason: "사유",
    ask: (who) => `${who} 님, 승인하거나 반려해 주세요.`,
    askCancel: (who) => `${who} 님, 이 휴가의 취소를 결재해 주세요.`,
    askNobody: "콘솔에서 결정을 기다립니다.",
    notInSlack: (names) => `Slack에 없는 결재자: ${names}`,
    onConsole: (link) => `보완 요청은 콘솔에서 답하세요: ${link}`,
    about: (name, span) => `${name} 님의 휴가, ${span}`,
    approve: "승인",
    reject: "반려",
    closedApproved: (name) => `${name} 님이 승인`,
    closedRejected: (name) => `${name} 님이 반려`,
    closedReturned: (name) => `${name} 님이 보완 요청`,
    closedAnswered: "답변됨",
    closedCancelled: "취소됨",
    approved: "승인되었습니다.",
    rejected: (name) => `${name} 님이 반려했습니다.`,
    returned: (name) => `${name} 님이 보완을 요청했습니다.`,
    cancelling: "이 휴가의 취소가 결재를 기다립니다.",
    cancelled: "이 휴가는 취소되었습니다.",
    kept: "취소가 반려되어 휴가가 유지됩니다.",
    note: "메모",
    someone: "누군가",
  },
  channel: {
    mine: (span, kind) => `휴가: ${span} (${kind})`,
    theirs: (name, span, kind) => `${name} 님 휴가: ${span} (${kind})`,
    cancelled: "취소됨",
  },
  days: (count) => `${count}일`,
  parts: {
    none: "종일",
    am: "오전 반차",
    pm: "오후 반차",
    q1: "오전 전반 반반차",
    q2: "오전 후반 반반차",
    q3: "오후 전반 반반차",
    q4: "오후 후반 반반차",
  },
  decisions: "결정",
};

const PACKS: Readonly<Record<Language, ServerWords>> = { en: EN, ko: KO };

/** The words of a language the plugin speaks, English for any other. */
export function serverWords(language: string | null | undefined): ServerWords {
  const primary = (language ?? "").toLowerCase().split("-")[0] ?? "";
  return primary === "ko" ? PACKS.ko : PACKS.en;
}
