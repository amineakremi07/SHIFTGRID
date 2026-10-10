import type { Metadata } from 'next'
import Link from 'next/link'

import { LegalDocument, P, Section, UL } from '@/components/legal/legal-document'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_ENTITY_DETAILS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Conditions générales d’utilisation',
  description:
    'Les conditions de réservation de terrains de padel, de tennis et de football via ShiftGrid en Tunisie, et pour les clubs qui gèrent leurs sites sur la plateforme : réservations, paiement en TND, libération des réservations impayées, annulation, paiement partagé et responsabilité.',
}

const TOC = [
  { id: 'parties', title: 'Qui nous sommes et ce que couvrent ces conditions' },
  { id: 'accounts', title: 'Comptes et invités' },
  { id: 'booking', title: 'Réserver un terrain' },
  { id: 'pricing', title: 'Prix et paiement' },
  { id: 'unpaid', title: 'Paiement sur place et réservations impayées' },
  { id: 'split', title: 'Paiement partagé' },
  { id: 'cancellation', title: 'Annulation et remboursements' },
  { id: 'conduct', title: 'Comportement et usage du service' },
  { id: 'clubs', title: 'Conditions applicables aux clubs' },
  { id: 'liability', title: 'Disponibilité de la plateforme et responsabilité' },
  { id: 'ip', title: 'Propriété intellectuelle' },
  { id: 'suspension', title: 'Suspension et résiliation' },
  { id: 'data', title: 'Données personnelles' },
  { id: 'law', title: 'Dispositions générales, droit applicable et litiges' },
  { id: 'contact', title: 'Contact' },
]

