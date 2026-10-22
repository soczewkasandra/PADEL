export type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;
export type Config = {
  origins: string[];
  hostnames: string[];
  turnstileSecret: string;
  rateSecret: string;
};
const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
export const digest = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function bucket(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}
export function handler(
  config: Config,
  rpc: Rpc,
  fetcher: typeof fetch = fetch,
) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Referrer-Policy": "no-referrer",
    };
    if (config.origins.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    const reply = (status: number, message: unknown) =>
      new Response(JSON.stringify(message), { status, headers });
    if (
      !config.origins.length ||
      !config.hostnames.length ||
      !config.turnstileSecret ||
      config.rateSecret.length < 32
    )
      return reply(503, { error: "Konfiguracja serwera jest niekompletna." });
    if (!config.origins.includes(origin))
      return reply(403, { error: "Niedozwolone źródło żądania." });
    if (req.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "Access-Control-Allow-Headers":
            "content-type,apikey,authorization,x-client-info",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    if (req.method !== "POST") return reply(405, { error: "Użyj POST." });
    if (!req.headers.get("content-type")?.includes("application/json"))
      return reply(415, { error: "Wymagany JSON." });
    try {
      // Bound streaming reads too; Content-Length alone is not reliable.
      const reader = req.body?.getReader();
      if (!reader) return reply(400, { error: "Brak danych." });
      let length = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 8192) {
          await reader.cancel();
          return reply(413, { error: "Za dużo danych." });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.length;
      }
      let body;
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return reply(400, { error: "Niepoprawne dane." });
      }
      if (!body || typeof body !== "object")
        return reply(400, { error: "Niepoprawne dane." });
      const action = body.action;
      if (action !== "book" && action !== "status")
        return reply(400, { error: "Nieznana operacja." });
      async function limit(value: string, kind: string) {
        const r = await rpc("consume_rate_limit", {
          p_bucket: await bucket(config.rateSecret, value),
          p_kind: kind,
        });
        if (r.error) throw new Error("RATE_STORAGE");
        return r.data === true;
      }
      // Global budget is authoritative and cannot be bypassed by spoofed IP headers.
      if (
        !(await limit(
          "all",
          action === "book" ? "global-book" : "global-status",
        ))
      )
        return reply(429, {
          error: "Za dużo prób. Spróbuj ponownie za 10 minut.",
        });
      if (action === "status") {
        if (
          typeof body.token !== "string" ||
          !/^([a-f0-9]{64})$/.test(body.token)
        )
          return reply(404, {
            error: "Nie znaleziono rezerwacji lub link wygasł.",
          });
        const r = await rpc("booking_status", {
          p_token_hash: await digest(body.token),
        });
        if (r.error) throw new Error("STATUS");
        const rows = r.data as {
          status: string;
          starts_at: string;
          ends_at: string;
        }[];
        if (!rows?.length)
          return reply(404, {
            error: "Nie znaleziono rezerwacji lub link wygasł.",
          });
        return reply(200, { booking: rows[0] });
      }
      const { slotId, first, last, phone, captcha, website } = body;
      if (website)
        return reply(400, { error: "Nie można przyjąć formularza." });
      const normalized =
        typeof phone === "string" ? phone.replace(/[\s()-]/g, "") : "";
      if (
        typeof slotId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(slotId) ||
        typeof first !== "string" ||
        !first.trim() ||
        first.trim().length > 60 ||
        typeof last !== "string" ||
        !last.trim() ||
        last.trim().length > 80 ||
        !/^\+?[0-9]{9,15}$/.test(normalized) ||
        typeof captcha !== "string" ||
        !captcha ||
        captcha.length > 2048
      )
        return reply(400, {
          error: "Uzupełnij dane i weryfikację antyspamową.",
        });
      const verification = await fetcher(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: new URLSearchParams({
            secret: config.turnstileSecret,
            response: captcha,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!verification.ok)
        return reply(503, {
          error: "Weryfikacja antyspamowa jest niedostępna. Spróbuj później.",
        });
      const verified = await verification.json();
      if (
        verified.success !== true ||
        verified.action !== "padel_booking" ||
        !config.hostnames.includes(verified.hostname)
      )
        return reply(400, { error: "Ponów weryfikację antyspamową." });
      if (!(await limit(normalized.replace(/^\+/, ""), "phone-book")))
        return reply(429, {
          error: "Osiągnięto dzienny limit zgłoszeń dla tego numeru.",
        });
      const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
      const r = await rpc("create_booking", {
        p_slot: slotId,
        p_first: first.trim(),
        p_last: last.trim(),
        p_phone: normalized,
        p_token_hash: await digest(token),
      });
      if (r.error) {
        if (
          r.error.code === "23505" ||
          r.error.message?.includes("SLOT_UNAVAILABLE")
        )
          return reply(409, {
            error: "Ten termin nie jest już dostępny. Wybierz inny.",
          });
        throw new Error("BOOKING");
      }
      return reply(201, { token, status: "pending" });
    } catch {
      return reply(503, {
        error:
          "Nie udało się wykonać operacji. Spróbuj ponownie później. Jeśli wysłano zgłoszenie, sprawdź dostępność przed kolejną próbą.",
      });
    }
  };
}
