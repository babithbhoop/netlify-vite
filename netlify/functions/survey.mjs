// Netlify serverless function: receives anonymous survey responses, sends email via Resend

export default async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Read env vars at invocation time (not module scope) so they pick up Netlify env config
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  const RECIPIENT_EMAIL = process.env.SURVEY_RECIPIENT_EMAIL || "";

  if (!RESEND_API_KEY || !RECIPIENT_EMAIL) {
    return new Response(JSON.stringify({ error: "Email service not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const body = await req.json();
    const { role, sector, motivation, referral, freeText, userAgent, referrer, timestamp } = body;

    if (!role || !sector || !motivation || !referral) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Sanitize inputs (strip HTML tags)
    const clean = (s) => (s || "").replace(/<[^>]*>/g, "").slice(0, 500);

    const dateStr = new Date(timestamp || Date.now()).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });

    const emailHtml = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);padding:20px;border-radius:12px 12px 0 0;">
          <h2 style="color:white;margin:0;font-size:18px;">AI Ethics Masterclass &mdash; Survey Response</h2>
          <p style="color:#c4b5fd;margin:4px 0 0;font-size:13px;">${dateStr}</p>
        </div>
        <div style="background:#0f172a;padding:20px;color:#e2e8f0;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0;color:#94a3b8;font-weight:600;width:120px;">Role</td>
              <td style="padding:10px 0;color:#f1f5f9;">${clean(role)}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0;color:#94a3b8;font-weight:600;">Sector</td>
              <td style="padding:10px 0;color:#f1f5f9;">${clean(sector)}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0;color:#94a3b8;font-weight:600;">Motivation</td>
              <td style="padding:10px 0;color:#f1f5f9;">${clean(motivation)}</td>
            </tr>
            <tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0;color:#94a3b8;font-weight:600;">Found via</td>
              <td style="padding:10px 0;color:#f1f5f9;">${clean(referral)}</td>
            </tr>
            ${freeText ? `<tr style="border-bottom:1px solid #1e293b;">
              <td style="padding:10px 0;color:#94a3b8;font-weight:600;">Additional</td>
              <td style="padding:10px 0;color:#f1f5f9;">${clean(freeText)}</td>
            </tr>` : ""}
          </table>
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1e293b;font-size:11px;color:#64748b;">
            <p style="margin:2px 0;"><strong>User Agent:</strong> ${clean(userAgent)}</p>
            <p style="margin:2px 0;"><strong>Referrer:</strong> ${clean(referrer) || "Direct"}</p>
          </div>
        </div>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Ethics Survey <onboarding@resend.dev>",
        to: [RECIPIENT_EMAIL],
        subject: `Survey: ${clean(role)} | ${clean(sector)} | ${new Date(timestamp || Date.now()).toLocaleDateString()}`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("Survey error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
};
