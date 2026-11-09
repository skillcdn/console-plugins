// The small pieces the rest stands on: what a person wrote made safe for Slack's markup, the
// address Slack must reach, the manifest and its digest, and the form read back.
import { describe, expect, it } from "vitest";
import { addressState } from "./address.js";
import { leaveInputOf } from "./integrations/hr/form.js";
import { spanOf } from "./integrations/hr/texts.js";
import { clean, paragraph, safe, strike } from "./slack/blocks.js";
import { appManifest, authorizeUrlOf, digestOf } from "./slack/manifest.js";
import { isResponseUrl } from "./slack/payloads.js";

describe("what a person wrote, in Slack", () => {
  it("rings nobody and links nowhere", () => {
    expect(safe("<!here> <@U123> <https://x.example|y> a&b")).toBe(
      "&lt;!here&gt; &lt;@U123&gt; &lt;https://x.example|y&gt; a&amp;b",
    );
  });

  it("drops control characters and holds a name to its bound", () => {
    const control = String.fromCodePoint(7);
    expect(clean(`Kim${control}\nMinsu`, 80)).toBe("Kim Minsu");
    expect([...clean("가".repeat(300), 80)]).toHaveLength(80);
    expect(paragraph(`line one\nline two${control}`, 100)).toBe("line one\nline two");
  });

  it("strikes each line through on its own", () => {
    expect(strike("one\n\ntwo")).toBe("~one~\n\n~two~");
  });
});

describe("the console's address", () => {
  it("is reachable over https at a public address alone", () => {
    expect(addressState("https://console.example.test")).toBe("ok");
    expect(addressState(null)).toBe("none");
    expect(addressState("not an address")).toBe("none");
    expect(addressState("http://console.example.test")).toBe("not_https");
    for (const url of [
      "http://127.0.0.1:11200",
      "https://localhost",
      "https://10.0.0.5",
      "https://192.168.1.10",
      "https://172.20.0.1",
      "https://[::1]",
      "https://console.local",
    ]) {
      expect(addressState(url), url).toBe("private");
    }
  });

  it("follows the address of a press only where it is Slack's", () => {
    expect(isResponseUrl("https://hooks.slack.com/actions/T1/2/3")).toBe(true);
    expect(isResponseUrl("http://hooks.slack.com/actions/T1/2/3")).toBe(false);
    expect(isResponseUrl("https://hooks.slack.com.evil.example/x")).toBe(false);
    expect(isResponseUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("the manifest", () => {
  const input = {
    language: "en" as const,
    requestUrl: "https://console.example.test/api/v1/plugins/messenger/x/slack",
    redirectUrl: "https://console.example.test/api/v1/plugins/messenger/x/slack-oauth",
  };

  it("holds the shortcut only where asked, and the same scopes either way", () => {
    const withShortcut = appManifest({ ...input, shortcut: true });
    const without = appManifest({ ...input, shortcut: false });
    expect(JSON.stringify(withShortcut)).toContain("leave-request");
    expect(JSON.stringify(without)).not.toContain("leave-request");
    expect(withShortcut.oauth_config).toEqual(without.oauth_config);
  });

  it("digests the same manifest the same, whatever the order of its keys", () => {
    expect(digestOf({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      digestOf({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
    expect(digestOf(appManifest({ ...input, shortcut: true }))).not.toBe(
      digestOf(appManifest({ ...input, shortcut: false })),
    );
  });

  it("builds Slack's installation address with the state", () => {
    const url = new URL(authorizeUrlOf("1.2", input.redirectUrl, "state-1"));
    expect(url.searchParams.get("redirect_uri")).toBe(input.redirectUrl);
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")).toContain("chat:write.customize");
  });
});

describe("the form, read back", () => {
  const value = (selected: Record<string, unknown>) => ({ value: { type: "x", ...selected } });

  it("reads one day with its part, the reason trimmed", () => {
    expect(
      leaveInputOf(
        {
          kind: value({ selected_option: { value: "annual" } }),
          from: value({ selected_date: "2026-11-20" }),
          to: value({ selected_date: "2026-11-20" }),
          "part-half": value({ selected_option: { value: "am" } }),
          reason: value({ value: "  dentist  " }),
        },
        "en",
      ),
    ).toEqual({
      ok: true,
      input: { type: "annual", from: "2026-11-20", part: "am", reason: "dentist" },
    });
  });

  it("refuses what is no kind, no day, or too long, each beside its field", () => {
    const read = leaveInputOf(
      {
        kind: value({ selected_option: { value: "../../etc" } }),
        from: value({ selected_date: "20 Nov" }),
        reason: value({ value: "x".repeat(2001) }),
      },
      "en",
    );
    expect(read.ok).toBe(false);
    expect(read.ok ? [] : Object.keys(read.errors).sort()).toEqual(["from", "kind", "reason"]);
  });
});

describe("a leave's days, in words", () => {
  it("says one day with its part, or first to last", () => {
    expect(spanOf("2026-11-20", "2026-11-20", "am", "en")).toBe("Fri, Nov 20, Morning half");
    expect(spanOf("2026-11-20", "2026-11-21", "none", "ko")).toContain("11월 20일");
  });

  it("names the quarters of a day as HR does", () => {
    expect(spanOf("2026-11-20", "2026-11-20", "q1", "ko")).toContain("오전 전반 반반차");
    expect(spanOf("2026-11-20", "2026-11-20", "q4", "en")).toBe(
      "Fri, Nov 20, Late-afternoon quarter",
    );
  });
});
