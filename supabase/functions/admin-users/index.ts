// Supabase Edge Function "admin-users": lets the owner and admins add, edit and remove
// people from the app's Manage page. It runs on Supabase's servers, so the service key
// (needed to create sign-in accounts) never reaches the website.
// Rules (same as the app): the owner manages everyone except the owner; admins manage
// regular users only; only the owner gives or takes the admin role.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Newer Supabase projects provide the admin key as SUPABASE_SECRET_KEYS ({"default":"sb_secret_..."}),
// older ones as SUPABASE_SERVICE_ROLE_KEY. Use whichever is present.
function adminKey(): string | undefined {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || Object.values(keys)[0];
  } catch {
    return undefined;
  }
}
const PERMS = ["qty", "tabs", "summary", "contacts"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  try {
    const key = adminKey();
    if (!key) {
      const names = Object.keys(Deno.env.toObject()).filter((n) => n.startsWith("SUPABASE_"));
      return json(500, { error: "Server key not found. Available: " + names.join(", ") });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return json(401, { error: "Please sign in again." });
    const { data: me } = await admin.from("profiles").select("role").eq("id", who.user.id).single();
    const myRole = me?.role;
    if (myRole !== "owner" && myRole !== "admin")
      return json(403, { error: "Only the owner or an admin can manage users." });
    const canManage = (role: string) => (myRole === "owner" ? role !== "owner" : role === "user");

    const b = await req.json().catch(() => ({}));
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : undefined;
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : undefined;
    const password = typeof b.password === "string" && b.password ? b.password : undefined;
    if (email !== undefined && !EMAIL.test(email)) return json(400, { error: "Enter a valid email address." });
    if (password !== undefined && password.length < 8)
      return json(400, { error: "The password must be at least 8 characters." });
    let perms: Record<string, boolean> | undefined;
    if (b.perms && typeof b.perms === "object") {
      perms = {};
      for (const k of PERMS) perms[k] = !!b.perms[k];
    }

    if (b.action === "create") {
      const role = b.role === "admin" ? "admin" : "user";
      if (!canManage(role)) return json(403, { error: "Only the owner can add admins." });
      if (!email || !password) return json(400, { error: "Email and password are required." });
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) {
        const dup = /already|exists|registered/i.test(error.message);
        return json(dup ? 409 : 400, { error: dup ? "A user with that email already exists." : error.message });
      }
      const id = data.user!.id;
      await admin.from("profiles").upsert({ id, email, name: name || email.split("@")[0], role, perms: perms ?? null });
      return json(200, { id });
    }

    const id = String(b.id || "");
    const { data: target } = await admin.from("profiles").select("id, role, email").eq("id", id).single();
    if (!target) return json(404, { error: "That user no longer exists." });
    if (!canManage(target.role)) return json(403, { error: "You can't change this person." });

    if (b.action === "update") {
      const change: Record<string, unknown> = {};
      if (name !== undefined) change.name = name;
      if (b.role === "admin" || b.role === "user") {
        if (myRole !== "owner" && b.role !== target.role) return json(403, { error: "Only the owner changes roles." });
        change.role = b.role;
      }
      if (email !== undefined || password !== undefined) {
        const { error } = await admin.auth.admin.updateUserById(id, {
          ...(email !== undefined ? { email, email_confirm: true } : {}),
          ...(password !== undefined ? { password } : {}),
        });
        if (error) return json(400, { error: /already|exists/i.test(error.message) ? "A user with that email already exists." : error.message });
        if (email !== undefined) change.email = email;
      }
      if (Object.keys(change).length) {
        const { error } = await admin.from("profiles").update(change).eq("id", id);
        if (error) return json(400, { error: error.message });
      }
      return json(200, { ok: true });
    }

    if (b.action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(id); // profile is removed with it
      if (error) return json(400, { error: error.message });
      return json(200, { ok: true });
    }
    return json(400, { error: "Unknown action." });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) });
  }
});
