import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handler } from "../_shared/handler.ts";
const split = (name: string) =>
  (Deno.env.get(name) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  handler(
    {
      origins: split("ALLOWED_ORIGINS"),
      hostnames: split("TURNSTILE_HOSTNAMES"),
      turnstileSecret: Deno.env.get("TURNSTILE_SECRET_KEY") || "",
      rateSecret: Deno.env.get("RATE_LIMIT_SECRET") || "",
    },
    async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  ),
);
