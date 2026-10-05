import type { Metadata } from 'next'

import { CookieSettingsButton } from '@/components/consent/consent-banner'
import { LegalDocument, P, Section, UL } from '@/components/legal/legal-document'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_ENTITY_DETAILS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How ShiftGrid collects and protects personal data when you book padel, tennis and football courts in Tunisia, and how to exercise your rights under Tunisian law.',
}

const TOC = [
  { id: 'controller', title: 'Who is responsible for your data' },
  { id: 'data', title: 'What we collect' },
  { id: 'purposes', title: 'Why we use it' },
  { id: 'sharing', title: 'Who receives it' },
  { id: 'transfers', title: 'Storage and transfers outside Tunisia' },
  { id: 'retention', title: 'How long we keep it' },
  { id: 'rights', title: 'Your rights' },
  { id: 'security', title: 'Security' },
  { id: 'cookies', title: 'Cookies, analytics and your choices' },
  { id: 'minors', title: 'Minors' },
  { id: 'changes', title: 'Changes to this policy' },
  { id: 'contact', title: 'Contact and complaints' },
]

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro="ShiftGrid lets players book padel, tennis and football courts at sports clubs in Tunisia. This policy explains what personal data we process to do that, why, who sees it, and how you can exercise your rights under Loi organique n° 2004-63 du 27 juillet 2004 portant sur la protection des données à caractère personnel (the Tunisian Data Protection Law)."
      toc={TOC}
    >
      <Section id="controller" title="1. Who is responsible for your data">
        <P>
          {LEGAL_ENTITY} operates ShiftGrid and is the data controller (« responsable du traitement ») for the data described
          below.{LEGAL_ENTITY_DETAILS ? ` ${LEGAL_ENTITY_DETAILS}.` : ''}
        </P>
        <P>
          When you book a court, the club you book at also receives and uses your booking details to run its venue (for example to
          know who is coming and to collect payment). Each club is responsible for its own use of that data.
        </P>
      </Section>

      <Section id="data" title="2. What we collect">
        <UL>
          <li>
            <strong>Players with an account:</strong> full name, email address, Tunisian mobile number, password (stored only as a
            salted hash by our authentication provider), the club your account is linked to, and the time you accepted our Terms
            and this policy.
          </li>
          <li>
            <strong>Guests (no account):</strong> full name, mobile number and, optionally, an email address. A secret link lets
            you view or cancel the booking; we store only a hash of it.
          </li>
          <li>
            <strong>Bookings:</strong> club, court, date and time, number of players, price in TND, status (awaiting payment,
            confirmed, cancelled, completed), payment method and payment status, cancellation reason and time, and booking history.
          </li>
          <li>
            <strong>Split payments:</strong> for each other player, the amount and whether it was paid; an email address only if
            the organiser types one in to send the payment link.
          </li>
          <li>
            <strong>Club owners and staff:</strong> owner name, email and phone; the club&apos;s name, commercial registry number,
            address, map coordinates and opening hours; the registration document you upload (kept in private storage and visible
            only to ShiftGrid administrators who verify clubs); staff invitation email addresses.
          </li>
          <li>
            <strong>Technical data:</strong> IP address and request details used to limit abuse and secure the service, and error
            reports. If a page crashes, a recording of that session may be sent to our error-monitoring provider with all text,
            form fields and images masked. We do not collect payment card numbers: where online payment is offered, it is handled by the payment
            provider.
          </li>
          <li>
            <strong>Notification records:</strong> which email was sent, when, and whether it was delivered (without the secret
            links it contained).
          </li>
        </UL>
      </Section>

      <Section id="purposes" title="3. Why we use it">
        <UL>
          <li>To create and manage your account and to let you book, pay for and cancel courts (performance of the booking).</li>
          <li>
            To send you service messages about a booking: confirmation, a reminder before it starts, payment links for friends, and
            cancellation or refund notices. We use email today; we may also contact you by phone or SMS about a booking if needed.
            We do not send marketing messages without separate consent.
          </li>
          <li>To let clubs run their venue and to let us verify that clubs are genuine.</li>
          <li>To prevent fraud, slot hogging and abuse, to keep the service secure and to diagnose errors.</li>
          <li>To meet legal, accounting and tax obligations, and to establish or defend legal claims.</li>
        </UL>
        <P>
          Where the law requires your consent, we rely on the consent you give when you tick the box on the registration or booking
          form. You may withdraw it at any time (see Your rights); this does not affect processing already carried out, and we may
          not be able to provide the booking without the data it needs.
        </P>
      </Section>

      <Section id="sharing" title="4. Who receives it">
        <P>We do not sell personal data. We share it only with:</P>
        <UL>
          <li>
            <strong>The club you book at</strong> (and its staff): your name, phone, email if given, booking and payment status.
          </li>
          <li>
            <strong>Service providers acting on our instructions (processors):</strong> database, authentication, file storage and
            realtime updates (Supabase); hosting (Vercel); transactional email (our SMTP email provider); rate limiting (Upstash); error monitoring
            (Sentry) and product analytics (PostHog), the last two only when enabled, with personal data filtered out of error
            reports.
          </li>
          <li>Competent authorities where the law requires it.</li>
        </UL>
      </Section>

      <Section id="transfers" title="5. Storage and transfers outside Tunisia">
        <P>
          Our providers may store or process data on servers outside Tunisia. Transfers are made only as permitted by Tunisian law,
          including any authorisation of the Instance Nationale de Protection des Données Personnelles (INPDP) that applies, and
          under contracts requiring the provider to protect the data and use it only on our instructions.
        </P>
      </Section>

      <Section id="retention" title="6. How long we keep it">
        <UL>
          <li>
            Account data: while your account is open. When you delete your account (&ldquo;Delete my account&rdquo; on the My reservations page, or on
            request) your name, phone number, email, login and password are erased and your profile becomes anonymous (&ldquo;Joueur Anonyme&rdquo;).
            What we keep, without any personal data: your past bookings (for the clubs&apos; accounting), the number of bookings, and your no-show
            count and trust score as anonymous statistics. Upcoming bookings are cancelled.
          </li>
          <li>
            Booking and payment records: as long as needed for accounting, tax and dispute purposes, for the periods Tunisian law
            requires; after that they are deleted or anonymised.
          </li>
          <li>Guest bookers: kept with the bookings they relate to, for the same periods; on request the name, phone number and email are erased and the booking stays anonymous.</li>
          <li>Clubs and courts that are closed are archived, not deleted: their booking history stays for the clubs&apos; accounting, but they are no longer listed or bookable.</li>
          <li>Club verification documents: while the club is active, then for the period needed to answer disputes or legal requests.</li>
          <li>Technical logs and rate-limit counters: short-lived (minutes to weeks).</li>
        </UL>
      </Section>

      <Section id="rights" title="7. Your rights">
        <P>Under the Tunisian Data Protection Law you have the right to:</P>
        <UL>
          <li>access the personal data we hold about you and obtain a copy;</li>
          <li>have inaccurate or incomplete data corrected, updated or completed;</li>
          <li>have your data deleted where we no longer need it or processing is unlawful;</li>
          <li>object, for legitimate reasons, to the processing of your data, and withdraw your consent;</li>
          <li>refuse the use of your data for direct marketing.</li>
        </UL>
        <P>
          To exercise a right, write to{' '}
          <a className="underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>{' '}
          from the email address on your account (or, for a guest booking, quote the booking reference and phone number). We may
          ask you to prove your identity and we aim to answer within 30 days. Cancelling a booking does not delete the record of
          it; ask us if you want that data removed as well.
        </P>
      </Section>

      <Section id="security" title="8. Security">
        <P>
          Access to data is restricted by role and by club (a club sees only its own bookings), connections use HTTPS, passwords are
          hashed, verification documents are in private storage with short-lived links, and requests are rate limited. No system is
          perfectly secure; if a breach affects your data we will notify you and the authorities as the law requires.
        </P>
      </Section>

      <Section id="cookies" title="9. Cookies, analytics and your choices">
        <P>
          <strong>Always on (strictly necessary):</strong> cookies that keep you signed in and secure, and a note in your browser
          remembering your privacy choices. We do not use advertising cookies.
        </P>
        <P>
          <strong>Optional, only with your consent</strong> (asked when you first visit, provider PostHog). Until you choose,
          nothing optional is loaded or stored:
        </P>
        <UL>
          <li>
            <strong>Usage analytics:</strong> anonymous page views, to see which pages are used. Secret parts of links (for
            example a guest&apos;s cancellation link) are removed before anything is sent, and no profile is created for visitors
            who are not signed in.
          </li>
          <li>
            <strong>Session recordings:</strong> recordings of how pages are used, with all text, everything you type, uploaded
            files and images hidden. Never recorded: sign-in and registration, reservations and passes, payment and invitation
            links, and club or admin dashboards.
          </li>
        </UL>
        <P>
          Refusing changes nothing about booking. You can change or withdraw your consent at any time with &ldquo;Cookie
          settings&rdquo; at the bottom of our pages; withdrawing stops collection and deletes the analytics data stored in your
          browser. <CookieSettingsButton className="underline underline-offset-2 hover:text-primary" />
        </P>
        <P>
          Our error-monitoring provider (Sentry) receives technical error reports, with personal data filtered out, to keep the
          service working and secure; a masked recording of the session can be attached when a page crashes.
        </P>
      </Section>

      <Section id="minors" title="10. Minors">
        <P>
          ShiftGrid accounts are for people aged 18 or over. A minor may play on a booking made by an adult, but must not create an
          account or book without the authorisation of a parent or guardian, who is responsible for that use.
        </P>
      </Section>

      <Section id="changes" title="11. Changes to this policy">
        <P>
          If we change this policy materially we will update the version above and, where the law requires, ask you to accept it
          again.
        </P>
      </Section>

      <Section id="contact" title="12. Contact and complaints">
        <P>
          Data-protection questions and requests:{' '}
          <a className="underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . If you believe your rights have not been respected you may complain to the Instance Nationale de Protection des
          Données Personnelles (INPDP), Tunis (inpdp.nat.tn).
        </P>
      </Section>
    </LegalDocument>
  )
}
