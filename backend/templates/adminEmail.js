/**
 * HTML email template sent to the admin (us) when a pro signs up.
 */
function adminEmailTemplate({
  ownerName,
  companyName,
  address,
  email,
  phoneFixed,
  phoneMobile,
  imageUrl,
  createdAt,
}) {
  const date = new Date(createdAt).toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const row = (label, value, monospace = false) => `
    <tr>
      <td style="padding:14px 18px;background:#FAFBFC;border-bottom:1px solid #E6E9EF;font-size:12px;color:#5B6472;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">${label}</td>
      <td style="padding:14px 18px;background:#FAFBFC;border-bottom:1px solid #E6E9EF;font-size:14px;color:#0B1220;font-weight:600;${monospace ? "font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:2px;" : ''}">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouvelle demande pro</title>
</head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1220;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F6F9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#1E90FF;padding:28px 32px;">
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:800;letter-spacing:-0.3px;">Fidelity Plus</h1>
              <p style="margin:6px 0 0;color:#FFFFFF;opacity:0.9;font-size:14px;">Nouvelle demande professionnelle</p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0B1220;">Un nouveau professionnel s'est inscrit</h2>
              <p style="margin:0 0 24px;color:#5B6472;font-size:14px;line-height:1.5;">
                Voici les informations transmises via le formulaire d'inscription. Son code de connexion lui a été envoyé directement et par sécurité n'est pas repris ici. Valide ou refuse ce partenaire depuis l'outil d'administration.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E6E9EF;border-radius:12px;overflow:hidden;">
                ${row('Nom du domaine', escapeHtml(ownerName))}
                ${row("Nom de l'entreprise", escapeHtml(companyName))}
                ${row('Adresse', escapeHtml(address))}
                ${row('Email', `<a href="mailto:${escapeHtml(email)}" style="color:#1E90FF;text-decoration:none;">${escapeHtml(email)}</a>`)}
                ${phoneFixed ? row('Téléphone fixe', escapeHtml(phoneFixed)) : ''}
                ${phoneMobile ? row('Téléphone mobile', escapeHtml(phoneMobile)) : ''}
                ${imageUrl ? row('Image vitrine', `<a href="${escapeHtml(imageUrl)}" style="color:#1E90FF;text-decoration:none;">Voir l'image</a>`) : ''}
                ${row('Date de la demande', escapeHtml(date))}
              </table>

              ${
                imageUrl
                  ? `<div style="margin-top:20px;text-align:center;">
                      <img src="${escapeHtml(imageUrl)}" alt="Vitrine" style="max-width:100%;height:auto;border-radius:12px;border:1px solid #E6E9EF;" />
                    </div>`
                  : ''
              }

              <div style="margin-top:24px;padding:14px 16px;background:#FFF8E6;border-left:3px solid #FFB02E;border-radius:8px;">
                <p style="margin:0;font-size:13px;color:#7A5A00;line-height:1.5;">
                  <strong>Action requise :</strong> Vérifie l'identité du professionnel et l'authenticité de l'adresse avant de valider l'accès.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px;background:#FAFBFC;border-top:1px solid #E6E9EF;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8B95A3;">Fidelity Plus &middot; Notification automatique</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { adminEmailTemplate };
