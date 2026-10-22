// @vitest-environment jsdom
import React from "react";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  configured: true,
  coach: false,
  authCallback: (_event: string, _session: unknown) => {},
  getSlots: vi.fn(),
  getBookings: vi.fn(),
  book: vi.fn(),
  getStatus: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("./api", () => ({
  get configured() {
    return mocks.configured;
  },
  siteKey: "test",
  getSlots: mocks.getSlots,
  getBookings: mocks.getBookings,
  book: mocks.book,
  getStatus: mocks.getStatus,
  mutate: mocks.mutate,
  supabase: {
    rpc: async () => ({ data: mocks.coach, error: null }),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (fn: typeof mocks.authCallback) => {
        mocks.authCallback = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async () => {
        mocks.authCallback("SIGNED_IN", { user: { id: "coach" } });
        return { error: null };
      },
      signOut: async () => {
        mocks.authCallback("SIGNED_OUT", null);
        return { error: null };
      },
    },
  },
}));
vi.mock("./Captcha", () => ({
  Captcha: ({ onToken }: { onToken: (s: string) => void }) => (
    <button type="button" onClick={() => onToken("test-token")}>
      Weryfikacja testowa
    </button>
  ),
}));
import { App } from "./App";
import { dateKey, fullDate } from "./model";
const next = new Date();
next.setDate(next.getDate() + 1);
next.setHours(10, 0, 0, 0);
const slot = {
  id: "slot",
  starts_at: next.toISOString(),
  ends_at: new Date(+next + 3600000).toISOString(),
  blocked: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  history.replaceState(null, "", "/");
  mocks.coach = false;
  mocks.configured = true;
  mocks.getSlots.mockResolvedValue([slot]);
  mocks.getBookings.mockResolvedValue([]);
  mocks.book.mockResolvedValue({ token: "a".repeat(64), status: "pending" });
  mocks.mutate.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("bez konfiguracji nie uruchamia demonstracyjnych rezerwacji", () => {
  mocks.configured = false;
  render(<App />);
  expect(screen.getByText("Konfiguracja połączenia")).toBeTruthy();
  expect(mocks.getSlots).not.toHaveBeenCalled();
});
it("klient wysyła zgłoszenie przez serwer i dostaje prywatny link", async () => {
  render(<App />);
  await waitFor(() => expect(mocks.getSlots).toHaveBeenCalled());
  fireEvent.click(
    screen.getByRole("button", { name: fullDate(dateKey(next)) }),
  );
  const time = next.toLocaleTimeString("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  });
  fireEvent.click(await screen.findByRole("button", { name: time }));
  const modal = screen.getByRole("dialog");
  fireEvent.change(within(modal).getByLabelText("Imię"), {
    target: { value: "Alex" },
  });
  fireEvent.change(within(modal).getByLabelText("Nazwisko"), {
    target: { value: "Test" },
  });
  fireEvent.change(within(modal).getByLabelText("Numer telefonu"), {
    target: { value: "000000000" },
  });
  expect(
    (
      within(modal).getByRole("button", {
        name: /Wyślij zgłoszenie/,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(
    within(modal).getByRole("button", { name: "Weryfikacja testowa" }),
  );
  fireEvent.submit(
    within(modal)
      .getByRole("button", { name: /Wyślij zgłoszenie/ })
      .closest("form")!,
  );
  expect(
    await within(modal).findByText("Oczekuje na potwierdzenie"),
  ).toBeTruthy();
  expect(
    (within(modal).getByLabelText("Twój link statusu") as HTMLInputElement)
      .value,
  ).toContain("#status=" + "a".repeat(64));
  expect(mocks.book).toHaveBeenCalledWith(
    expect.objectContaining({ slotId: "slot", captcha: "test-token" }),
  );
  expect(localStorage.getItem("padel-krystian-demo-v1")).toBeNull();
});
it("przed zalogowaniem panel nie pobiera danych klientów", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Panel trenera/ }));
  expect(await screen.findByLabelText("E-mail")).toBeTruthy();
  expect(mocks.getBookings).not.toHaveBeenCalled();
  expect(screen.queryByText("Cześć, Krystian!")).toBeNull();
});
it("inne konto Auth nie uzyskuje dostępu do panelu", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Panel trenera/ }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Zaloguj" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Zaloguj" }).closest("form")!,
  );
  expect(
    await screen.findByText("To konto nie ma uprawnień trenera."),
  ).toBeTruthy();
  expect(mocks.getBookings).not.toHaveBeenCalled();
});
it("autoryzowany trener zatwierdza rezerwację przez chronione RPC", async () => {
  mocks.coach = true;
  mocks.getBookings.mockResolvedValue([
    {
      id: "booking",
      slot_id: "slot",
      status: "pending",
      customers: { first_name: "Alex", last_name: "Test", phone: "000000000" },
    },
  ]);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Panel trenera/ }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Zaloguj" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Zaloguj" }).closest("form")!,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Zatwierdź Alex" }),
  );
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith("set_booking_status", {
      p_booking: "booking",
      p_status: "approved",
    }),
  );
});
it("link statusu pokazuje decyzję bez nazwiska i telefonu oraz usuwa token z paska adresu", async () => {
  history.replaceState(null, "", "/#status=" + "b".repeat(64));
  mocks.getStatus.mockResolvedValue({
    status: "approved",
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
  });
  render(<App />);
  expect(await screen.findByText("Potwierdzona")).toBeTruthy();
  expect(mocks.getStatus).toHaveBeenCalledWith("b".repeat(64));
  expect(location.hash).toBe("");
  expect(screen.queryByLabelText("Numer telefonu")).toBeNull();
});
