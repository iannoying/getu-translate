import { PolicyPage, PolicySection } from "../components"

export const metadata = {
  title: "Terms of Service | GetU Translate",
  description: "Terms and conditions for using GetU Translate.",
}

export default function TermsAndConditionsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      description="These terms govern your access to and use of GetU Translate, including our browser extension, website, accounts, and paid subscription features."
    >
      <PolicySection title="1. Acceptance of these terms">
        <p>
          By installing, accessing, or using GetU Translate, you agree to these Terms of Service. If you do not agree, do not use the product.
        </p>
      </PolicySection>

      <PolicySection title="2. Product description">
        <p>
          GetU Translate is an AI-powered browser translation and language-learning tool. It supports web page translation, selected-text translation, video subtitle translation, article reading assistance, text-to-speech, and configurable AI provider settings.
        </p>
      </PolicySection>

      <PolicySection title="3. Accounts and subscriptions">
        <p>
          Some features may require an account or paid subscription. You are responsible for keeping your account information accurate and for protecting your login credentials.
        </p>
        <p>
          Paid plans renew automatically unless cancelled before the renewal date. You can manage cancellation and billing through the checkout or subscription management flow provided at purchase.
        </p>
      </PolicySection>

      <PolicySection title="4. Payments">
        <p>
          Payments are processed by Paddle, our merchant of record. Paddle may collect payment details, apply taxes, issue invoices, and handle payment-related compliance. GetU Translate does not store full credit card numbers.
        </p>
      </PolicySection>

      <PolicySection title="5. Acceptable use">
        <p>You agree not to misuse GetU Translate, including by:</p>
        <ul>
          <li>Violating applicable laws or third-party rights.</li>
          <li>Attempting to reverse engineer, disrupt, or overload the service.</li>
          <li>Using the product to process content you are not permitted to use.</li>
          <li>Bypassing usage limits, access controls, or security protections.</li>
        </ul>
      </PolicySection>

      <PolicySection title="6. AI translation output">
        <p>
          AI-generated translations may be inaccurate, incomplete, or unsuitable for professional, legal, medical, financial, or safety-critical use. You are responsible for reviewing outputs before relying on them.
        </p>
      </PolicySection>

      <PolicySection title="7. Intellectual property">
        <p>
          GetU Translate and its software, branding, website, and related materials are protected by intellectual property laws. You retain rights to your own content, subject to the permissions needed for the product to process and translate it.
        </p>
      </PolicySection>

      <PolicySection title="8. Availability and changes">
        <p>
          We may update, suspend, or discontinue features as the product evolves. We aim to keep the service reliable, but we do not guarantee uninterrupted or error-free operation.
        </p>
      </PolicySection>

      <PolicySection title="9. Termination">
        <p>
          We may suspend or terminate access if you violate these terms, create risk for the product or other users, or use the service unlawfully.
        </p>
      </PolicySection>

      <PolicySection title="10. Contact">
        <p>
          Questions about these terms can be sent to <a href="mailto:support@getutranslate.com">support@getutranslate.com</a>.
        </p>
      </PolicySection>
    </PolicyPage>
  )
}
