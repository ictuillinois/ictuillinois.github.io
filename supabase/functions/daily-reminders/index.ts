// daily-reminders — sends task reminders on a schedule, whether or not anyone
// has the app open.
//
// Deploy: paste into a new Edge Function named "daily-reminders" in the
// Supabase dashboard, then Deploy. Schedule it with daily_reminders_setup.sql.
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
// Optional secrets:
//   REMINDER_TZ    IANA zone deciding when "morning" is. Default America/Chicago.
//   REMINDER_HOUR  local hour to send at, 0-23. Default 7.
//
// The cron calls this EVERY HOUR and the function decides whether it is the
// right local hour. That is what makes daylight saving a non-event: a fixed
// UTC schedule would drift an hour twice a year, and 6am reminders are how you
// teach people to ignore reminders.
//
// Sends are claimed in reminder_sends before the notification is written. The
// unique index makes the claim atomic, so an overlapping run — or the browser
// doing the same check — loses the race instead of sending a duplicate.

import { createClient } from "jsr:@supabase/supabase-js@2";

const TZ = Deno.env.get("REMINDER_TZ") ?? "America/Chicago";
const HOUR = Number(Deno.env.get("REMINDER_HOUR") ?? "7");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role → bypasses RLS
);

// Local date and hour in TZ. Intl is the only thing here that knows about DST;
// doing this with offsets by hand is how these jobs end up an hour out in March.
function localNow(): { date: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Returns true if THIS run owns the send. A 23505 means someone else already
// claimed it; any other error is logged and treated as "do not send", because
// sending without a record is what produces daily duplicates forever.
async function claim(userId: string, kind: string, refId: string | null, sentFor: string, orgId: string | null) {
  const { error } = await supabase.from("reminder_sends")
    .insert({ user_id: userId, kind, ref_id: refId, sent_for: sentFor, organization_id: orgId });
  if (!error) return true;
  if (error.code !== "23505") console.error("[daily-reminders] claim failed:", error.message);
  return false;
}

async function notify(userId: string, type: string, title: string, body: string, taskId: string | null) {
  const { data: prefs } = await supabase.from("notification_prefs")
    .select("*").eq("user_id", userId).maybeSingle();

  // "not false" so a user who never opened the notifications panel — and so
  // has no prefs row — is still notified.
  if (!prefs || prefs[type] !== false) {
    const { error } = await supabase.from("notifications")
      .insert({ user_id: userId, type, title, body, task_id: taskId, read: false });
    if (error) console.error("[daily-reminders] notification insert failed:", error.message);
  }

  if (!prefs || prefs[`email_${type}`] !== true) return;
  const to = await addressFor(userId);
  if (!to) return;
  const { error } = await supabase.from("email_notifications_queue").insert({
    to_email: to, subject: title, body, user_id: userId, type,
    html_body: emailHtml(title, body),
  });
  if (error) console.error("[daily-reminders] email queue failed:", error.message);
}

// A solo user's id is a solo_users row, not a users row, so looking only in
// `users` finds nothing and silently sends them no email. The solo lookup is
// wrapped because ICT-Lab has no solo_users table at all — there the query
// errors, and an error here must mean "no address", not a dead run.
async function addressFor(userId: string): Promise<string | null> {
  const { data: u } = await supabase.from("users")
    .select("email, phone").eq("id", userId).maybeSingle();
  if (u?.phone || u?.email) return u.phone || u.email;
  try {
    const { data: s } = await supabase.from("solo_users")
      .select("email").eq("id", userId).maybeSingle();
    return s?.email ?? null;
  } catch { return null; }
}

function emailHtml(title: string, body: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a">
  <div style="font-size:18px;font-weight:700;margin-bottom:12px">${escapeHtml(title)}</div>
  <div style="font-size:15px;line-height:1.6;color:#444;margin-bottom:24px">${escapeHtml(body)}</div>
  <a href="https://ictlab.app/?screen=pm" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">View Task in ICT-Lab →</a>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888">
    You are receiving this because daily task reminders are on.
    <a href="https://ictlab.app/?screen=profile" style="color:#888">Change your notification settings</a>.
  </div>
</div>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req) => {
  const { date: today, hour } = localNow();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";  // for testing off-hour

  if (hour !== HOUR && !force) {
    return Response.json({ skipped: true, reason: `local hour ${hour} != ${HOUR}`, tz: TZ });
  }

  const tomorrow = addDays(today, 1);
  let daily = 0, deadline = 0;

  // --- daily reminders: tasks the user asked to be reminded about ---
  const { data: tasks, error } = await supabase.from("tasks")
    .select("id, title, deadline, status, assigned_to, created_by, organization_id")
    .eq("remind_daily", true).neq("status", "done");
  if (error) {
    console.error("[daily-reminders] task load failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // A task reminds whoever it is assigned to AND whoever created it — a task
  // you made for yourself is never "assigned", and was getting nothing.
  const perUser = new Map<string, { titles: string[]; due: number; over: number; orgId: string | null; firstId: string }>();
  for (const t of tasks ?? []) {
    for (const uid of new Set([t.assigned_to, t.created_by].filter(Boolean) as string[])) {
      const e = perUser.get(uid) ?? { titles: [], due: 0, over: 0, orgId: t.organization_id ?? null, firstId: t.id };
      e.titles.push(t.title);
      if (t.deadline === today) e.due++;
      else if (t.deadline && t.deadline < today) e.over++;
      perUser.set(uid, e);
    }
  }

  for (const [uid, e] of perUser) {
    if (!(await claim(uid, "daily_tasks", null, today, e.orgId))) continue;
    const bits: string[] = [];
    if (e.due) bits.push(`${e.due} due today`);
    if (e.over) bits.push(`${e.over} overdue`);
    const title = e.titles.length === 1
      ? `Daily reminder: ${e.titles[0]}`
      : `Daily reminder: ${e.titles.length} tasks`;
    const body = (bits.length ? bits.join(" · ") + " — " : "")
      + e.titles.slice(0, 4).join(", ")
      + (e.titles.length > 4 ? `, +${e.titles.length - 4} more` : "");
    await notify(uid, "reminder_daily", title, body, e.titles.length === 1 ? e.firstId : null);
    daily++;
  }

  // --- due tomorrow ---
  const { data: soon } = await supabase.from("tasks")
    .select("id, title, assigned_to, created_by, organization_id")
    .eq("deadline", tomorrow).neq("status", "done");
  for (const t of soon ?? []) {
    for (const uid of new Set([t.assigned_to, t.created_by].filter(Boolean) as string[])) {
      if (!(await claim(uid, "deadline_tomorrow", t.id, today, t.organization_id ?? null))) continue;
      await notify(uid, "deadline_reminder", "⏰ Task due tomorrow", `"${t.title}" is due tomorrow`, t.id);
      deadline++;
    }
  }

  return Response.json({ ok: true, tz: TZ, today, daily, deadline });
});
