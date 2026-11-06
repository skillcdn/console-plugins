// The words the page and the widget show people, in the languages the console speaks
// (docs/guide/conventions.md, "Two languages"): English first, Korean beside it, chosen by the
// language the console sends the frame. The console draws the tabs and the widget's name from the
// manifest in the person's language; the words inside the frame are the plugin's own.

export interface Words {
  readonly title: string;
  readonly whoToGreet: string;
  readonly greet: string;
  readonly nobodyYet: string;
  readonly refused: string;
  /** Before the login of whoever greeted: "by alice". */
  readonly by: string;
}

const ENGLISH: Words = {
  title: "Greetings",
  whoToGreet: "Who to greet",
  greet: "Greet",
  nobodyYet: "Nobody has been greeted yet.",
  refused: "The greeting was refused.",
  by: "by",
};

const KOREAN: Words = {
  title: "인사",
  whoToGreet: "누구에게 인사할까요",
  greet: "인사하기",
  nobodyYet: "아직 아무에게도 인사하지 않았습니다.",
  refused: "인사가 거절되었습니다.",
  by: "보낸 사람:",
};

/** The words for a language tag (`ko`, `ko-KR`, `en`); English for any other. */
export function wordsFor(language: string): Words {
  return language === "ko" || language.startsWith("ko-") ? KOREAN : ENGLISH;
}
