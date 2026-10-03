import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalDocument, P, Section, UL } from '@/components/legal/legal-document'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_ENTITY_DETAILS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The rules for booking padel, tennis and football courts through ShiftGrid in Tunisia: bookings, payment in TND, cancellation, split payments and club obligations.',
}

const TOC = [
  { id: 'about', title: 'About ShiftGrid and these Terms' },
  { id: 'accounts', title: 'Accounts and guests' },
  { id: 'booking', title: 'Booking a court' },
  { id: 'pricing', title: 'Prices and payment' },
  { id: 'unpaid', title: 'Pay at the venue and unpaid bookings' },
  { id: 'split', title: 'Split payments' },
  { id: 'cancellation', title: 'Cancellation and refunds' },
  { id: 'conduct', title: 'Using the venue and the service' },
  { id: 'clubs', title: 'Terms for clubs' },
  { id: 'liability', title: 'Responsibility and liability' },
  { id: 'data', title: 'Personal data' },
  { id: 'law', title: 'Changes, governing law and disputes' },
  { id: 'contact', title: 'Contact' },
]

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro="These Terms govern your use of ShiftGrid to find and book sports courts in Tunisia. By creating an account, registering a club or making a booking you accept them. If you do not accept them, please do not use the service."
      toc={TOC}
    >
      <Section id="about" title="1. About ShiftGrid and these Terms">
        <P>
          ShiftGrid is operated by {LEGAL_ENTITY}.{LEGAL_ENTITY_DETAILS ? ` ${LEGAL_ENTITY_DETAILS}.` : ''} ShiftGrid is a booking
          platform: the court is provided by the club, and the contract to use a court is between you and that club. ShiftGrid is
          not a party to it and does not own or run the courts.
        </P>
      </Section>

      <Section id="accounts" title="2. Accounts and guests">
        <UL>
          <li>You must be 18 or over to create an account or book. Minors may play only on a booking made by an adult.</li>
          <li>Give accurate details, including a Tunisian mobile number we can reach you on, and keep your password confidential.</li>
          <li>
            A player account is linked to one club and lets you book there as a member. At other clubs you book as a guest with
            your name and mobile number.
          </li>
          <li>
            A guest booking comes with a secret link to view or cancel it. Anyone holding the link can cancel the booking, so keep
            it private: we cannot show it again.
          </li>
        </UL>
      </Section>

      <Section id="booking" title="3. Booking a court">
        <UL>
          <li>
            Slots are fixed by sport: padel 90 minutes, tennis 60 minutes, football 90 minutes, each followed by a 15-minute buffer
            during which the court is held for changeover. The buffer is not extra playing time.
          </li>
          <li>You can book a slot that is shown as available, up to 60 days ahead, within the club&apos;s opening hours.</li>
          <li>
            A booking is made when you see the confirmation and reference code. Slots are allocated one at a time: if another
            player takes the slot first, you will be told and can choose another.
          </li>
          <li>The number of players must respect the sport&apos;s limit (padel 4, tennis 2 or 4, football 12 or 14).</li>
          <li>
            Do not use scripts or repeated requests to hold slots you do not intend to use. We limit request rates and may suspend
            accounts that abuse the service.
          </li>
        </UL>
      </Section>

      <Section id="pricing" title="4. Prices and payment">
        <UL>
          <li>
            All prices are in Tunisian dinars (TND) and are set by the club. The total shown before you confirm includes the court
            fee and any night-lighting surcharge for the minutes played after the club&apos;s lighting time.
          </li>
          <li>
            <strong>Pay at the venue (cash)</strong> is the default. Online payment is offered only when a club and the service
            have it enabled; until then it is not available and no money is taken online.
          </li>
          <li>Taxes and invoices are the club&apos;s responsibility; ask the club if you need an invoice.</li>
        </UL>
      </Section>

      <Section id="unpaid" title="5. Pay at the venue and unpaid bookings">
        <UL>
          <li>A booking to be paid at the venue shows as &ldquo;Awaiting payment&rdquo; until the club marks it paid.</li>
          <li>
            By booking you commit to attend and to pay the club the price shown on arrival, unless you cancel in time (section 7).
          </li>
          <li>
            A club may cancel and release a booking that is still unpaid, for example if it cannot reach you. ShiftGrid does not yet
            release unpaid bookings automatically after a deadline; we will state any automatic deadline here and on the booking
            screen before applying it.
          </li>
          <li>
            If you do not come and do not cancel, the club may ask you to pay for the slot and may refuse your future bookings.
          </li>
        </UL>
      </Section>

      <Section id="split" title="6. Split payments">
        <UL>
          <li>
            Where offered, the organiser can split the price equally between up to 4 players. The organiser pays their share when
            booking and each other player receives a one-use payment link. Any rounding difference is paid by the organiser.
          </li>
          <li>The booking is confirmed when every share is paid. Until then the slot is held for the group.</li>
          <li>
            The organiser remains responsible to the club for any share a friend has not paid. If shares remain unpaid, the club or
            the organiser may cancel the booking, and what has already been paid is refunded under section 7.
          </li>
          <li>Payment links are personal and single-use: do not share them publicly. The organiser can issue a replacement link for an unpaid share.</li>
        </UL>
      </Section>

      <Section id="cancellation" title="7. Cancellation and refunds">
        <UL>
          <li>
            You can cancel your own booking online, free of charge, up to <strong>24 hours before it starts</strong>. A guest
            cancels with the secret link. Cancelling frees the slot immediately for other players.
          </li>
          <li>
            Inside the 24 hours before the start, online cancellation is closed; contact the club, which may agree to cancel and
            may charge for the slot.
          </li>
          <li>A club may cancel a booking (for example for maintenance or weather). You will be told and nothing is due from you.</li>
          <li>
            When a booking that was paid online is cancelled, the payment is marked as refunded and the amount is returned to you
            by the club or by us using the original method or another agreed method. Refunds are currently processed manually, so
            they are not instant. Cash that was never paid is not owed.
          </li>
        </UL>
      </Section>

      <Section id="conduct" title="8. Using the venue and the service">
        <UL>
          <li>Arrive on time: your slot ends at the booked time, buffer included, even if you arrive late.</li>
          <li>Follow the club&apos;s house rules and staff instructions. The club may refuse entry for unsafe or abusive behaviour.</li>
          <li>Do not misuse the service: no false identities, no attempts to access other people&apos;s data, no interference with the platform.</li>
        </UL>
      </Section>

      <Section id="clubs" title="9. Terms for clubs">
        <UL>
          <li>
            A club must be a real, lawfully operating business. We verify the registration document you upload and may approve,
            reject or suspend a club, with a reason.
          </li>
          <li>Keep your courts, hours and prices accurate in TND, and honour confirmed bookings, including the 24-hour cancellation rule.</li>
          <li>
            You decide who your staff are and are responsible for their use of the service. Staff can manage bookings, not the
            club&apos;s courts, hours or team.
          </li>
          <li>
            You are responsible for taxes, invoicing, insurance, safety of the courts, and for refunds due on bookings you cancel or
            that were paid through the club.
          </li>
          <li>
            You may use player data only to run the bookings it was given for, and must respect the Privacy Policy and Tunisian
            data protection law.
          </li>
        </UL>
      </Section>

      <Section id="liability" title="10. Responsibility and liability">
        <UL>
          <li>
            The club is responsible for the court, the equipment, opening times and the safety of the venue. Playing sport carries
            risk of injury; you play at your own risk and, where required, under the club&apos;s insurance.
          </li>
          <li>
            We work to keep ShiftGrid available and accurate, but do not guarantee uninterrupted service or that every displayed
            slot is free in the instant before someone else books it.
          </li>
          <li>
            To the extent Tunisian law allows, ShiftGrid is not liable for indirect losses, or for what a club does or fails to do.
            Nothing here limits rights you have as a consumer under Tunisian law that cannot be excluded.
          </li>
        </UL>
      </Section>

      <Section id="data" title="11. Personal data">
        <P>
          How we use your data, and your rights under Tunisian law (Loi n° 2004-63), are described in our{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-primary">
            Privacy Policy
          </Link>
          .
        </P>
      </Section>

      <Section id="law" title="12. Changes, governing law and disputes">
        <UL>
          <li>
            We may update these Terms. The version is shown at the top; material changes apply to new bookings and, where the law
            requires, we will ask you to accept them again.
          </li>
          <li>
            These Terms are governed by Tunisian law. Try first to resolve a problem with the club or with us. Failing that, the
            competent Tunisian courts have jurisdiction, without affecting any mandatory consumer rules that give you another forum.
          </li>
        </UL>
      </Section>

      <Section id="contact" title="13. Contact">
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
