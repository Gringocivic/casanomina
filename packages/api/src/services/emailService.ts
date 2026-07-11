/**
 * services/emailService.ts
 *
 * Thin wrapper around Resend for transactional emails.
 * When RESEND_API_KEY is not set the functions log and return — no crash.
 */

let resendClient: any = null;

async function getClient() {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const { Resend } = await import("resend");
  resendClient = new Resend(key);
  return resendClient;
}

function fromAddress(): string {
  // EMAIL_FROM is the documented var name (.env.example); RESEND_FROM_EMAIL
  // is kept as a fallback for compatibility with existing docker-compose.yml config.
  return process.env.EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

// ── Templates ─────────────────────────────────────────────────────────────────

function inviteEmailHtml(opts: {
  workerName: string;
  employerName: string | null;
  claimUrl: string;
  lang: "en" | "es";
}): { subject: string; html: string } {
  const { workerName, employerName, claimUrl, lang } = opts;
  const employer = employerName ?? (lang === "en" ? "your employer" : "tu empleador");

  if (lang === "es") {
    return {
      subject: `${employer} te ha invitado a CasaNomina`,
      html: `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background:#C4572A;padding:24px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">CasaNomina</p>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Cumplimiento de nómina doméstica</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Hola, ${workerName} 👋</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
            <strong>${employer}</strong> te ha invitado a CasaNomina para que puedas consultar tus recibos de nómina, descargar tu contrato y conocer tus derechos laborales.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="${claimUrl}" style="display:inline-block;background:#C4572A;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;">
              Aceptar invitación →
            </a>
          </td></tr></table>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">O copia este enlace en tu navegador:</p>
          <p style="margin:0;font-size:12px;color:#C4572A;word-break:break-all;">${claimUrl}</p>
        </td></tr>
        <!-- What you can do -->
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Qué puedes hacer</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;overflow:hidden;">
            ${[
              ["📄", "Ver y descargar tus recibos de nómina"],
              ["📋", "Descargar tu contrato de trabajo"],
              ["⚖️", "Consultar tus derechos laborales"],
            ].map(([icon, text]) => `<tr><td style="padding:10px 16px;border-bottom:1px solid #dcfce7;font-size:13px;color:#166534;">${icon}&nbsp; ${text}</td></tr>`).join("")}
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            CasaNomina · Software libre para el cumplimiento de nómina doméstica en México<br>
            Si no esperabas este correo, puedes ignorarlo.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    };
  }

  return {
    subject: `${employer} has invited you to CasaNomina`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="background:#C4572A;padding:24px 32px;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">CasaNomina</p>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Household Payroll Compliance</p>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Hi, ${workerName} 👋</p>
          <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
            <strong>${employer}</strong> has invited you to CasaNomina so you can view your payslips, download your contract, and learn about your labor rights.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
            <a href="${claimUrl}" style="display:inline-block;background:#C4572A;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;">
              Accept Invitation →
            </a>
          </td></tr></table>
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;color:#C4572A;word-break:break-all;">${claimUrl}</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">What you can do</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;overflow:hidden;">
            ${[
              ["📄", "View and download your payslips"],
              ["📋", "Download your employment contract"],
              ["⚖️", "Check your labor rights"],
            ].map(([icon, text]) => `<tr><td style="padding:10px 16px;border-bottom:1px solid #dcfce7;font-size:13px;color:#166534;">${icon}&nbsp; ${text}</td></tr>`).join("")}
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            CasaNomina · Open source household payroll compliance for Mexico<br>
            If you did not expect this email you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Sends a worker invite email if the contact is an email address and
 * RESEND_API_KEY is configured. Non-fatal — logs on failure.
 */
export async function sendInviteEmail(opts: {
  to: string;
  workerName: string;
  employerName: string | null;
  claimUrl: string;
  log: { info: (obj: any, msg?: string) => void; warn: (obj: any, msg?: string) => void };
}): Promise<void> {
  const { to, workerName, employerName, claimUrl, log } = opts;

  // Only send to email addresses (skip phone numbers)
  if (!to.includes("@")) {
    log.info({ to }, "Invite contact is not an email — skipping email send");
    return;
  }

  const client = await getClient();
  if (!client) {
    log.info({}, "RESEND_API_KEY not set — skipping invite email (set it to enable email delivery)");
    return;
  }

  // Detect language preference from the app — default to Spanish for Mexico
  const { subject, html } = inviteEmailHtml({ workerName, employerName, claimUrl, lang: "es" });

  try {
    const result = await client.emails.send({
      from: fromAddress(),
      to: [to],
      subject,
      html,
    });
    log.info({ id: result?.data?.id, to }, "Invite email sent");
  } catch (err) {
    // Non-fatal — the invite link is still accessible via QR code
    log.warn({ err, to }, "Failed to send invite email — non-fatal");
  }
}
