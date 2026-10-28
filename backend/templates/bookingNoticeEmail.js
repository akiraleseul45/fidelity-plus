/**
 * Short HTML email about a reservation event (new booking for the pro,
 * cancellation by the client or by the shop). Same look as the confirmation.
 */
function bookingNoticeTemplate({ title, subtitle, intro, rows = [], footer }) {
  const row = ([label, value]) =>
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
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1220;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F6F9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#1E90FF;padding:32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:800;">${escapeHtml(title)}</h1>
              <p style="margin:8px 0 0;color:#FFFFFF;opacity:0.95;font-size:15px;">${escapeHtml(subtitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${rows.map(row).join('')}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#FAFBFC;border-top:1px solid #E6E9EF;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8B95A3;line-height:1.6;">
                ${escapeHtml(footer || 'Retrouve tes réservations dans ton espace Fidelity Plus.')}<br />
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

module.exports = { bookingNoticeTemplate };
