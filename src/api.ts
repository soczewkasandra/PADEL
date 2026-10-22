import { createClient } from "@supabase/supabase-js";
import type { Slot, Booking, BookingStatus, Status } from "./model";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!url && !!key && !url.includes("YOUR_PROJECT");
export const supabase = configured
  ? createClient(url, key, {
      auth: { persistSession: false, detectSessionInUrl: false },
    })
  : null;
export const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
function client() {
  if (!supabase) throw new Error("Najpierw skonfiguruj połączenie z Supabase.");
  return supabase;
}
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "23P01")
    throw new Error(
      "Ta godzina nakłada się na istniejący trening. Zachowaj 60 minut odstępu.",
    );
  if (error.message.includes("FORBIDDEN"))
    throw new Error("Brak uprawnień trenera. Zaloguj się ponownie.");
  if (error.message.includes("INVALID_DATE"))
    throw new Error("Wybierz przyszły termin w ciągu 180 dni.");
  if (error.message.includes("SLOT_OCCUPIED"))
    throw new Error(
      "Ten termin ma aktywną rezerwację. Najpierw ją odrzuć lub odwołaj.",
    );
  if (error.message.includes("INVALID_TRANSITION"))
    throw new Error("Status już się zmienił. Odśwież listę rezerwacji.");
  throw new Error(
    "Nie udało się wykonać operacji. Sprawdź połączenie i konfigurację lub odśwież kalendarz.",
  );
}
export async function getSlots(coach = false): Promise<Slot[]> {
  const result = coach
    ? await client()
        .from("slots")
        .select("id,starts_at,ends_at,blocked")
        .order("starts_at")
    : await client().rpc("available_slots");
  check(result.error);
  return (result.data || []).map((s: Slot) => ({
    ...s,
    blocked: s.blocked ?? false,
  }));
}
export async function getBookings(): Promise<Booking[]> {
  const { data, error } = await client()
    .from("bookings")
    .select(
      "id,slot_id,status,created_at,customers(first_name,last_name,phone)",
    )
    .order("created_at", { ascending: false });
  check(error);
  return data as unknown as Booking[];
}
export async function mutate(
  name: "add_slot" | "set_slot_blocked" | "set_booking_status",
  args: Record<string, unknown>,
) {
  const { error } = await client().rpc(name, args);
  check(error);
}
async function publicRequest(body: Record<string, unknown>) {
  const response = await fetch(`${url}/functions/v1/booking`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Usługa jest chwilowo niedostępna.");
  return data;
}
export async function book(body: {
  slotId: string;
  first: string;
  last: string;
  phone: string;
  captcha: string;
  website: string;
}): Promise<{ token: string; status: Status }> {
  return publicRequest({ action: "book", ...body });
}
export async function getStatus(token: string): Promise<BookingStatus> {
  return (await publicRequest({ action: "status", token })).booking;
}
