import { describe, expect, it } from "vitest"
import { buildIntercomCaseUrl, normalizeIntercomAppUrl } from "./intercom-links"

describe("intercom links", () => {
  it("normalizes a full conversation URL to the inbox base", () => {
    expect(
      normalizeIntercomAppUrl(
        "https://app.eu.intercom.com/a/inbox/zah460bv/inbox/conversation/215560824562362"
      )
    ).toBe("https://app.eu.intercom.com/a/inbox/zah460bv/inbox")
  })

  it("builds a conversation URL from the workspace base", () => {
    expect(
      buildIntercomCaseUrl("https://app.eu.intercom.com/a/inbox/zah460bv/inbox", {
        externalId: "215560824562362",
        subtype: "conversation",
      })
    ).toBe(
      "https://app.eu.intercom.com/a/inbox/zah460bv/inbox/conversation/215560824562362"
    )
  })

  it("builds a ticket URL from the workspace base", () => {
    expect(
      buildIntercomCaseUrl("https://app.eu.intercom.com/a/inbox/zah460bv/inbox", {
        externalId: "2138",
        subtype: "ticket",
      })
    ).toBe("https://app.eu.intercom.com/a/inbox/zah460bv/tickets/2138")
  })
})
