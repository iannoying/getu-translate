import { PolicyPage, PolicySection } from "../components"

export const metadata = {
  title: "Refund Policy | GetU Translate",
  description: "Refund policy for GetU Translate paid subscriptions.",
}

export default function RefundPage() {
  return (
    <PolicyPage
      title="Refund Policy"
      description="This policy describes how refunds work for GetU Translate paid subscriptions and purchases."
    >
      <PolicySection title="1. Refund window">
        <p>
          If you are not satisfied with a paid GetU Translate subscription, you may request a refund within 14 days of the initial purchase or renewal charge.
        </p>
      </PolicySection>

      <PolicySection title="2. How to request a refund">
        <p>
          Contact <a href="mailto:support@getutranslate.com">support@getutranslate.com</a> with the email address used for purchase, the Paddle order or transaction number if available, and a brief reason for the request.
        </p>
      </PolicySection>

      <PolicySection title="3. Processing">
        <p>
          Approved refunds are processed back to the original payment method through Paddle. The time it takes for funds to appear depends on the payment method and financial institution.
        </p>
      </PolicySection>

      <PolicySection title="4. Non-refundable cases">
        <p>Refunds may be declined when:</p>
        <ul>
          <li>The request is made more than 14 days after the relevant charge.</li>
          <li>The account shows abuse, fraud, or violation of our Terms of Service.</li>
          <li>The purchase was already refunded, charged back, or otherwise reversed.</li>
        </ul>
      </PolicySection>

      <PolicySection title="5. Cancellation">
        <p>
          Cancelling a subscription stops future renewals but does not automatically refund prior charges. After cancellation, paid features remain available until the end of the current billing period unless a refund is approved.
        </p>
      </PolicySection>

      <PolicySection title="6. Contact">
        <p>
          Billing and refund questions can be sent to <a href="mailto:support@getutranslate.com">support@getutranslate.com</a>.
        </p>
      </PolicySection>
    </PolicyPage>
  )
}
