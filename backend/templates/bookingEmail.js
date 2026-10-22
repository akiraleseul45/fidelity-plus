/**
 * HTML email confirming a reservation. No payment is involved — any price is
 * shown as informative only.
 */
function bookingConfirmationTemplate({
  reference,
  companyName,
  serviceName,
  dateLabel,
  timeLabel,
  partySize,
  address,
  phone,
  priceLabel,
  modeLabel,
}) {
  const row = (label, value) =>
    value
      ? `<tr>
          <td style="padding:6px 0;font-size:13px;color:#8B95A3;width:150px;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-size:15px;color:#0B1220;font-weight:600;">${escapeHtml(value)}</td>
        </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmation de réservation</title>
</head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1220;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F6F9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#1E90FF;padding:36px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Réservation confirmée ✅</h1>
              <p style="margin:8px 0 0;color:#FFFFFF;opacity:0.95;font-size:15px;">${escapeHtml(companyName)}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;padding:14px 28px;background:#FFB02E;border-radius:12px;">
                      <p style="margin:0 0 2px;font-size:10px;color:#0B1220;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;opacity:0.7;">Référence</p>
                      <p style="margin:0;font-size:26px;color:#0B1220;font-weight:800;font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:3px;">${escapeHtml(reference)}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 0;">
                ${row('Prestation', serviceName)}
                ${row(modeLabel === 'table' ? 'Service' : 'Rendez-vous', dateLabel)}
                ${row('Heure', timeLabel)}
                ${row(modeLabel === 'table' ? 'Couverts' : 'Personnes', partySize ? String(partySize) : '')}
                ${row('Adresse', address)}
                ${row('Téléphone', phone)}
                ${row('Tarif (informatif)', priceLabel)}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 28px;">
              <div style="margin-top:12px;padding:14px;background:#EAF4FF;border-radius:12px;">
                <p style="margin:0;font-size:13px;color:#0B4A8C;line-height:1.5;">
                  Garde cette référence. Pour modifier ou annuler, connecte-toi à ton compte Fidelity Plus
                  ou contacte directement l'établissement. Aucun paiement n'est demandé en ligne.
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px;background:#FAFBFC;border-top:1px solid #E6E9EF;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8B95A3;line-height:1.6;">
                Tu n'es pas à l'origine de cette réservation ? Ignore cet email.<br />
                Fidelity Plus &middot; ${new Date().getFullYear()}
              </p>
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

module.exports = { bookingConfirmationTemplate };
