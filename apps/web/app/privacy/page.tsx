import { PolicyPage, PolicySection } from "../components"

export const metadata = {
  title: "Privacy Policy | GetU Translate",
  description: "Privacy policy for GetU Translate.",
}

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      description="This policy explains what information GetU Translate collects, how we use it, and the choices available to users."
    >
      <PolicySection title="1. Information we collect">
        <p>Depending on how you use GetU Translate, we may collect:</p>
        <ul>
          <li>Account information such as email address and login details.</li>
          <li>Subscription and billing status received from Paddle.</li>
          <li>Product settings, language preferences, and configuration choices.</li>
          <li>Technical data such as browser type, extension version, diagnostics, and error logs.</li>
          <li>Content you choose to translate when a feature requires processing by an AI or translation provider.</li>
        </ul>
      </PolicySection>

      <PolicySection title="2. How we use information">
        <p>We use information to provide and improve GetU Translate, including to:</p>
        <ul>
          <li>Operate translation, subtitle, article reading, and text-to-speech features.</li>
          <li>Manage accounts, subscriptions, support, and security.</li>
          <li>Debug product issues and protect against abuse.</li>
          <li>Comply with legal, tax, and payment obligations.</li>
        </ul>
      </PolicySection>

      <PolicySection title="3. AI and translation providers">
        <p>
          GetU Translate may send text you choose to translate to supported AI or translation providers. If you configure your own provider account or API key, that provider's terms and privacy practices may also apply.
        </p>
      </PolicySection>

      <PolicySection title="4. Payments">
        <p>
          Payments are handled by Paddle. Paddle may process personal and payment information to complete purchases, manage subscriptions, prevent fraud, calculate taxes, and issue invoices. We receive limited billing information such as subscription status and transaction identifiers.
        </p>
      </PolicySection>

      <PolicySection title="5. Sharing">
        <p>
          We do not sell personal information. We may share information with service providers that help us operate the product, comply with law, process payments, provide support, or protect the security of GetU Translate.
        </p>
      </PolicySection>

      <PolicySection title="6. Retention">
        <p>
          We keep information for as long as needed to provide the product, maintain business records, resolve disputes, comply with legal obligations, and enforce our agreements. We remove or anonymize data when it is no longer needed.
        </p>
      </PolicySection>

      <PolicySection title="7. Your choices">
        <p>
          You may request access, correction, deletion, or export of your personal information by contacting us. You can also adjust extension settings and cancel paid subscriptions through the subscription management flow.
        </p>
      </PolicySection>

      <PolicySection title="8. Security">
        <p>
          We use reasonable technical and organizational safeguards to protect information. No online service can guarantee absolute security.
        </p>
      </PolicySection>

      <PolicySection title="9. Contact">
        <p>
          Privacy questions can be sent to <a href="mailto:support@getutranslate.com">support@getutranslate.com</a>.
        </p>
      </PolicySection>
    </PolicyPage>
  )
}
