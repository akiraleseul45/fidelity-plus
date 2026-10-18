/**
 * Legal content for Fidelity Plus (audit FP-04 / FP-10).
 *
 * Publisher identity is intentionally limited to what the operator provided
 * (company name + contact email). Fields that were not provided (e.g. SIREN,
 * postal address) are omitted rather than invented. Hosting providers are
 * stated as public facts.
 */

export const PUBLISHER = {
  name: 'Akira Corp',
  contactEmail: 'fidelity.plus45@gmail.com',
};

export type LegalDoc = {
  key: 'mentions' | 'privacy' | 'terms' | 'program';
  title: string;
  updated: string;
  body: string;
};

const UPDATED = '18 octobre 2026';

export const LEGAL_DOCS: Record<LegalDoc['key'], LegalDoc> = {
  mentions: {
    key: 'mentions',
    title: 'Mentions légales',
    updated: UPDATED,
    body: `Éditeur
${PUBLISHER.name}
Contact : ${PUBLISHER.contactEmail}

Directeur de la publication
Le représentant de ${PUBLISHER.name}.

Hébergement
• Frontend : Vercel Inc. (340 S Lemon Ave #4133, Walnut, CA 91789, États‑Unis).
• API (backend) : Render — Render Services, Inc. (San Francisco, CA, États‑Unis), région de traitement : Francfort (UE).
• Base de données : Supabase Inc., base hébergée dans l'Union européenne (Paris, eu‑west‑3).
• Envoi d'emails : Brevo — Sendinblue SAS (7 rue de Madrid, 75008 Paris, France).
• Protection réseau / CDN : Cloudflare, Inc.

Propriété intellectuelle
L'ensemble des éléments de l'application (marque, textes, interface) est la propriété de l'éditeur, sauf mention contraire. Les fonds cartographiques proviennent d'OpenStreetMap (© contributeurs OpenStreetMap).

Contact
Pour toute question : ${PUBLISHER.contactEmail}.`,
  },

  privacy: {
    key: 'privacy',
    title: 'Politique de confidentialité',
    updated: UPDATED,
    body: `${PUBLISHER.name} (« nous ») exploite Fidelity Plus, une carte de fidélité numérique. Cette politique décrit les données que nous traitons et vos droits (RGPD).

Responsable du traitement
${PUBLISHER.name} — Contact : ${PUBLISHER.contactEmail}.

Données que nous traitons
• Client : pseudonyme, adresse email (facultative), code de connexion (stocké uniquement sous forme chiffrée/haché), solde de points et historique des passages (scans), sessions de connexion (adresse IP, type de navigateur), date de consentement.
• Partenaire (commerçant) : nom du gérant, nom et adresse du commerce, téléphones, email, image éventuelle, paramètres de récompense, statut du compte.

Finalités et bases légales
• Fournir et sécuriser le service de fidélité (création de compte, authentification, cumul de points, récompenses) : exécution du contrat (art. 6.1.b RGPD).
• Sécurité, prévention de la fraude et limitation des abus (journaux techniques, nonces anti‑rejeu, adresse IP) : intérêt légitime (art. 6.1.f).
• Envoi du code de connexion et des informations de compte par email : exécution du contrat.
Nous n'envoyons aucune communication commerciale et ne revendons aucune donnée.

Destinataires et sous‑traitants
Les commerçants partenaires voient le pseudonyme et le solde de points des clients qui les fréquentent. Nos sous‑traitants techniques sont Vercel, Render, Supabase, Brevo et Cloudflare (voir Mentions légales). Certains sont situés hors UE ; les transferts éventuels sont encadrés par les mécanismes prévus au RGPD.

Durées de conservation
• Compte actif : tant que le compte existe. Un compte inactif pourra être supprimé après une période d'inactivité (objectif : 2 ans, recommandation CNIL).
• Sessions : supprimées à l'expiration ou après révocation.
• QR / nonces : supprimés après expiration (quelques minutes).
• Suppression de compte : l'email et les informations identifiantes sont effacés/anonymisés ; l'historique de points peut être conservé de façon anonymisée à des fins de preuve et de prévention de la fraude.

Vos droits
Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. La suppression de votre compte (écran « Mon compte ») efface vos données identifiantes. Pour exercer un droit ou poser une question : ${PUBLISHER.contactEmail}. Vous pouvez saisir la CNIL (www.cnil.fr) en cas de litige.

Cookies et traceurs
Nous utilisons uniquement des cookies strictement nécessaires à l'authentification (fp_rt, fp_sid), exemptés de consentement. Une préférence d'affichage (thème) est stockée localement dans votre navigateur. Aucun cookie publicitaire ni de mesure d'audience n'est déposé.`,
  },

  terms: {
    key: 'terms',
    title: "Conditions générales d'utilisation",
    updated: UPDATED,
    body: `En utilisant Fidelity Plus, vous acceptez les présentes conditions.

Objet
Fidelity Plus permet aux clients de cumuler des points de fidélité chez des commerçants partenaires via un QR code, et aux commerçants de gérer leur programme de fidélité.

Comptes et sécurité
La connexion se fait au moyen d'un code personnel. Gardez ce code confidentiel : il permet d'accéder à votre compte. Vous êtes responsable des actions réalisées depuis votre compte. En cas de perte du code sans email associé, la récupération n'est pas garantie.

Partenaires
Les comptes professionnels sont validés par l'éditeur avant de pouvoir scanner et apparaître dans l'annuaire. Le commerçant est responsable des informations qu'il publie et des récompenses qu'il propose.

Utilisation acceptable
Il est interdit de tenter de fausser le cumul de points, d'usurper un compte, de perturber le service ou d'y accéder de manière automatisée non autorisée.

Disponibilité et responsabilité
Le service est fourni « en l'état », sans garantie de disponibilité continue. L'éditeur ne saurait être tenu responsable des interruptions, pertes de points dues à une mauvaise utilisation, ou des engagements pris par un commerçant envers ses clients.

Modification
Les présentes conditions et les règles du programme peuvent évoluer. Les modifications significatives seront signalées dans l'application.

Contact : ${PUBLISHER.contactEmail}.`,
  },

  program: {
    key: 'program',
    title: 'Règlement du programme de fidélité',
    updated: UPDATED,
    body: `Fonctionnement
• Chaque passage validé chez un commerçant partenaire (scan du QR du client) ajoute 1 point sur la carte du client, propre à ce commerçant.
• Le QR du client est temporaire (60 secondes) et à usage unique, pour éviter la fraude.
• Chaque commerçant fixe le seuil de points et le type de récompense (par ex. prestation offerte ou réduction).

Récompenses
• Lorsque le solde atteint le seuil fixé par le commerçant, la récompense devient disponible.
• La récompense est utilisée en présence du client : le commerçant scanne le QR du client en mode « récompense ». Le nombre de points correspondant au seuil est alors retiré ; le surplus est conservé.

Règles
• Les points n'ont aucune valeur monétaire et ne sont ni échangeables ni remboursables.
• Les points sont valables chez le commerçant émetteur uniquement.
• Un commerçant peut faire évoluer le seuil ou le type de récompense ; les changements s'appliquent à compter de leur mise à jour.
• L'éditeur peut suspendre un compte en cas d'abus avéré.

Contact : ${PUBLISHER.contactEmail}.`,
  },
};
