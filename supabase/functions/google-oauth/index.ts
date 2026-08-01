// google-oauth — server-side Google OAuth token exchange for Google Drive storage.
//
// WHY: Google "Web application" OAuth clients require a client_secret for token
// exchange. A browser app cannot hold a secret without leaking it into the
// public bundle. This function keeps the secret server-side; the browser only
// ever sends the auth `code` + PKCE verifier (or a refresh_token).
//
// Deploy: paste into a new Edge Function named "google-oauth" (dashboard),
// then Deploy. Keep "Verify JWT" ON — the app calls it via sb.functions.invoke,
// which sends the user's session JWT, so only logged-in users can use it.
//
// Required secret (Edge Functions → Secrets):
//   GOOGLE_CLIENT_SECRET   the NEW Google OAuth client secret (never in the app)
// (GOOGLE_CLIENT_ID falls back to the known public client id below.)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CLIENT_ID =
  Deno.env.get("GOOGLE_CLIENT_ID") ??
  "1064001328708-s4663d9m93b2q1vjd8rdp6ee3l9nvb01.apps.googleusercontent.com";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const DEFAULT_REDIRECT = "https://labhive.app/oauth-callback";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    let params: URLSearchParams;

    if (body.action === "exchange") {
      if (!body.code || !body.code_verifier) {
        return json({ error: "missing code or code_verifier" }, 400);
      }
      params = new URLSearchParams({
        code: body.code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: body.redirect_uri || DEFAULT_REDIRECT,
        grant_type: "authorization_code",
        code_verifier: body.code_verifier,
      });
    } else if (body.action === "refresh") {
      if (!body.refresh_token) return json({ error: "missing refresh_token" }, 400);
      params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: body.refresh_token,
        grant_type: "refresh_token",
      });
    } else {
      return json({ error: "invalid action (expected 'exchange' or 'refresh')" }, 400);
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = await res.json();
    return json(data, res.status); // pass Google's response straight through
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
