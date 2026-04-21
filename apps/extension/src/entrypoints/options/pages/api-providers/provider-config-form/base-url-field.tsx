import type { APIProviderConfig } from "@/types/config/provider"

import { i18n } from "#imports"
import { useStore } from "@tanstack/react-form"
import { isNonCustomLLMProvider } from "@/types/config/provider"
import { ConnectionTestButton } from "./components/connection-button"
import { withForm } from "./form"

export const BaseURLField = withForm({
  ...{ defaultValues: {} as APIProviderConfig },
  render: function Render({ form }) {
    const providerConfig = useStore(form.store, state => state.values)
    const providerType = providerConfig.provider

    if (providerType === "deepl") {
      return null
    }

    if (providerType === "libre-translate") {
      return (
        <form.AppField name="endpoint">
          {field => (
            <field.InputFieldAutoSave
              formForSubmit={form}
              label={i18n.t("options.apiProviders.form.fields.endpoint")}
              placeholder="https://libretranslate.com/translate"
            />
          )}
        </form.AppField>
      )
    }

    const isOptionalBaseURL = isNonCustomLLMProvider(providerType)
    const labelText = `${i18n.t("options.apiProviders.form.fields.baseURL")}${isOptionalBaseURL
      ? ` (${i18n.t("options.apiProviders.form.fields.optional")})`
      : ""}`

    return (
      <form.AppField name="baseURL">
        {field => (
          <field.InputFieldAutoSave
            formForSubmit={form}
            label={labelText}
            labelExtra={providerType === "ollama" && (
              <ConnectionTestButton
                providerConfig={providerConfig}
              />
            )}
          />
        )}
      </form.AppField>
    )
  },
})
