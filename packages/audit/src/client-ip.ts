import { isIP } from "node:net";

/** IPv4 keeps /24, IPv6 keeps /48. Q-IAM-B: truncated unless compliance says otherwise. */
const IPV4_KEEP_OCTETS = 3;
const IPV6_KEEP_GROUPS = 3;

function expandIpv6(ip: string): string[] | undefined {
  const [head = "", tail, ...rest] = ip.split("::");
  if (rest.length > 0) return undefined;
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  if (tail === undefined) return headGroups.length === 8 ? headGroups : undefined;
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 1) return undefined;
  return [...headGroups, ...Array<string>(missing).fill("0"), ...tailGroups];
}

/**
 * Reduces a client IP to a network prefix before it reaches any audit store
 * (`203.0.113.0/24`, `2001:db8:1::/48`). A keyed hash would add nothing: a hash
 * of a /24 is trivially reversible. Returns undefined for anything that is not
 * an IP address; the input is never echoed.
 */
export function truncateClientIp(ip: string): string | undefined {
  const zone = ip.indexOf("%");
  const bare = zone === -1 ? ip : ip.slice(0, zone);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare)?.[1];
  const candidate = mapped ?? bare;
  const version = isIP(candidate);
  if (version === 4) {
    return `${candidate.split(".").slice(0, IPV4_KEEP_OCTETS).join(".")}.0/24`;
  }
  if (version === 6) {
    const groups = expandIpv6(candidate);
    if (!groups) return undefined;
    const kept = groups.slice(0, IPV6_KEEP_GROUPS).map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
    return `${kept.join(":")}::/48`;
  }
  return undefined;
}
