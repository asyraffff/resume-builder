import { describe, expect, it } from "vitest";
import { BlockedAddressError, isPrivateAddress, makeSafeLookup } from "@/lib/safe-fetch";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "64:ff9b::192.168.0.1", "2001:db8::1", "[::1]", "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "13.107.42.14", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("connection-time lookup", () => {
  const fake = (addresses: string[]) =>
    makeSafeLookup((_host, cb) => cb(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))));

  it("passes public addresses through, in both callback styles", () => {
    const lookup = fake(["93.184.215.14"]);
    lookup("example.com", {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe("93.184.215.14");
      expect(family).toBe(4);
    });
    lookup("example.com", { all: true }, (err, addresses) => {
      expect(err).toBeNull();
      expect(addresses).toEqual([{ address: "93.184.215.14", family: 4 }]);
    });
  });

  it("refuses a public-looking domain that resolves to a private address", () => {
    fake(["127.0.0.1"])("evil.example", {}, (err) => expect(err).toBeInstanceOf(BlockedAddressError));
  });

  it("refuses if any of several addresses is private (rebinding protection)", () => {
    fake(["93.184.215.14", "10.0.0.5"])("mixed.example", { all: true }, (err) => expect(err).toBeInstanceOf(BlockedAddressError));
  });

  it("passes DNS errors through", () => {
    const failing = makeSafeLookup((_h, cb) => cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []));
    failing("nope.invalid", {}, (err) => expect(err?.message).toBe("ENOTFOUND"));
  });
});
