import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v073-to-v074"

describe("migrate v073 -> v074", () => {
  it("renames the GetU Pro GPT display label", () => {
    const result = migrate({
      providersConfig: [
        { id: "getu-pro-gpt-55", name: "Gpt-5.5", provider: "getu-pro" },
        { id: "getu-pro-default", name: "DeepSeek-V4-Pro", provider: "getu-pro" },
      ],
    })

    expect(result.providersConfig[0].name).toBe("GPT-5.5")
    expect(result.providersConfig[1].name).toBe("DeepSeek-V4-Pro")
  })

  it("leaves already-correct labels unchanged", () => {
    const config = {
      providersConfig: [
        { id: "getu-pro-gpt-55", name: "GPT-5.5", provider: "getu-pro" },
      ],
    }

    expect(migrate(config)).toEqual(config)
  })
})
