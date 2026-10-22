import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit } from "undici";

/**
 * Fetching user-supplied links safely ("SSRF" protection). The hostname check in fetch-jd.ts catches obvious cases,
 * but a public domain can resolve to a private address, or change what it resolves to between a check and the
 * request (DNS rebinding). So the address is checked at the moment of connecting, for every connection and redirect.
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
}

/** True for loopback, private, link-local, multicast, reserved and similar addresses that must never be fetched. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind !== 6) return true; // not an IP at all: refuse rather than guess
  // IPv4 embedded in IPv6 (mapped ::ffff:a.b.c.d, NAT64 64:ff9b::a.b.c.d) is judged by its IPv4 part.
  const embedded = ip.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) return isPrivateV4(embedded[1]);
  if (ip === "::" || ip === "::1") return true;
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    ip.startsWith("2001:db8:") || // documentation
    ip.startsWith("::ffff:") // other mapped forms
  );
}

type Resolver = (hostname: string, cb: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
const systemResolver: Resolver = (hostname, cb) => dnsLookup(hostname, { all: true }, cb);

export class BlockedAddressError extends Error {
  code = "EBLOCKED";
}

/** A lookup function for undici's connector that refuses hostnames resolving to any private address. */
export function makeSafeLookup(resolve: Resolver = systemResolver) {
  return (
    hostname: string,
    options: { all?: boolean },
    cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    resolve(hostname, (err, addresses) => {
      if (err) return cb(err, "");
      if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
        return cb(new BlockedAddressError(`Refusing to connect to a private address for ${hostname}`), "");
      }
      if (options?.all) cb(null, addresses);
      else cb(null, addresses[0].address, addresses[0].family);
    });
  };
}

const agent = new Agent({ connect: { lookup: makeSafeLookup() as never }, connectTimeout: 5_000 });

/** fetch() that can only reach public internet addresses. */
export function safeFetch(url: string | URL, init: RequestInit = {}) {
  return undiciFetch(url, { ...init, dispatcher: agent });
}
