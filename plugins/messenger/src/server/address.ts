// Whether Slack can reach the console at the address the deployment gives it: Slack calls an app
// over https alone, at a public address, so a console served over http, on this machine or on a
// private network has its connection refused before anything is made in Slack, with the reason.
import type { AddressState } from "../shared/contracts.js";

function privateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function privateIpv6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    bare === "::1" ||
    bare === "::" ||
    bare.startsWith("fc") ||
    bare.startsWith("fd") ||
    bare.startsWith("fe8") ||
    bare.startsWith("fe9") ||
    bare.startsWith("fea") ||
    bare.startsWith("feb")
  );
}

function privateHost(host: string): boolean {
  const name = host.toLowerCase();
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name.endsWith(".internal") ||
    privateIpv4(name) ||
    (name.includes(":") && privateIpv6(name))
  );
}

/** How the console's address stands for Slack. */
export function addressState(url: string | null): AddressState {
  if (url === null || url.length === 0) {
    return "none";
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "none";
  }
  if (privateHost(parsed.hostname)) {
    return "private";
  }
  return parsed.protocol === "https:" ? "ok" : "not_https";
}
