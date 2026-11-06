// The words the page and the widget show people, in the languages the repository speaks
// (docs/guide/conventions.md, "Languages"): English first, Korean beside it, and a language added
// later is one more pack in the map. The console sends the frame the person's language; it draws
// the tabs and the widget's name from the manifest in that language, and the words inside the
// frame are the plugin's own.

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

/** The packs by language tag; English is what any other language falls back to. */
const PACKS: Readonly<Record<string, Words>> = { en: ENGLISH, ko: KOREAN };

/** The words for a language tag: the tag's pack (`ko`), else its primary subtag's (`ko` for `ko-KR`), else English. */
export function wordsFor(language: string): Words {
  return PACKS[language] ?? PACKS[language.split("-")[0] ?? language] ?? ENGLISH;
}
