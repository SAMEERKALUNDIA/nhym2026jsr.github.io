import { Meta } from '@/components/Meta'
import { Brand } from '@/components/Brand'
import { DeveloperCredit } from '@/components/DeveloperCredit'
import { Button } from '@/components/ui/button'

export default function Privacy() {
  return (
    <div className="min-h-dvh bg-background">
      <Meta title="Privacy Policy | National Ho Youth Meet 2026" description="Privacy notice for personal data processed by the NHYM 2026 Local Organizing Committee." />
      <header className="border-b px-gutter py-6">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4">
          <Brand />
          <Button asChild variant="outline"><a href="/">Home</a></Button>
        </div>
      </header>
      <main className="mx-auto max-w-content px-gutter py-section">
        <article className="max-w-3xl space-y-4">
          <p className="text-sm text-muted-foreground">Last updated: 27 October 2026</p>
          <h1 className="text-3xl font-bold">Privacy Policy / गोपनीयता नीति</h1>
          <p>This notice explains how the NHYM 2026 Local Organizing Committee (LOC) collects and uses personal data for the National Ho Youth Meet 2026 in Jamshedpur.</p>
          <h2 className="pt-4 text-xl font-semibold">1. Information we collect</h2>
          <p>Depending on the form or service you use, we may collect participant name, date of birth, age, gender, postal address, district/city, state, PIN code, participation interests, cultural and sports participation choices, travel and accommodation needs, contact email, registration details, payment mode and payment/transaction reference. Public feedback may include the name, district/city, category and message you submit. The homepage visitor counter uses a random browser cookie identifier to count returning browsers; the Worker stores a SHA-256 hash of that identifier rather than the cookie value itself. The cookie is marked Secure, HttpOnly and SameSite=Lax, and is configured to expire after one year.</p>
          <h2 className="pt-4 text-xl font-semibold">2. Why we use it</h2>
          <p>We use this information to receive and manage registrations, check eligibility, plan the event and accommodation, verify payments, communicate registration status, maintain necessary event and financial records, respond to queries, prevent misuse and administer feedback that you choose to publish.</p>
          <h2 className="pt-4 text-xl font-semibold">3. Public feedback</h2>
          <p>Feedback is intended for public display. If you submit feedback, the name, district/city (if provided), category and message may be visible to website visitors. Do not include phone numbers, email addresses, financial details or other information you do not want published. The LOC may remove feedback that violates the site's rules. You may request removal by emailing the contact below and identifying the feedback.</p>
          <h2 className="pt-4 text-xl font-semibold">4. Sharing and service providers</h2>
          <p>Access is limited to authorised LOC members who need the information for event administration. Data may be processed by hosting, database, file-storage and email-delivery service providers supporting the website. We do not state that every provider or system is operated by the LOC itself. We do not sell personal data.</p>
          <h2 className="pt-4 text-xl font-semibold">5. Retention</h2>
          <p>The LOC's current policy is to retain registration and event records until 31 December 2030, subject to review. Data may be deleted earlier when it is no longer needed, and records may be retained longer where required by applicable law, accounting requirements, dispute resolution or a legal claim. Public feedback may be removed earlier on a valid request or under site moderation rules. The LOC should review and document retention exceptions before deletion.</p>
          <h2 className="pt-4 text-xl font-semibold">6. Your requests and complaints</h2>
          <p>You may contact the LOC to request access to, correction of, or deletion of personal data, or to withdraw consent where processing is based on consent. Some records may need to be retained for legal or accounting reasons. We may need enough information to verify your request before acting on it.</p>
          <p>Privacy and grievance contact: <a className="underline underline-offset-4" href="mailto:nhym2026jsr@gmail.com">nhym2026jsr@gmail.com</a>. Please use the subject “Privacy Request” and avoid sending sensitive documents unless the LOC asks for them through an appropriate channel.</p>
          <h2 className="pt-4 text-xl font-semibold">7. Security and incidents</h2>
          <p>The LOC uses access controls and technical measures intended to protect personal data. No internet service can guarantee absolute security. If a personal-data incident occurs, the LOC will assess it and take steps required by applicable law.</p>
          <h2 className="pt-4 text-xl font-semibold">8. Adults only</h2>
          <p>Online registration is intended only for people aged 18 or older. The form asks for date of birth to check this requirement. If you believe a person under 18 has submitted personal data, contact the LOC so the matter can be reviewed.</p>
          <h2 className="pt-4 text-xl font-semibold">9. Changes to this policy</h2>
          <p>This policy may be updated to reflect changes to the event, website or applicable law. The latest update date appears at the top of this page.</p>
          <p className="pt-4 text-sm text-muted-foreground">This policy is intended as a practical privacy notice and does not replace review by a qualified legal professional.</p>
        </article>
      </main>
      <DeveloperCredit />
    </div>
  )
}
