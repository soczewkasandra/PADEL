import { it, expect, vi } from "vitest";
import {
  handler,
  digest,
  type Rpc,
} from "../supabase/functions/_shared/handler";
const config = {
  origins: ["http://localhost:5173"],
  hostnames: ["localhost"],
  turnstileSecret: "fake-test-secret",
  rateSecret: "f".repeat(32),
};
const payload = {
  action: "book",
  slotId: "11111111-1111-4111-8111-111111111111",
  first: "Alex",
  last: "Test",
  phone: "000 000 000",
  captcha: "test-captcha",
  website: "",
};
const request = (body: unknown = payload, origin = "http://localhost:5173") =>
  new Request("http://edge.test", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
function fixture(
  options: {
    captcha?: unknown;
    error?: { code?: string; message?: string };
    limited?: boolean;
    status?: unknown;
  } = {},
) {
  const rpc = vi.fn<Rpc>(async (name) => ({
    data:
      name === "consume_rate_limit"
        ? !options.limited
        : name === "booking_status"
          ? (options.status ?? [])
          : "booking-id",
    error: name === "create_booking" ? (options.error ?? null) : null,
  }));
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json(
      options.captcha ?? {
        success: true,
        hostname: "localhost",
        action: "padel_booking",
      },
    ),
  );
  return { rpc, fetcher, run: handler(config, rpc, fetcher) };
}
it("tworzy oczekujące zgłoszenie, generuje 256-bitowy link i zapisuje jedynie jego hash", async () => {
  const f = fixture();
  const response = await f.run(request());
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.status).toBe("pending");
  expect(body.token).toMatch(/^[a-f0-9]{64}$/);
  expect(f.rpc).toHaveBeenCalledWith(
    "create_booking",
    expect.objectContaining({
      p_phone: "000000000",
      p_token_hash: await digest(body.token),
    }),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("odrzuca żądania spoza dozwolonych domen", async () => {
  const f = fixture();
  expect((await f.run(request(payload, "https://evil.test"))).status).toBe(403);
  expect(f.rpc).not.toHaveBeenCalled();
});
it.each([
  { success: false },
  { success: true, hostname: "evil.test", action: "padel_booking" },
  { success: true, hostname: "localhost", action: "other" },
])("nie zapisuje bez poprawnej CAPTCHA: %j", async (captcha) => {
  const f = fixture({ captcha });
  expect((await f.run(request())).status).toBe(400);
  expect(f.rpc.mock.calls.some(([name]) => name === "create_booking")).toBe(
    false,
  );
});
it("nie omija CAPTCHA przy braku konfiguracji serwera", async () => {
  const f = fixture();
  expect(
    (await handler({ ...config, turnstileSecret: "" }, f.rpc)(request()))
      .status,
  ).toBe(503);
});
it("blokuje globalny spam przed wywołaniem CAPTCHA", async () => {
  const f = fixture({ limited: true });
  expect((await f.run(request())).status).toBe(429);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it("blokuje dzienny spam na telefon po CAPTCHA", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async (name, args) => ({
    data: name === "consume_rate_limit" ? args.p_kind !== "phone-book" : null,
    error: null,
  }));
  expect((await f.run(request())).status).toBe(429);
  expect(f.rpc.mock.calls.some(([name]) => name === "create_booking")).toBe(
    false,
  );
});
it("nie działa przy awarii przechowywania limitów", async () => {
  const f = fixture();
  f.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
  expect((await f.run(request())).status).toBe(503);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it("zwraca konflikt przy równoczesnej rezerwacji bez ujawniania danych", async () => {
  const f = fixture({ error: { code: "23505", message: "private details" } });
  const r = await f.run(request());
  expect(r.status).toBe(409);
  expect(await r.text()).not.toContain("private details");
});
it.each([
  { ...payload, phone: "abc" },
  { ...payload, first: " " },
  { ...payload, website: "spam" },
  { ...payload, captcha: "" },
])("odrzuca błędny formularz", async (body) => {
  const f = fixture();
  expect((await f.run(request(body))).status).toBe(400);
  expect(f.fetcher).not.toHaveBeenCalled();
});
it("ogranicza rozmiar danych", async () => {
  const f = fixture();
  expect(
    (await f.run(request({ ...payload, first: "x".repeat(9000) }))).status,
  ).toBe(413);
});
it("status przez token nie wymaga logowania i nie zwraca danych osobowych", async () => {
  const f = fixture({
    status: [
      {
        status: "approved",
        starts_at: "2027-01-01T10:00Z",
        ends_at: "2027-01-01T11:00Z",
      },
    ],
  });
  const r = await f.run(request({ action: "status", token: "a".repeat(64) }));
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    booking: {
      status: "approved",
      starts_at: "2027-01-01T10:00Z",
      ends_at: "2027-01-01T11:00Z",
    },
  });
  expect(f.fetcher).not.toHaveBeenCalled();
});
it("błędny token nie ujawnia istnienia rezerwacji", async () => {
  const f = fixture();
  expect(
    (await f.run(request({ action: "status", token: "bad" }))).status,
  ).toBe(404);
  expect(
    (await f.run(request({ action: "status", token: "a".repeat(64) }))).status,
  ).toBe(404);
});
