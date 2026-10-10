import type { Metadata } from 'next'

import { CookieSettingsButton } from '@/components/consent/consent-banner'
import { LegalDocument, P, Section, UL } from '@/components/legal/legal-document'
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY, LEGAL_ENTITY_DETAILS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Comment ShiftGrid collecte et protège les données personnelles lorsque vous réservez des terrains de padel, de tennis et de football en Tunisie, et comment exercer vos droits en vertu du droit tunisien.',
}

const TOC = [
  { id: 'controller', title: 'Qui est responsable de vos données' },
  { id: 'data', title: 'Ce que nous collectons' },
  { id: 'purposes', title: 'Pourquoi nous les utilisons' },
  { id: 'sharing', title: 'Qui les reçoit' },
  { id: 'transfers', title: 'Stockage et transferts hors de Tunisie' },
  { id: 'retention', title: 'Combien de temps nous les conservons' },
  { id: 'rights', title: 'Vos droits' },
  { id: 'security', title: 'Sécurité' },
  { id: 'cookies', title: 'Cookies, mesure d’audience et vos choix' },
  { id: 'minors', title: 'Mineurs' },
  { id: 'changes', title: 'Modifications de cette politique' },
  { id: 'contact', title: 'Contact et réclamations' },
]

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Politique de confidentialité"
      intro="ShiftGrid est une plateforme de réservation de terrains de padel, de tennis et de football en Tunisie. Cette politique décrit les données personnelles que nous collectons auprès des joueurs, des invités et du personnel des clubs, pourquoi nous les collectons, qui les reçoit, et comment vous pouvez exercer vos droits en vertu de la loi organique n° 2004-63 du 27 juillet 2004 portant sur la protection des données à caractère personnel (la loi tunisienne sur la protection des données)."
      toc={TOC}
    >
      <Section id="controller" title="1. Qui est responsable de vos données">
        <P>
          {LEGAL_ENTITY}, société unipersonnelle à responsabilité limitée (SUARL) régie par le droit de la République tunisienne,
          exploite ShiftGrid et est le responsable du traitement des données décrites ci-dessous.
          {LEGAL_ENTITY_DETAILS ? ` ${LEGAL_ENTITY_DETAILS}.` : ''}
        </P>
        <P>
          Cette politique s’applique aux joueurs et invités qui réservent des terrains, ainsi qu’aux propriétaires et au personnel des
          clubs qui utilisent le tableau de bord de gestion. Lorsque vous réservez, le club auprès duquel vous réservez reçoit
          également les détails de votre réservation et les utilise pour exploiter son site. Pour les données qu’il reçoit, ce club est
          lui-même responsable de traitement et répond de son propre usage.
        </P>
      </Section>

      <Section id="data" title="2. Ce que nous collectons">
        <UL>
          <li>
            <strong>Joueurs avec un compte :</strong> nom complet, adresse e-mail, numéro de mobile tunisien (+216XXXXXXXX), mot de
            passe (conservé uniquement sous forme d’empreinte salée par notre prestataire d’authentification), le club auquel votre
            compte est lié, et l’heure à laquelle vous avez accepté nos conditions et cette politique.
          </li>
          <li>
            <strong>Invités (sans compte) :</strong> nom complet, numéro de mobile (sous la forme +216XXXXXXXX) et, facultativement,
            une adresse e-mail. Un lien secret vous permet de consulter ou d’annuler la réservation ; nous n’en conservons qu’une
            empreinte.
          </li>
          <li>
            <strong>Réservations :</strong> club, terrain, date et heure, nombre de joueurs, prix en TND, statut (en attente de
            paiement, confirmée, annulée, terminée, absence), mode et statut de paiement, motif et heure d’annulation, votre statut
            d’arrivée sur le site (si et quand votre arrivée a été enregistrée), et votre historique de réservations.
          </li>
          <li>
            <strong>Paiements partagés :</strong> pour chaque autre joueur, le montant et s’il a été payé ; une adresse e-mail
            uniquement si l’organisateur la saisit pour envoyer le lien de paiement.
          </li>
          <li>
            <strong>Propriétaires et personnel de clubs :</strong> nom, e-mail et téléphone du propriétaire ; nom du club, numéro de
            registre de commerce, adresse, coordonnées géographiques et horaires d’ouverture ; le document d’inscription que vous
            téléversez (conservé dans un stockage privé et visible uniquement des administrateurs ShiftGrid qui vérifient les clubs) ;
            adresses e-mail des invitations du personnel.
          </li>
          <li>
            <strong>Données techniques :</strong> adresse IP et métadonnées de l’appareil (navigateur, système d’exploitation et type
            d’appareil), utilisées pour limiter les abus, sécuriser le service et diagnostiquer les problèmes, ainsi que les rapports
            d’erreur. Si une page plante, un enregistrement de cette session peut être transmis à notre prestataire de supervision
            des erreurs, avec tous les textes, champs de formulaire et images masqués. Nous ne voyons ni ne conservons jamais les
            numéros de carte : les paiements en ligne sont saisis sur les pages de la passerelle de paiement (telle que Konnect ou
            Flouci), qui nous indique seulement si le paiement a abouti.
          </li>
          <li>
            <strong>Historique des notifications :</strong> quel e-mail a été envoyé, quand, et s’il a été remis (sans les liens
            secrets qu’il contenait).
          </li>
        </UL>
      </Section>

      <Section id="purposes" title="3. Pourquoi nous les utilisons">
        <UL>
          <li>Créer et gérer votre compte et vous permettre de réserver, payer et annuler des terrains (exécution de la réservation).</li>
          <li>
            Vous envoyer des messages de service concernant une réservation : confirmation, rappel avant le début, liens de paiement
            pour vos amis, et avis d’annulation ou de remboursement. Nous utilisons aujourd’hui l’e-mail ; nous pouvons aussi vous
            contacter par téléphone ou SMS au sujet d’une réservation si nécessaire. Nous n’envoyons pas de messages commerciaux sans
            consentement distinct.
          </li>
          <li>Permettre aux clubs d’exploiter leur site, de vérifier les arrivées à l’accueil et d’enregistrer la présence, et nous permettre de vérifier que les clubs sont authentiques.</li>
          <li>Prévenir la fraude, l’accaparement de créneaux et les abus, sécuriser le service et diagnostiquer les erreurs.</li>
          <li>Respecter nos obligations légales, comptables et fiscales, et établir ou défendre des droits en justice.</li>
        </UL>
        <P>
          Lorsque la loi exige votre consentement, nous nous appuyons sur celui que vous donnez en cochant la case du formulaire
          d’inscription ou de réservation. Vous pouvez le retirer à tout moment (voir Vos droits) ; cela n’affecte pas les traitements
          déjà effectués, et nous pourrions ne pas pouvoir fournir la réservation sans les données nécessaires. Le nom et le numéro de
          mobile sont requis pour réserver ; tout ce qui est indiqué comme facultatif est laissé à votre choix.
        </P>
      </Section>

      <Section id="sharing" title="4. Qui les reçoit">
        <P>Nous ne vendons pas de données personnelles. Nous ne les partageons qu’avec :</P>
        <UL>
          <li>
            <strong>Le club auprès duquel vous réservez</strong> (et son personnel), et uniquement ce club : votre nom, votre numéro
            de téléphone, votre e-mail s’il est fourni, et les détails de votre réservation, son statut de paiement et votre statut
            d’arrivée, afin qu’il puisse vous identifier pour le terrain. Nous ne transmettons pas vos données aux autres clubs.
          </li>
          <li>
            <strong>Prestataires agissant sur nos instructions (sous-traitants) :</strong> base de données, authentification,
            stockage de fichiers et mises à jour en temps réel (Supabase) ; hébergement (Vercel) ; traitement des paiements en ligne
            (Konnect ou Flouci, lorsqu’ils sont activés) ; e-mail transactionnel (notre prestataire SMTP) ; limitation de débit
            (Upstash) ; supervision des erreurs (Sentry) et mesure d’audience produit (PostHog), ces deux derniers uniquement lorsqu’ils
            sont activés, avec filtrage des données personnelles dans les rapports d’erreur.
          </li>
          <li>Les autorités compétentes lorsque la loi l’exige.</li>
        </UL>
      </Section>

      <Section id="transfers" title="5. Stockage et transferts hors de Tunisie">
        <P>
          Nos prestataires peuvent stocker ou traiter des données sur des serveurs situés hors de Tunisie. Les transferts ne sont
          effectués que dans la mesure permise par le droit tunisien, y compris toute autorisation de l’Instance Nationale de
          Protection des Données Personnelles (INPDP) applicable, et dans le cadre de contrats imposant au prestataire de protéger les
          données et de ne les utiliser que sur nos instructions.
        </P>
      </Section>

      <Section id="retention" title="6. Combien de temps nous les conservons">
        <UL>
          <li>
            Données du compte : tant que votre compte est ouvert. Lorsque vous supprimez votre compte («&nbsp;Supprimer mon
            compte&nbsp;» sur la page Mes réservations, ou sur demande), votre nom, numéro de téléphone, e-mail, identifiant et mot de
            passe sont effacés et votre profil devient anonyme («&nbsp;Joueur Anonyme&nbsp;»). Ce que nous conservons, sans aucune
            donnée personnelle : vos réservations passées (pour la comptabilité des clubs), le nombre de réservations, et votre nombre
            d’absences et votre score de confiance sous forme de statistiques anonymes. Les réservations à venir sont annulées.
          </li>
          <li>
            Données de réservation et de paiement : aussi longtemps que nécessaire à des fins comptables, fiscales et de règlement de
            litiges, pour les durées exigées par le droit tunisien ; ensuite elles sont supprimées ou anonymisées.
          </li>
          <li>Réservants invités : conservés avec les réservations auxquelles ils se rapportent, pour les mêmes durées ; sur demande, le nom, le numéro de téléphone et l’e-mail sont effacés et la réservation reste anonyme.</li>
          <li>Les clubs et terrains fermés sont archivés, non supprimés : leur historique de réservations est conservé pour la comptabilité des clubs, mais ils ne sont plus listés ni réservables.</li>
          <li>Documents de vérification des clubs : tant que le club est actif, puis pendant la durée nécessaire pour répondre aux litiges ou aux demandes légales.</li>
          <li>Journaux techniques et compteurs de limitation de débit : de courte durée (de quelques minutes à quelques semaines).</li>
        </UL>
      </Section>

      <Section id="rights" title="7. Vos droits">
        <P>En vertu de la loi tunisienne sur la protection des données, vous avez le droit de :</P>
        <UL>
          <li>accéder aux données personnelles que nous détenons à votre sujet et en obtenir une copie ;</li>
          <li>faire corriger, mettre à jour ou compléter les données inexactes ou incomplètes ;</li>
          <li>faire supprimer vos données lorsque nous n’en avons plus besoin ou que le traitement est illicite ;</li>
          <li>vous opposer, pour des motifs légitimes, au traitement de vos données, et retirer votre consentement ;</li>
          <li>refuser l’utilisation de vos données à des fins de prospection commerciale.</li>
        </UL>
        <P>
          Pour exercer un droit, écrivez à{' '}
          <a className="underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>{' '}
          depuis l’adresse e-mail de votre compte (ou, pour une réservation d’invité, indiquez la référence de la réservation et le
          numéro de téléphone). Nous pouvons vous demander de justifier votre identité et nous visons une réponse sous 30 jours.
          Annuler une réservation n’en supprime pas l’enregistrement ; demandez-nous si vous souhaitez aussi retirer ces données.
        </P>
      </Section>

      <Section id="security" title="8. Sécurité">
        <P>
          L’accès aux données est restreint par rôle et par club (un club ne voit que ses propres réservations), les connexions
          utilisent HTTPS, les mots de passe sont hachés, les documents de vérification sont dans un stockage privé avec des liens de
          courte durée, et les requêtes sont limitées en débit. Aucun système n’est parfaitement sûr ; si une violation touche vos
          données, nous vous en informerons ainsi que les autorités, comme la loi l’exige.
        </P>
        <P>En pratique :</P>
        <UL>
          <li>
            <strong>Base de données (Supabase).</strong> Vos données sont stockées dans une base PostgreSQL gérée par Supabase, qui
            assure également l’authentification et le stockage de fichiers. Les données sont chiffrées en transit (HTTPS/TLS) et au repos
            par le prestataire.
          </li>
          <li>
            <strong>Sécurité au niveau des lignes (RLS).</strong> Les tables contenant des données personnelles sont protégées par des
            règles de sécurité au niveau des lignes appliquées par la base elle-même : un joueur ne peut lire que ses propres
            réservations, le personnel d’un club ne peut lire et modifier que les données de son club, et aucun compte ne peut s’attribuer
            lui-même des droits supplémentaires. Ces règles s’appliquent même si l’application était mal sollicitée.
          </li>
          <li>
            <strong>Accès privilégiés.</strong> Les opérations qui dépassent ces règles (par exemple la vérification d’un club par un
            administrateur de la plateforme) sont exécutées côté serveur, après vérification du rôle de l’appelant, et jamais exposées au
            navigateur. Les clés d’accès privilégiées ne figurent pas dans le code distribué aux utilisateurs.
          </li>
          <li>
            <strong>Minimisation.</strong> Les liens secrets (annulation, paiement, pass) ne sont conservés que sous forme d’empreinte,
            et ne figurent pas dans l’historique des notifications.
          </li>
        </UL>
      </Section>

      <Section id="cookies" title="9. Cookies, mesure d’audience et vos choix">
        <P>
          <strong>Toujours actifs (strictement nécessaires) :</strong> les cookies qui vous maintiennent connecté et en sécurité, et
          une mention dans votre navigateur qui retient vos choix de confidentialité. Nous n’utilisons pas de cookies publicitaires.
        </P>
        <P>
          <strong>Facultatifs, uniquement avec votre consentement</strong> (demandé lors de votre première visite, prestataire
          PostHog). Tant que vous n’avez pas choisi, rien de facultatif n’est chargé ni stocké :
        </P>
        <UL>
          <li>
            <strong>Mesure d’audience :</strong> pages vues anonymes, pour voir quelles pages sont utilisées. Les parties secrètes des
            liens (par exemple le lien d’annulation d’un invité) sont retirées avant tout envoi, et aucun profil n’est créé pour les
            visiteurs non connectés.
          </li>
          <li>
            <strong>Enregistrements de session :</strong> enregistrements de l’utilisation des pages, avec tous les textes, tout ce
            que vous saisissez, les fichiers téléversés et les images masqués. Jamais enregistrés : connexion et inscription,
            réservations et pass, liens de paiement et d’invitation, et tableaux de bord de club ou d’administration.
          </li>
        </UL>
        <P>
          Refuser ne change rien à la réservation. Vous pouvez modifier ou retirer votre consentement à tout moment avec
          «&nbsp;Paramètres des cookies&nbsp;» en bas de nos pages ; le retrait arrête la collecte et supprime les données de mesure
          d’audience stockées dans votre navigateur.{' '}
          <CookieSettingsButton className="underline underline-offset-2 hover:text-primary" />
        </P>
        <P>
          Notre prestataire de supervision des erreurs (Sentry) reçoit des rapports d’erreur techniques, avec filtrage des données
          personnelles, afin de maintenir le service en état de marche et sécurisé ; un enregistrement masqué de la session peut être
          joint lorsqu’une page plante.
        </P>
      </Section>

      <Section id="minors" title="10. Mineurs">
        <P>
          Les comptes ShiftGrid sont réservés aux personnes âgées de 18 ans ou plus. Un mineur peut jouer sur une réservation faite par
          un adulte, mais ne doit pas créer de compte ni réserver sans l’autorisation d’un parent ou tuteur, qui est responsable de cet
          usage.
        </P>
      </Section>

      <Section id="changes" title="11. Modifications de cette politique">
        <P>
          Si nous modifions cette politique de manière importante, nous mettrons à jour la version ci-dessus et, lorsque la loi
          l’exige, nous vous demanderons de l’accepter à nouveau.
        </P>
      </Section>

      <Section id="contact" title="12. Contact et réclamations">
        <P>
          Questions et demandes relatives à la protection des données :{' '}
          <a className="underline underline-offset-2" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Si vous estimez que vos droits n’ont pas été respectés, vous pouvez déposer une réclamation auprès de l’Instance Nationale
          de Protection des Données Personnelles (INPDP), Tunis (inpdp.nat.tn).
        </P>
      </Section>
    </LegalDocument>
  )
}