export default function TermsPage() {
  return (
    <LegalDocument
      title="Conditions générales d’utilisation"
      intro="Ces conditions s’appliquent à toute personne qui utilise ShiftGrid : les joueurs et invités qui réservent des terrains, et les clubs qui référencent leurs terrains et gèrent leurs réservations sur la plateforme. En créant un compte, en inscrivant un club ou en effectuant une réservation, vous les acceptez."
      toc={TOC}
    >
      <Section id="parties" title="1. Qui nous sommes et ce que couvrent ces conditions">
        <P>
          ShiftGrid est exploité par {LEGAL_ENTITY}, société unipersonnelle à responsabilité limitée (SUARL) régie par le droit de
          la République tunisienne.{LEGAL_ENTITY_DETAILS ? ` ${LEGAL_ENTITY_DETAILS}.` : ''} Dans ces conditions, «&nbsp;ShiftGrid&nbsp;»,
          «&nbsp;nous&nbsp;» et «&nbsp;notre&nbsp;» désignent cette société.
        </P>
        <P>
          ShiftGrid fournit un logiciel. Il permet aux clubs de publier des terrains de padel, de tennis et de football, et aux
          joueurs de les réserver. Nous ne possédons, n’exploitons ni ne supervisons aucun terrain. Le contrat d’utilisation d’un
          terrain est conclu directement entre le joueur et le club, et ShiftGrid n’y est pas partie. Notre propre contrat est conclu
          avec chaque utilisateur de la plateforme, selon les présentes conditions.
        </P>
        <P>
          Deux catégories d’utilisateurs sont concernées. Les <strong>joueurs</strong> (avec un compte, ou en tant qu’invités) sont
          soumis aux articles 2 à 8. Les <strong>clubs</strong> sont en outre soumis à l’article 9. Les articles 10 à 15 s’appliquent à
          tous.
        </P>
      </Section>

      <Section id="accounts" title="2. Comptes et invités">
        <UL>
          <li>Vous devez avoir 18 ans ou plus pour créer un compte ou effectuer une réservation. Un mineur peut jouer sur une réservation faite par un adulte.</li>
          <li>
            Fournissez des informations exactes, dont un numéro de mobile tunisien sur lequel le club peut vous joindre, et gardez
            votre mot de passe confidentiel. Vous êtes responsable de l’activité de votre compte. Prévenez-nous rapidement si vous
            pensez que quelqu’un d’autre l’a utilisé.
          </li>
          <li>
            Un compte joueur est lié à un club et vous permet d’y réserver en tant que membre. Dans tout autre club, vous réservez en
            tant qu’invité, avec votre nom et votre numéro de mobile.
          </li>
          <li>
            Chaque réservation d’invité est accompagnée d’un lien privé pour la consulter ou l’annuler. Toute personne détenant ce
            lien peut annuler la réservation : gardez-le pour vous. Nous ne conservons qu’une empreinte du lien et ne pouvons pas
            l’afficher à nouveau.
          </li>
        </UL>
      </Section>

      <Section id="booking" title="3. Réserver un terrain">
        <UL>
          <li>
            La durée d’un créneau est fixée par sport : padel 90 minutes, tennis 60 minutes, football 90 minutes. Chaque créneau est
            suivi d’un battement de 15 minutes pendant lequel le terrain est retenu pour le changement de joueurs. Le battement n’est
            pas du temps de jeu.
          </li>
          <li>Vous pouvez réserver tout créneau indiqué comme disponible, dans les horaires d’ouverture du club et jusqu’à 60 jours à l’avance.</li>
          <li>
            Une réservation existe dès que l’écran de confirmation affiche son code de référence. Les créneaux sont attribués une
            demande à la fois ; si un autre joueur obtient un créneau avant vous, vous en serez informé et pourrez en choisir un autre.
          </li>
          <li>Le nombre de joueurs doit rester dans la limite du sport : padel 4, tennis 2 ou 4, football 12 ou 14.</li>
          <li>
            N’utilisez pas de scripts ni de requêtes automatisées répétées pour retenir des créneaux que vous ne comptez pas utiliser.
            Nous appliquons des limites de débit et pouvons suspendre les comptes qui abusent du service.
          </li>
        </UL>
      </Section>

      <Section id="pricing" title="4. Prix et paiement">
        <UL>
          <li>
            Les prix sont en dinars tunisiens (TND) et fixés par chaque club. Le total affiché avant votre confirmation comprend le
            tarif du terrain et, lorsque le club en applique un, un supplément d’éclairage de nuit pour les minutes jouées après
            l’heure d’éclairage.
          </li>
          <li>
            Vous pouvez payer <strong>sur place</strong>, en espèces à l’accueil du club, ou <strong>en ligne</strong> via une
            passerelle de paiement tierce telle que Konnect ou Flouci, lorsque le club et la plateforme l’ont activée. Les données de
            carte et de portefeuille sont saisies sur les pages de la passerelle ; ShiftGrid ne les reçoit ni ne les conserve.
          </li>
          <li>Les conditions propres à la passerelle régissent la transaction de paiement elle-même. Les taxes et les factures relèvent du club ; demandez-lui une facture si nécessaire.</li>
        </UL>
      </Section>

      <Section id="unpaid" title="5. Paiement sur place et réservations impayées">
        <UL>
          <li>Une réservation non encore payée a le statut «&nbsp;En attente de paiement&nbsp;» (<code>pending_payment</code> dans nos systèmes) jusqu’à l’enregistrement du paiement.</li>
          <li>
            <strong>Libération automatique.</strong> Une réservation en attente d’un paiement en ligne, ou d’une part impayée au sens
            de l’article 6, est libérée automatiquement si elle n’est pas payée dans les 30 minutes suivant sa création. Quel que soit
            son âge, une réservation toujours en attente d’un paiement en ligne 2 heures avant le début du créneau est également
            libérée. Une fois libéré, le créneau est ouvert aux autres joueurs et tout lien de paiement correspondant cesse de
            fonctionner.
          </li>
          <li>
            Une réservation à payer en espèces sur place reste en place jusqu’à ce que le club enregistre le paiement à votre arrivée
            ou annule la réservation. En réservant ainsi, vous vous engagez à vous présenter et à payer au club le prix indiqué, sauf
            si vous annulez à temps conformément à l’article 7.
          </li>
          <li>
            Si vous ne vous présentez pas et n’annulez pas, le club peut vous facturer le créneau et refuser vos futures réservations.
            ShiftGrid peut aussi enregistrer l’absence sur votre compte et, après des absences répétées, suspendre votre possibilité de
            réserver.
          </li>
        </UL>
      </Section>

      <Section id="split" title="6. Paiement partagé">
        <UL>
          <li>
            Lorsqu’il est proposé, l’organisateur peut diviser le prix à parts égales entre 4 joueurs au maximum. L’organisateur paie
            sa propre part lors de la réservation, et chaque autre joueur reçoit un lien de paiement à usage unique. Toute différence
            d’arrondi est supportée par l’organisateur.
          </li>
          <li>La réservation est confirmée lorsque toutes les parts ont été payées. Jusque-là, le créneau est retenu pour le groupe, sous réserve de la règle de libération de l’article 5.</li>
          <li>
            L’organisateur reste responsable envers le club de toute part qu’un ami n’a pas payée. Si des parts restent impayées, le
            club ou l’organisateur peut annuler la réservation, et les sommes déjà payées sont remboursées conformément à l’article 7.
          </li>
          <li>Les liens de paiement sont personnels. Ne les publiez pas. L’organisateur peut émettre un lien de remplacement pour une part encore impayée.</li>
        </UL>
      </Section>

      <Section id="cancellation" title="7. Annulation et remboursements">
        <UL>
          <li>
            Vous pouvez annuler votre propre réservation en ligne, gratuitement, jusqu’à <strong>24 heures avant son début</strong>.
            Un invité annule avec son lien privé. L’annulation libère immédiatement le créneau.
          </li>
          <li>
            Dans les dernières 24 heures, l’annulation en ligne est fermée. Contactez le club, qui peut accepter d’annuler et vous
            facturer le créneau.
          </li>
          <li>Un club peut annuler une réservation, par exemple pour maintenance ou mauvais temps. Vous en serez informé et ne devrez rien.</li>
          <li>
            Lorsqu’une réservation payée en ligne est annulée, le paiement est marqué comme remboursé dans ShiftGrid. L’argent
            lui-même est restitué par le club, ou par nous lorsque le paiement a transité par la plateforme, sur le moyen de paiement
            d’origine ou un autre moyen convenu avec vous. Les remboursements sont actuellement traités manuellement et ne sont pas
            instantanés.
          </li>
          <li>
            Les espèces payées sur place sont remboursées par le club, sur place. ShiftGrid ne détient jamais d’espèces et ne peut pas
            les rembourser.
          </li>
        </UL>
      </Section>

      <Section id="conduct" title="8. Comportement et usage du service">
        <UL>
          <li>Arrivez à l’heure. Votre créneau se termine à l’heure réservée, battement compris, même si vous arrivez en retard.</li>
          <li>Respectez le règlement intérieur du club et les consignes de son personnel. Le club peut refuser l’accès en cas de comportement dangereux ou abusif.</li>
          <li>
            N’usurpez pas l’identité d’autrui, ne tentez pas d’accéder aux données d’autres utilisateurs, n’entravez pas la
            plateforme, et ne copiez, revendez ni ne décompilez le logiciel.
          </li>
        </UL>
      </Section>

      <Section id="clubs" title="9. Conditions applicables aux clubs">
        <P>Cet article s’applique à toute entreprise qui s’inscrit sur ShiftGrid pour référencer des terrains et gérer des réservations (le «&nbsp;club&nbsp;»).</P>
        <UL>
          <li>
            <strong>Éligibilité et vérification.</strong> Un club doit être une entreprise réelle exerçant légalement en Tunisie. Nous
            examinons le document d’inscription que vous téléversez et pouvons approuver, refuser ou suspendre un club, en
            indiquant un motif. Un club n’est visible des joueurs qu’une fois approuvé et tant qu’il dispose d’un terrain actif.
          </li>
          <li>
            <strong>Ce que fournit le service.</strong> Un tableau de bord pour définir les terrains, horaires et prix ; consulter,
            créer et annuler des réservations (y compris au guichet et par téléphone) ; enregistrer l’arrivée des joueurs et les
            absences ; et consulter les chiffres de revenus et d’occupation. Les fonctionnalités peuvent évoluer avec la plateforme.
          </li>
          <li>
            <strong>Exactitude et respect des réservations.</strong> Tenez à jour les terrains, horaires et prix en TND, et honorez
            toute réservation confirmée, y compris la règle d’annulation de 24 heures de l’article 7.
          </li>
          <li>
            <strong>Équipe.</strong> Vous choisissez qui peut agir pour le club et répondez de son usage du service. Les comptes de
            l’équipe peuvent gérer les réservations ; ils ne peuvent pas modifier les terrains, les horaires ni l’équipe.
          </li>
          <li>
            <strong>Site, sécurité et espèces.</strong> Le club est seul responsable de l’état physique et de la sécurité de ses
            terrains et équipements, de l’accès au site, de l’assurance, des taxes et de la facturation, ainsi que de l’encaissement et
            du remboursement des paiements en espèces à son accueil.
          </li>
          <li>
            <strong>Remboursements dus.</strong> Vous êtes responsable des remboursements dus sur les réservations que vous annulez ou
            qui ont été payées par votre intermédiaire.
          </li>
          <li>
            <strong>Données des joueurs.</strong> Vous ne pouvez utiliser les données personnelles des joueurs que pour gérer les
            réservations pour lesquelles elles ont été fournies, et devez respecter notre politique de confidentialité et la loi
            tunisienne sur la protection des données. Vous êtes responsable de traitement indépendant des données que vous recevez au
            sujet de vos propres réservations.
          </li>
          <li>
            <strong>Frais.</strong> Si des frais s’appliquent à la plateforme, ils seront convenus par écrit avec le club ou affichés
            dans le tableau de bord avant leur entrée en vigueur.
          </li>
        </UL>
      </Section>

      <Section id="liability" title="10. Disponibilité de la plateforme et responsabilité">
        <UL>
          <li>
            ShiftGrid fournit uniquement des services logiciels. Le club est responsable du terrain, de ses équipements, des horaires
            d’ouverture, de la sécurité des lieux et de tout ce qui s’y passe. Le sport comporte un risque de blessure ; les joueurs
            participent à leurs propres risques et, lorsque cela est requis, au titre de l’assurance du club.
          </li>
          <li>
            <strong>Disponibilité.</strong> Nous nous efforçons de maintenir la plateforme disponible et exacte, mais nous ne promettons
            ni un service ininterrompu ni l’absence d’erreur, ni qu’un créneau affiché comme libre n’a pas été pris l’instant avant
            votre réservation.
          </li>
          <li>
            <strong>Maintenance et incidents.</strong> Le service peut être interrompu ou ralenti pour maintenance, mise à jour, panne
            d’un prestataire (hébergement, base de données, passerelle de paiement, e-mail) ou cas de force majeure. Nous nous
            efforçons de rétablir le service dans les meilleurs délais, sans que cela ouvre droit à indemnité. Les réservations déjà
            confirmées restent dues et honorées par le club.
          </li>
          <li>
            <strong>Évolution du service.</strong> Nous pouvons faire évoluer, suspendre ou retirer une fonctionnalité, en prévenant les
            clubs lorsque cela a un effet significatif sur leur activité.
          </li>
          <li>
            Entre vous et ShiftGrid, et dans la mesure permise par le droit tunisien, nous ne sommes pas responsables des dommages
            indirects ou consécutifs, de la perte de bénéfices ou de données, ni des actes ou omissions d’un club, d’un joueur ou d’une
            passerelle de paiement. Notre responsabilité totale pour toute réclamation relative au service est limitée au montant que
            vous nous avez payé pour celui-ci au cours des 12 mois précédant la réclamation (ou 100 TND si vous ne nous avez rien payé).
          </li>
          <li>
            Chaque utilisateur s’engage à garantir ShiftGrid contre les réclamations de tiers résultant de son non-respect des
            présentes conditions ou de son usage illicite du service, dans la mesure permise par la loi.
          </li>
          <li>Aucune disposition de ces conditions ne limite une responsabilité qui ne peut l’être par la loi, ni un droit impératif du consommateur dont vous bénéficiez en droit tunisien.</li>
        </UL>
      </Section>

      <Section id="ip" title="11. Propriété intellectuelle">
        <P>
          La plateforme ShiftGrid, son nom, son logo et son contenu nous appartiennent ou appartiennent à nos concédants. Nous vous
          accordons un droit personnel, non exclusif, non transférable et révocable d’utiliser le service pour son usage prévu. Un
          club conserve la propriété des textes et photographies qu’il téléverse et nous concède une licence pour les afficher sur la
          plateforme tant que le club y est référencé. Les suggestions que vous nous envoyez peuvent être utilisées sans obligation
          envers vous.
        </P>
      </Section>

      <Section id="suspension" title="12. Suspension et résiliation">
        <P>
          Vous pouvez cesser d’utiliser ShiftGrid à tout moment, et les joueurs peuvent supprimer leur compte depuis la page Mes
          réservations. Nous pouvons suspendre ou interrompre l’accès en cas de manquement à ces conditions, lorsque la loi l’exige,
          ou pour protéger les autres utilisateurs ou la plateforme. Les réservations en cours sont annulées et remboursées selon
          l’article 7 lorsqu’un club est fermé ou qu’un compte est supprimé. Les dispositions qui, par nature, se poursuivent
          (responsabilité, données, litiges) survivent à la résiliation.
        </P>
      </Section>

      <Section id="data" title="13. Données personnelles">
        <P>
          La manière dont nous traitons les données personnelles, et les droits que vous détenez en vertu de la loi n° 2004-63, sont
          exposés dans notre{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-primary">
            politique de confidentialité
          </Link>
          , qui fait partie de ces conditions.
        </P>
      </Section>

      <Section id="law" title="14. Dispositions générales, droit applicable et litiges">
        <UL>
          <li>
            <strong>Modifications.</strong> Nous pouvons mettre à jour ces conditions. La version et la date figurent en haut de la
            page. Les modifications importantes s’appliquent aux réservations effectuées après leur entrée en vigueur et, lorsque la loi
            l’exige, nous vous demanderons de les accepter à nouveau.
          </li>
          <li>
            <strong>Notifications électroniques.</strong> Nous pouvons envoyer des notifications par e-mail à l’adresse de votre
            compte ou les afficher dans le service, et vous acceptez qu’elles satisfassent à toute exigence d’écrit.
          </li>
          <li>
            <strong>Intégralité de l’accord.</strong> Ces conditions et la politique de confidentialité constituent l’intégralité de
            l’accord entre vous et ShiftGrid pour le service. Si une disposition est jugée invalide, le reste demeure en vigueur.
          </li>
          <li>
            <strong>Droit applicable et tribunaux.</strong> Ces conditions sont régies par le droit de la République tunisienne.
            Veuillez d’abord soumettre tout problème au club ou à nous. S’il ne peut être résolu, les tribunaux compétents de Tunis
            sont compétents, sans préjudice de toute règle impérative donnant au consommateur un autre for.
          </li>
        </UL>
      </Section>

      <Section id="contact" title="15. Contact">
        <P>
          Questions sur ces conditions :{' '}
          <a className="underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </P>
      </Section>
    </LegalDocument>
  )
}
