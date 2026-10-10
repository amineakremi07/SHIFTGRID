/**
 * French UI copy for the public site: landing page, footer, club-dashboard nav.
 * The site is French-only; keys keep copy in one place and out of the JSX.
 * `{name}` placeholders are filled by `t(key, { name })`.
 */

const fr = {
  'nav.primary': 'Navigation principale',
  'nav.home': 'Accueil',
  'nav.clubs': 'Clubs',
  'nav.how': 'Comment ça marche',
  'nav.howShort': 'Étapes',
  'nav.login': 'Connexion',
  'nav.register': "S'inscrire",
  'nav.signOut': 'Se déconnecter',
  'nav.menu': 'Menu',
  'nav.openMenu': 'Ouvrir le menu',
  'nav.account': 'Compte',
  'nav.sections': 'Sections de la page',
  'nav.myReservations': 'Mes réservations',
  'nav.dashboard': 'Tableau de bord',
  'nav.admin': 'Administration',
  'nav.scrollTop': 'Retour en haut',

  'hero.players': '25 k+ joueurs actifs',
  'hero.country': 'Tunisie',
  'hero.title': 'Réservez votre terrain idéal en quelques secondes',
  'hero.body':
    'Terrains de padel, de tennis et de football partout en Tunisie. Consultez les disponibilités en direct, choisissez un créneau et verrouillez-le — prix en TND.',
  'hero.cta': 'Trouver un terrain',
  'hero.how': 'Comment ça marche',
  'hero.match.label': 'Match à la une',
  'hero.match.spots': '4 places restantes',
  'hero.match.name': 'Tunis Padel Open',
  'hero.match.when': 'Sam · 18:30 · Lac 2',
  'hero.match.joined': '12 / 16 joueurs inscrits',

  'disc.eyebrow': 'Découvrir',
  'disc.title': 'Trouvez un club de sport près de chez vous',
  'disc.body':
    "Recherchez par club ou par lieu, choisissez votre sport, puis ouvrez un site pour voir ses terrains et ses disponibilités en direct.",
  'disc.searchPlaceholder': "Rechercher un club ou un site (ex. : « Padel Club La Marsa »)...",
  'disc.searchLabel': 'Rechercher un club ou un site',
  'disc.clearSearch': 'Effacer la recherche',
  'disc.nearest': 'Près de moi',
  'disc.locating': 'Localisation…',
  'disc.filterSport': 'Filtrer par sport',
  'disc.sport.all': 'Tous',
  'disc.count.one': '{n} club',
  'disc.count.other': '{n} clubs',
  'disc.nearestFirst': ' · les plus proches d’abord',
  'disc.geo.denied': "L'accès à la position a été refusé : les clubs sont classés par ordre alphabétique.",
  'disc.geo.timeout': 'La localisation a pris trop de temps. Veuillez réessayer.',
  'disc.geo.unavailable': 'Votre position est introuvable pour le moment.',
  'disc.geo.unsupported': 'Votre navigateur ne prend pas en charge la géolocalisation.',
  'disc.geo.unranked':
    "Aucun de ces clubs n'a encore partagé sa position sur la carte : impossible de les classer par distance.",
  'disc.failed.title': 'Impossible de charger les clubs pour le moment',
  'disc.failed.body': 'Veuillez actualiser la page dans un instant.',
  'disc.empty.title': "Aucun club n'est encore répertorié",
  'disc.empty.body':
    'Les clubs apparaissent ici dès qu’ils sont vérifiés et que leurs terrains sont configurés.',
  'disc.noMatch.title': 'Aucun club ne correspond à votre recherche',
  'disc.noMatch.body': 'Essayez un autre nom, un autre lieu ou un autre sport.',
  'disc.clearFilters': 'Réinitialiser les filtres',
  'disc.listClub': 'Référencer votre club',
  'disc.card.sports': 'Sports proposés',
  'disc.card.hours': "Horaires d'ouverture",
  'disc.card.courts': 'Terrains',
  'disc.card.openToday': "Ouvert aujourd'hui : {hours}",
  'disc.card.from': 'À partir de ',
  'disc.card.onRequest': 'Prix sur demande',
  'disc.card.book': 'Voir les créneaux et réserver',
  'disc.card.court.one': '{n} terrain de {sport}',
  'disc.card.court.other': '{n} terrains de {sport}',
  'disc.card.tunisia': 'Tunisie',

  'how.eyebrow': 'Comment ça marche',
  'how.title': 'De la recherche au match en quatre étapes',
  'how.s1.title': 'Choisissez un terrain',
  'how.s1.body': 'Sélectionnez votre sport et la zone où vous souhaitez jouer.',
  'how.s1.t1': 'Lieu',
  'how.s1.t2': 'Sport',
  'how.s2.title': 'Explorez les installations',
  'how.s2.body': 'Comparez ce que propose chaque complexe avant de vous décider.',
  'how.s2.t1': 'Type de surface',
  'how.s2.t2': 'Éclairage',
  'how.s2.t3': 'Équipements',
  'how.s3.title': 'Sélectionnez un créneau',
  'how.s3.body':
    'Consultez les disponibilités en direct dans la grille. Les créneaux réservés ou retenus sont clairement indiqués.',
  'how.s3.t1': 'Grille interactive',
  'how.s4.title': 'Confirmez et jouez',
  'how.s4.body':
    'Votre créneau est verrouillé dès la confirmation, avec le total affiché en TND.',
  'how.s4.t1': 'Verrouillage instantané',
  'how.s4.t2': 'Confirmation en TND',

  'footer.tagline': '© 2026 ShiftGrid. Réservation de terrains de sport en Tunisie.',
  'footer.nav': 'Pied de page',
  'footer.clubs': 'Clubs',
  'footer.list': 'Référencer votre club',
  'footer.terms': 'Conditions',
  'footer.privacy': 'Confidentialité',
  'footer.cookies': 'Paramètres des cookies',

  'dash.nav': 'Tableau de bord du club',
  'dash.bookings': 'Réservations',
  'dash.analytics': 'Statistiques',
  'dash.courts': 'Terrains',
  'dash.settings': 'Paramètres',
  'dash.team': 'Équipe',
  'dash.security': 'Sécurité',
} as const

export type MessageKey = keyof typeof fr

/** Looks a key up and fills `{name}` placeholders. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text: string = fr[key]
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}
