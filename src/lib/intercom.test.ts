import { describe, expect, it } from "vitest"
import { resolveIntercomApiBaseUrl } from "./intercom"

describe("resolveIntercomApiBaseUrl", () => {
  it("uses regional EU API base for EU workspaces", () => {
    expect(
      resolveIntercomApiBaseUrl({
        appUrl: "https://app.eu.intercom.com/a/inbox/zah460bv/inbox",
      })
    ).toBe("https://api.eu.intercom.io")
  })

  it("uses regional AU API base for AU workspaces", () => {
    expect(
      resolveIntercomApiBaseUrl({
        appUrl: "https://app.au.intercom.com/a/inbox/zah460bv/inbox",
      })
    ).toBe("https://api.au.intercom.io")
  })

  it("falls back to global API base for non-regional app hosts", () => {
    expect(
      resolveIntercomApiBaseUrl({
        appUrl: "https://app.intercom.com/a/inbox/zah460bv/inbox",
      })
    ).toBe("https://api.intercom.io")
  })

  it("prefers explicit apiBaseUrl when provided", () => {
    expect(
      resolveIntercomApiBaseUrl({
        appUrl: "https://app.eu.intercom.com/a/inbox/zah460bv/inbox",
        apiBaseUrl: "https://api.intercom.io/",
      })
    ).toBe("https://api.intercom.io")
  })
})
