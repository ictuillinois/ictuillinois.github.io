// send-emails — drains email_notifications_queue via Resend.
//
// Deploy: paste this into a new Edge Function named "send-emails" in the
// Supabase dashboard (replace the default template), then Deploy.
//
// Required secrets (Edge Functions → Manage secrets):
//   RESEND_API_KEY   your NEW Resend key (never the leaked one)
//   RESEND_FROM      verified sender, e.g.  LabHive <noreply@labhive.app>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Invoked every minute by a Supabase Cron job (see email_queue_setup.sql).
//
// TEST MODE: run this SQL to redirect ALL emails to one address:
//   INSERT INTO settings (key,value) VALUES ('test_email_override','you@example.com')
//   ON CONFLICT (key) DO UPDATE SET value = 'you@example.com';
// To disable test mode and restore per-user delivery:
//   DELETE FROM settings WHERE key = 'test_email_override';

import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "ICT-Lab <noreply@ictlab.app>";
const BATCH = 50;        // max emails per run
const MAX_ATTEMPTS = 5;  // give up after this many failures per row

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role → bypasses RLS
);

Deno.serve(async () => {
  // Check for test-mode override — one DB call at the top of each run.
  const { data: overrideSetting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "test_email_override")
    .maybeSingle();
  const testOverride: string | null = overrideSetting?.value?.trim() || null;

  const { data: rows, error } = await supabase
    .from("email_notifications_queue")
    .select("*")
    .eq("sent", false)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0, failed = 0;
  for (const row of rows ?? []) {
    try {
      if (!row.to_email) throw new Error("missing to_email");

      // In test mode all emails go to the override address.
      const recipient = testOverride ?? row.to_email;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [recipient],
          subject: row.subject ?? "(no subject)",
          html: row.html_body || undefined,
          text: row.body || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      await supabase
        .from("email_notifications_queue")
        .update({ sent: true, sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      failed++;
      await supabase
        .from("email_notifications_queue")
        .update({
          attempts: (row.attempts ?? 0) + 1,
          error: String(e).slice(0, 500),
        })
        .eq("id", row.id);
    }
  }

  return new Response(
    JSON.stringify({
      processed: rows?.length ?? 0,
      sent,
      failed,
      testMode: !!testOverride,
      overrideTo: testOverride ?? null,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
