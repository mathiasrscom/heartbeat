import { describe, expect, it } from "vitest"
import { extractIntercomCx } from "./intercom-cx"

describe("extractIntercomCx", () => {
  it("prefers conversation_rating when present", () => {
    const result = extractIntercomCx({
      conversation_rating: {
        rating: 4,
        remark: "Great support",
      },
      custom_attributes: {
        "CX Score rating": "2",
      },
    })

    expect(result.score).toBe(8)
    expect(result.comment).toBe("Great support")
    expect(result.source).toBe("conversation_rating")
  })

  it("falls back to custom attribute CX score", () => {
    const result = extractIntercomCx({
      custom_attributes: {
        "CX Score rating": "5",
        "CX Score explanation": "Resolved quickly",
      },
    })

    expect(result.score).toBe(10)
    expect(result.comment).toBe("Resolved quickly")
    expect(result.source).toBe("custom_attribute")
  })

  it("supports ai_agent rating fallback", () => {
    const result = extractIntercomCx({
      ai_agent: {
        rating: 3,
        rating_remark: "Neutral",
      },
    })

    expect(result.score).toBe(6)
    expect(result.comment).toBe("Neutral")
    expect(result.source).toBe("ai_agent")
  })
})
