/**
 * HTML email sent to a CLIENT who requested recovery of their login code.
 * The old code has been invalidated and replaced by the one below.
 */
function clientRecoveryTemplate({ pseudonym, code }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ton nouveau code Fidelity Plus</title>
</head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1220;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F6F9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#1E90FF;padding:36px 32px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:32px;font-weight:800;letter-spacing:-0.5px;">Fidelity Plus</h1>
              <p style="margin:8px 0 0;color:#FFFFFF;opacity:0.95;font-size:15px;">Récupération de ton code</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 24px;">
              <h2 style="margin:0 0 12px;font-size:22px;color:#0B1220;">Bonjour ${escapeHtml(pseudonym || '')}</h2>
              <p style="margin:0 0 16px;color:#5B6472;font-size:15px;line-height:1.6;">
                Tu as demandé à récupérer l'accès à ton compte. Voici ton <strong>nouveau</strong> code de connexion. Ton ancien code ne fonctionne plus.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;padding:24px 36px;background:#FFB02E;border-radius:16px;">
                      <p style="margin:0 0 4px;font-size:11px;color:#0B1220;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;opacity:0.7;">Ton nouveau code</p>
                      <p style="margin:0;font-size:32px;color:#0B1220;font-weight:800;font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:6px;">${escapeHtml(code)}</p>
                    </div>
                  </td>
                </tr>
              </table>
              <div style="margin-top:24px;padding:16px;background:#EAF4FF;border-radius:12px;">
                <p style="margin:0;font-size:13px;color:#0B4A8C;line-height:1.5;">
                  <strong>🔒 Garde ce code confidentiel.</strong> Si tu n'es pas à l'origine de cette demande, change‑le à nouveau depuis l'application.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#FAFBFC;border-top:1px solid #E6E9EF;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8B95A3;line-height:1.6;">Fidelity Plus &middot; ${new Date().getFullYear()}</p>
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

module.exports = { clientRecoveryTemplate };
