export type Status = "pending" | "approved" | "rejected";
export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  blocked: boolean;
};
export type Booking = {
  id: string;
  slot_id: string;
  status: Status;
  created_at: string;
  customers: { first_name: string; last_name: string; phone: string };
};
export type BookingStatus = {
  status: Status;
  starts_at: string;
  ends_at: string;
};
export const labels: Record<Status, string> = {
  pending: "Oczekuje na potwierdzenie",
  approved: "Potwierdzona",
  rejected: "Odrzucona",
};
export const dateKey = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  });
export const fullDate = (key: string) =>
  new Date(key + "T12:00:00Z").toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export function warsawToIso(date: string, time: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  const candidates = [60, 120]
    .map((offset) => new Date(target - offset * 60000))
    .filter(
      (d) =>
        Number.isFinite(d.getTime()) &&
        dateKey(d) === date &&
        timeLabel(d.toISOString()) === time,
    );
  if (candidates.length !== 1)
    throw new Error(
      "Ta godzina jest niejednoznaczna lub nie istnieje przy zmianie czasu. Wybierz inną.",
    );
  return candidates[0].toISOString();
}
