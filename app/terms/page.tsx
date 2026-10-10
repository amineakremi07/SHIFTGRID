import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalDocument, P, Section, UL } from '@/components/legal/legal-document'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_ENTITY_DETAILS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms for booking padel, tennis and football courts through ShiftGrid in Tunisia, and for clubs that manage their venues on the platform: bookings, payment in TND, release of unpaid reservations, cancellation, split payments and liability.',
}

const TOC = [
  { id: 'parties', title: 'Who we are and what these Terms cover' },
  { id: 'accounts', title: 'Accounts and guests' },
  { id: 'booking', title: 'Booking a court' },
  { id: 'pricing', title: 'Prices and payment' },
  { id: 'unpaid', title: 'Pay at the venue and unpaid bookings' },
  { id: 'split', title: 'Split payments' },
  { id: 'cancellation', title: 'Cancellation and refunds' },
  { id: 'conduct', title: 'Conduct and use of the service' },
  { id: 'clubs', title: 'Terms for clubs' },
  { id: 'liability', title: 'Responsibility and liability' },
  { id: 'ip', title: 'Intellectual property' },
  { id: 'suspension', title: 'Suspension and termination' },
  { id: 'data', title: 'Personal data' },
  { id: 'law', title: 'General, governing law and disputes' },
  { id: 'contact', title: 'Contact' },
]

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro="These Terms apply to everyone who uses ShiftGrid: players and guests who book courts, and the clubs that list their courts and run their bookings on the platform. By creating an account, registering a club or making a booking, you agree to them."
      toc={TOC}
    >
      <Section id="parties" title="1. Who we are and what these Terms cover">
        <P>
          ShiftGrid is operated by {LEGAL_ENTITY}, a société unipersonnelle à responsabilité limitée (SUARL) organised under the
          laws of the Republic of Tunisia.{LEGAL_ENTITY_DETAILS ? ` ${LEGAL_ENTITY_DETAILS}.` : ''} In these Terms, &ldquo;ShiftGrid&rdquo;,
          &ldquo;we&rdquo; and &ldquo;us&rdquo; mean that company.
        </P>
        <P>
          ShiftGrid supplies software. It lets clubs publish padel, tennis and football courts, and lets players reserve them. We do
          not own, operate or supervise any court. The contract to use a court is made directly between the player and the club, and
          ShiftGrid is not a party to it. Our own contract is with each user of the platform, on these Terms.
        </P>
        <P>
          Two groups of users are covered. <strong>Players</strong> (with an account, or as guests) are bound by sections 2 to 8.
          <strong> Clubs</strong> are bound by section 9 in addition. Sections 10 to 15 apply to everyone.
        </P>
      </Section>

      <Section id="accounts" title="2. Accounts and guests">
        <UL>
          <li>You must be 18 or over to create an account or make a booking. A minor may play on a booking made by an adult.</li>
          <li>
            Give accurate information, including a Tunisian mobile number on which the club can reach you, and keep your password
            confidential. You are responsible for activity under your account. Tell us promptly if you think someone else has used it.
          </li>
          <li>
            A player account is linked to one club and lets you book there as a member. At any other club you book as a guest, with
            your name and mobile number.
          </li>
          <li>
            Each guest booking comes with a private link to view or cancel it. Anyone who holds the link can cancel the booking, so
            keep it to yourself. We store only a hash of the link and cannot display it again.
          </li>
        </UL>
      </Section>

      <Section id="booking" title="3. Booking a court">
        <UL>
          <li>
            Slot length is fixed by sport: padel 90 minutes, tennis 60 minutes, football 90 minutes. Each slot is followed by a
            15-minute buffer in which the court is held for changeover. The buffer is not playing time.
          </li>
          <li>You may book any slot shown as available, within the club&apos;s opening hours and up to 60 days ahead.</li>
          <li>
            A booking exists once the confirmation screen shows its reference code. Slots are allocated one request at a time; if
            another player secures a slot first, you will be told and can choose another.
          </li>
          <li>The number of players must stay within the limit for the sport: padel 4, tennis 2 or 4, football 12 or 14.</li>
          <li>
            Do not use scripts or repeated automated requests to hold slots you do not intend to use. We apply rate limits and may
            suspend accounts that abuse the service.
          </li>
        </UL>
      </Section>

      <Section id="pricing" title="4. Prices and payment">
        <UL>
          <li>
            Prices are in Tunisian dinars (TND) and are set by each club. The total displayed before you confirm includes the court
            fee and, where the club applies one, a night-lighting surcharge for the minutes played after its lighting time.
          </li>
          <li>
            You can pay <strong>at the venue</strong>, in cash at the club&apos;s front desk, or <strong>online</strong> through a
            third-party payment gateway such as Konnect or Flouci, where the club and the platform have enabled it. Card and wallet
            details are entered on the gateway&apos;s pages; ShiftGrid does not receive or store them.
          </li>
          <li>The gateway&apos;s own terms govern the payment transaction itself. Taxes and invoices are the club&apos;s responsibility; ask the club if you need an invoice.</li>
        </UL>
      </Section>

      <Section id="unpaid" title="5. Pay at the venue and unpaid bookings">
        <UL>
          <li>A reservation that has not yet been paid has the status &ldquo;Awaiting payment&rdquo; (<code>pending_payment</code> in our systems) until payment is recorded.</li>
          <li>
            <strong>Automatic release.</strong> A reservation that is waiting for an online payment, or for an unpaid share under
            section 6, is released automatically if it is not paid within 30 minutes of being made. Whatever its age, a reservation
            that is still waiting for an online payment 2 hours before the slot starts is also released. Once released, the slot is
            open to other players and any link to pay for it stops working.
          </li>
          <li>
            A reservation to be paid in cash at the venue stays in place until the club records the payment on arrival or cancels the
            booking. By booking this way you undertake to attend and to pay the club the price shown, unless you cancel in time under
            section 7.
          </li>
          <li>
            If you neither attend nor cancel, the club may charge you for the slot and may refuse your future bookings. ShiftGrid may
            also record the no-show against your account and, after repeated no-shows, suspend your ability to book.
          </li>
        </UL>
      </Section>

      <Section id="split" title="6. Split payments">
        <UL>
          <li>
            Where offered, the organiser can divide the price equally among up to 4 players. The organiser pays their own share when
            booking, and each other player receives a single-use payment link. Any rounding difference is borne by the organiser.
          </li>
          <li>The booking is confirmed when every share has been paid. Until then the slot is held for the group, subject to the release rule in section 5.</li>
          <li>
            The organiser remains answerable to the club for any share that a friend has not paid. If shares are still outstanding,
            the club or the organiser may cancel the booking, and amounts already paid are refunded under section 7.
          </li>
          <li>Payment links are personal. Do not publish them. The organiser can issue a replacement link for a share that is still unpaid.</li>
        </UL>
      </Section>

      <Section id="cancellation" title="7. Cancellation and refunds">
        <UL>
          <li>
            You can cancel your own booking online, free of charge, up to <strong>24 hours before it starts</strong>. A guest cancels
            with the private link. Cancelling releases the slot at once.
          </li>
          <li>
            In the last 24 hours online cancellation is closed. Contact the club, which may agree to cancel and may charge for the slot.
          </li>
          <li>A club may cancel a booking, for example for maintenance or bad weather. You will be told, and nothing is owed by you.</li>
          <li>
            When a booking paid online is cancelled, the payment is marked as refunded in ShiftGrid. The money itself is returned by
            the club, or by us where the payment went through the platform, to the original payment method or another method agreed
            with you. Refunds are currently handled manually and are not instant.
          </li>
          <li>
            Cash paid at the venue is refunded by the club, at the venue. ShiftGrid never holds cash and cannot refund it.
          </li>
        </UL>
      </Section>

      <Section id="conduct" title="8. Conduct and use of the service">
        <UL>
          <li>Arrive on time. Your slot ends at the booked time, buffer included, even if you arrive late.</li>
          <li>Follow the club&apos;s house rules and its staff&apos;s instructions. The club may refuse entry for unsafe or abusive behaviour.</li>
          <li>
            Do not use another person&apos;s identity, probe or attempt to access other users&apos; data, interfere with the platform,
            or copy, resell or reverse-engineer the software.
          </li>
        </UL>
      </Section>

      <Section id="clubs" title="9. Terms for clubs">
        <P>This section applies to a business that registers on ShiftGrid to list courts and manage bookings (the &ldquo;club&rdquo;).</P>
        <UL>
          <li>
            <strong>Eligibility and verification.</strong> A club must be a genuine business operating lawfully in Tunisia. We review
            the registration document you upload and may approve, reject or suspend a club, giving a reason. A club is shown to
            players only once approved and only while it has an active court.
          </li>
          <li>
            <strong>What the service provides.</strong> A dashboard to set courts, hours and prices; to view, create and cancel
            bookings (including walk-in and phone bookings); to check players in and record no-shows; and to see revenue and
            occupancy figures. Features may change as the platform develops.
          </li>
          <li>
            <strong>Accuracy and honouring bookings.</strong> Keep courts, hours and prices accurate in TND, and honour every
            confirmed booking, including the 24-hour cancellation rule in section 7.
          </li>
          <li>
            <strong>Staff.</strong> You choose who may act for the club and answer for their use of the service. Staff accounts can
            manage bookings; they cannot change courts, hours or the team.
          </li>
          <li>
            <strong>Venue, safety and cash.</strong> The club alone is responsible for the physical condition and safety of its
            courts and equipment, for access to the venue, for insurance, for taxes and invoicing, and for taking and refunding
            cash payments at its front desk.
          </li>
          <li>
            <strong>Refunds you owe.</strong> You are responsible for refunds due on bookings that you cancel or that were paid
            through you.
          </li>
          <li>
            <strong>Player data.</strong> You may use players&apos; personal data only to run the bookings it was supplied for, and
            you must comply with our Privacy Policy and Tunisian data protection law. You are an independent controller of the data
            you receive about your own bookings.
          </li>
          <li>
            <strong>Fees.</strong> If a fee applies to the platform, it will be agreed with the club in writing or shown in the
            dashboard before it takes effect.
          </li>
        </UL>
      </Section>

      <Section id="liability" title="10. Responsibility and liability">
        <UL>
          <li>
            ShiftGrid provides software services only. The club is responsible for the court, its equipment, opening times, the
            safety of the premises and anything that happens there. Sport carries a risk of injury; players take part at their own
            risk and, where required, under the club&apos;s insurance.
          </li>
          <li>
            We work to keep the platform available and accurate, but we do not promise uninterrupted service, or that a slot
            displayed as free has not been taken in the moment before you book.
          </li>
          <li>
            As between you and ShiftGrid, and as far as Tunisian law allows, we are not liable for indirect or consequential loss,
            for loss of profit or data, or for the acts or omissions of a club, a player or a payment gateway. Our total liability
            for a claim relating to the service is limited to the amount you paid us for it in the 12 months before the claim arose
            (or TND 100 where you paid us nothing).
          </li>
          <li>
            Each user agrees to indemnify ShiftGrid against third-party claims arising from that user&apos;s breach of these Terms or
            unlawful use of the service, to the extent the law allows.
          </li>
          <li>Nothing in these Terms limits liability that cannot be limited by law, or any mandatory consumer right you hold under Tunisian law.</li>
        </UL>
      </Section>

      <Section id="ip" title="11. Intellectual property">
        <P>
          The ShiftGrid platform, name, logo and content belong to us or our licensors. We grant you a personal, non-exclusive,
          non-transferable and revocable right to use the service for its intended purpose. A club keeps ownership of the text and
          photographs it uploads and gives us a licence to display them on the platform for as long as the club is listed.
          Suggestions you send us may be used without obligation to you.
        </P>
      </Section>

      <Section id="suspension" title="12. Suspension and termination">
        <P>
          You may stop using ShiftGrid at any time, and players can delete their account from the My reservations page. We may
          suspend or end access where these Terms are breached, where the law requires it, or to protect other users or the
          platform. Open bookings are cancelled and refunded under section 7 when a club is closed or an account is deleted.
          Sections that by their nature continue (liability, data, disputes) survive termination.
        </P>
      </Section>

      <Section id="data" title="13. Personal data">
        <P>
          How we handle personal data, and the rights you hold under Loi n° 2004-63, are set out in our{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-primary">
            Privacy Policy
          </Link>
          , which forms part of these Terms.
        </P>
      </Section>

      <Section id="law" title="14. General, governing law and disputes">
        <UL>
          <li>
            <strong>Changes.</strong> We may update these Terms. The version and date appear at the top of the page. Material changes
            apply to bookings made after they take effect and, where the law requires it, we will ask you to accept them again.
          </li>
          <li>
            <strong>Electronic notices.</strong> We may send notices by email to the address on your account or display them in the
            service, and you agree that these satisfy any requirement of writing.
          </li>
          <li>
            <strong>Entire agreement.</strong> These Terms and the Privacy Policy are the whole agreement between you and ShiftGrid
            for the service. If a provision is held invalid, the rest remains in force.
          </li>
          <li>
            <strong>Governing law and courts.</strong> These Terms are governed by the laws of the Republic of Tunisia. Please raise
            a problem with the club or with us first. If it cannot be resolved, the competent courts of Tunis have jurisdiction,
            without prejudice to any mandatory rule that gives a consumer another forum.
          </li>
        </UL>
      </Section>

      <Section id="contact" title="15. Contact">
        <P>
          Questions about these Terms:{' '}
          <a className="underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalDocument>
  )
}
