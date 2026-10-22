import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Check,
  CalendarDays,
  Shield,
  X,
  Plus,
  Lock,
  Unlock,
  CheckCircle2,
} from "lucide-react";
import {
  type Slot,
  type Booking,
  type BookingStatus,
  labels,
  dateKey,
  fullDate,
  timeLabel,
  warsawToIso,
} from "./model";
import * as api from "./api";
import { Captcha } from "./Captcha";
import "./style.css";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Wystąpił błąd. Spróbuj ponownie.";
function statusToken() {
  const token = new URLSearchParams(location.hash.slice(1)).get("status");
  return token;
}
function Receipt({ token }: { token: string }) {
  const link = `${location.origin}${location.pathname}#status=${token}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="receipt">
      <p>
        Zachowaj ten prywatny link — pozwoli sprawdzić status bez logowania. Nie
        udostępniaj go innym. Nie wysyłamy SMS-a.
      </p>
      <label>
        Twój link statusu
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <button
        type="button"
        className="primary"
        onClick={() =>
          navigator.clipboard
            .writeText(link)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? "Skopiowano" : "Kopiuj link"}
      </button>
      <a href={link} target="_blank" rel="noopener noreferrer">
        Otwórz status rezerwacji <ArrowUpRight size={15} />
      </a>
    </div>
  );
}
function StatusPage({ token }: { token: string }) {
  const [value, setValue] = useState<BookingStatus | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setValue(await api.getStatus(token));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [token]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <section className="status-page card">
      <CalendarDays size={30} />
      <h1>Status rezerwacji</h1>
      {value && (
        <>
          <span className={`status ${value.status}`}>
            {labels[value.status]}
          </span>
          <p>
            {fullDate(dateKey(new Date(value.starts_at)))} ·{" "}
            {timeLabel(value.starts_at)} · 60 minut
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="primary"
        onClick={() => void refresh()}
      >
        {busy ? "Sprawdzanie…" : "Odśwież status"}
      </button>
      <p>
        Link jest ważny do 90 dni po treningu. Dla ochrony prywatności nie
        pokazujemy tu danych kontaktowych.
      </p>
      <a href={location.pathname}>Wróć do kalendarza</a>
    </section>
  );
}
export function App() {
  const [token] = useState(statusToken);
  useEffect(() => {
    if (token)
      history.replaceState(null, "", location.pathname + location.search);
  }, [token]);
  const [slots, setSlots] = useState<Slot[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]);
  const [panel, setPanel] = useState(false),
    [coach, setCoach] = useState(false),
    [authBusy, setAuthBusy] = useState(true);
  const [date, setDate] = useState(dateKey(new Date())),
    [month, setMonth] = useState(
      () => new Date(dateKey(new Date()).slice(0, 7) + "-01T12:00:00"),
    );
  const [selected, select] = useState<Slot | null>(null),
    [receipt, setReceipt] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [time, setTime] = useState("10:00");
  const [captcha, setCaptcha] = useState(""),
    [captchaVersion, setCaptchaVersion] = useState(0);
  const dialog = useRef<HTMLElement>(null);
  const admin = panel && coach;
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestVersion.current;
    if (token || authBusy) return;
    if (!api.configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        api.getSlots(admin),
        admin ? api.getBookings() : Promise.resolve([]),
      ]);
      if (request === requestVersion.current) {
        setSlots(s);
        setBookings(b);
      }
    } catch (e) {
      if (request === requestVersion.current) {
        setError(message(e));
        setSlots([]);
        setBookings([]);
      }
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [admin, authBusy, token]);
  useEffect(() => {
    if (!api.supabase) {
      setAuthBusy(false);
      return;
    }
    let active = true,
      version = 0;
    const validate = async (hasUser: boolean) => {
      const current = ++version;
      requestVersion.current++;
      setCoach(false);
      setBookings([]);
      setSlots([]);
      setAuthBusy(true);
      try {
        if (hasUser) {
          const r = await api.supabase!.rpc("is_coach");
          if (active && current === version) {
            setCoach(r.data === true && !r.error);
            if (r.data !== true || r.error)
              setError("To konto nie ma uprawnień trenera.");
          }
        }
      } catch {
        if (active && current === version)
          setError("Nie udało się sprawdzić uprawnień. Zaloguj się ponownie.");
      } finally {
        if (active && current === version) setAuthBusy(false);
      }
    };
    void api.supabase.auth
      .getSession()
      .then(({ data }) => validate(!!data.session))
      .catch(() => {
        if (active) setAuthBusy(false);
      });
    const { data } = api.supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (active) void validate(!!session);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) select(null);
      if (e.key === "Tab") {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,a",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [selected, busy]);
  async function operation(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const daySlots = slots.filter((s) => dateKey(new Date(s.starts_at)) === date);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    offset = (month.getDay() + 6) % 7;
  const activeBooking = (id: string) =>
    bookings.find((b) => b.slot_id === id && b.status !== "rejected");
  return (
    <>
      <header>
        <a
          className="brand"
          href={location.pathname}
          aria-label="PADEL WITH KRYSTIAN — strona główna"
        >
          <span className="brand-icon">
            p<span>●</span>
          </span>
          <span>
            PADEL<span className="brand-sub">WITH KRYSTIAN</span>
          </span>
        </a>
        <nav>
          <button
            onClick={() => {
              setPanel(!panel);
              setError("");
              select(null);
            }}
          >
            <Shield size={15} />
            {panel ? "Wróć do zapisów" : "Panel trenera"}
            <ArrowUpRight size={15} />
          </button>
          {coach && (
            <button
              onClick={() =>
                void operation(async () => {
                  await api.supabase!.auth.signOut();
                  setCoach(false);
                  setBookings([]);
                })
              }
            >
              Wyloguj
            </button>
          )}
        </nav>
      </header>
      <main>
        {!api.configured ? (
          <section className="status-page card">
            <h1>Konfiguracja połączenia</h1>
            <p>
              Aplikacja nie jest jeszcze podłączona do Supabase. Skonfiguruj
              projekt według instrukcji w docs/SUPABASE.md. Nie zapisujemy
              rezerwacji lokalnie.
            </p>
          </section>
        ) : token ? (
          <StatusPage token={token} />
        ) : panel && !coach ? (
          <section className="login card">
            <div className="eyebrow">PRYWATNY PANEL TRENERA</div>
            <h1>Zaloguj się</h1>
            <p>Dostęp wyłącznie dla upoważnionego konta Krystiana.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void operation(async () => {
                  const r = await api.supabase!.auth.signInWithPassword({
                    email: String(f.get("email")),
                    password: String(f.get("password")),
                  });
                  if (r.error)
                    throw new Error(
                      "Nie udało się zalogować. Sprawdź e-mail i hasło.",
                    );
                });
              }}
            >
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Hasło
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="primary" disabled={busy || authBusy}>
                {authBusy ? "Sprawdzanie dostępu…" : "Zaloguj"}
              </button>
            </form>
            <p>
              Sesja nie jest zapisywana na dysku. Po odświeżeniu strony zaloguj
              się ponownie.
            </p>
          </section>
        ) : (
          <>
            {!admin ? (
              <>
                <section className="hero">
                  <div className="hero-copy">
                    <div className="eyebrow">
                      <span /> TWOJA GRA. NOWY POZIOM.
                    </div>
                    <h1>
                      Dobry trening.
                      <br />
                      Jeszcze lepsza <em>gra.</em>
                    </h1>
                    <p>
                      Złap rytm na korcie. Zarezerwuj indywidualny trening padla
                      i rozwijaj swoją grę z Krystianem.
                    </p>
                    <a className="primary hero-cta" href="#booking">
                      Znajdź swój termin <ArrowUpRight size={19} />
                    </a>
                    <div className="hero-meta">
                      <span>
                        <CheckCircle2 size={16} /> Każdy poziom zaawansowania
                      </span>
                      <span>
                        <Clock size={16} /> 60 minut na korcie
                      </span>
                    </div>
                  </div>
                  <div
                    className="court-art"
                    role="img"
                    aria-label="Ilustracja kortu do padla z rakietą i piłką"
                  >
                    <div className="court-lines">
                      <i />
                      <b />
                    </div>
                    <div className="big-word">PADEL</div>
                    <div className="racket">
                      <div className="racket-face" />
                      <div className="racket-handle" />
                    </div>
                    <div className="ball" />
                    <div className="art-label">
                      <span>
                        MNIEJ SCROLLOWANIA.
                        <br />
                        WIĘCEJ GRANIA.
                      </span>
                      <ArrowUpRight size={28} />
                    </div>
                    <span className="vertical">SEE YOU ON COURT</span>
                  </div>
                </section>
                <div className="benefits">
                  <span>
                    <span className="number">01</span> Wybierz termin
                  </span>
                  <ArrowRight />
                  <span>
                    <span className="number">02</span> Zostaw kontakt
                  </span>
                  <ArrowRight />
                  <span>
                    <span className="number">03</span> Sprawdź potwierdzenie
                  </span>
                </div>
              </>
            ) : (
              <section className="admin-intro">
                <div className="eyebrow">PRYWATNY PANEL</div>
                <h1>Cześć, Krystian!</h1>
                <p>
                  Zarządzaj terminami i zgłoszeniami. Oczekująca rezerwacja już
                  zajmuje godzinę.
                </p>
                <div className="stats">
                  <div>
                    <b>
                      {bookings.filter((b) => b.status === "pending").length}
                    </b>{" "}
                    oczekujących zgłoszeń
                  </div>
                  <div>
                    <b>
                      {bookings.filter((b) => b.status === "approved").length}
                    </b>{" "}
                    potwierdzonych treningów
                  </div>
                </div>
              </section>
            )}
            <section id="booking" className="booking-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    {admin ? "TWÓJ GRAFIK" : "ZAREZERWUJ CZAS DLA SIEBIE"}
                  </div>
                  <h2>
                    {admin ? "Kalendarz treningów" : "Widzimy się na korcie."}
                  </h2>
                </div>
                <span className="timezone">Czas polski · Europe/Warsaw</span>
              </div>
              <button
                className="refresh"
                disabled={loading}
                onClick={() => void refresh()}
              >
                {loading ? "Ładowanie…" : "Odśwież kalendarz"}
              </button>
              <div className="booking-grid">
                <div className="calendar card">
                  <div className="calendar-heading">
                    <h3>
                      {month.toLocaleDateString("pl-PL", {
                        month: "long",
                        year: "numeric",
                      })}
                    </h3>
                    <div>
                      <button
                        aria-label="Poprzedni miesiąc"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() - 1,
                              1,
                              12,
                            ),
                          )
                        }
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        aria-label="Następny miesiąc"
                        onClick={() =>
                          setMonth(
                            new Date(
                              month.getFullYear(),
                              month.getMonth() + 1,
                              1,
                              12,
                            ),
                          )
                        }
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="days">
                    {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>
                  <div className="dates">
                    {Array.from({ length: offset }, (_, i) => (
                      <span key={"e" + i} />
                    ))}
                    {Array.from({ length: days }, (_, i) => {
                      const d = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                      const available = slots.some(
                        (s) =>
                          dateKey(new Date(s.starts_at)) === d &&
                          !s.blocked &&
                          !activeBooking(s.id) &&
                          new Date(s.starts_at) > new Date(),
                      );
                      return (
                        <button
                          key={d}
                          aria-label={fullDate(d)}
                          aria-pressed={date === d}
                          className={date === d ? "chosen" : ""}
                          onClick={() => {
                            setDate(d);
                            setError("");
                          }}
                        >
                          {i + 1}
                          <i className={available ? "available" : ""} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="legend">
                    <i /> Dostępne terminy <span>•</span> Trening indywidualny
                  </div>
                </div>
                <div className="slots card">
                  <div className="slot-heading">
                    <div>
                      <h3>{fullDate(date)}</h3>
                      <p>
                        {admin
                          ? "Dostępność i rezerwacje"
                          : "Wybierz godzinę swojego treningu"}
                      </p>
                    </div>
                    <CalendarDays size={23} />
                  </div>
                  <div className="time-grid">
                    {daySlots.map((s) => {
                      const b = activeBooking(s.id);
                      return admin ? (
                        <div key={s.id} className="admin-slot">
                          <span>
                            <b>{timeLabel(s.starts_at)}</b>
                            <small>
                              {b
                                ? `${b.customers.first_name} ${b.customers.last_name} · ${labels[b.status]}`
                                : s.blocked
                                  ? "Zablokowany"
                                  : "Wolny termin"}
                            </small>
                          </span>
                          <button
                            disabled={
                              busy || !!b || new Date(s.starts_at) <= new Date()
                            }
                            aria-label={`${s.blocked ? "Odblokuj" : "Zablokuj"} ${timeLabel(s.starts_at)}`}
                            onClick={() =>
                              void operation(() =>
                                api.mutate("set_slot_blocked", {
                                  p_slot: s.id,
                                  p_blocked: !s.blocked,
                                }),
                              )
                            }
                          >
                            {s.blocked ? (
                              <Unlock size={17} />
                            ) : (
                              <Lock size={17} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          key={s.id}
                          className="time-button"
                          onClick={() => {
                            select(s);
                            setReceipt("");
                            setCaptcha("");
                            setError("");
                          }}
                        >
                          {timeLabel(s.starts_at)}
                          <ArrowUpRight size={16} />
                        </button>
                      );
                    })}
                  </div>
                  {!daySlots.length && (
                    <div className="empty">
                      <CalendarDays />
                      <p>
                        {loading
                          ? "Ładowanie terminów…"
                          : "Brak dostępnych godzin w tym dniu."}
                      </p>
                      <small>Sprawdź inny dzień w kalendarzu.</small>
                    </div>
                  )}
                  {admin ? (
                    <form
                      className="add-slot"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void operation(() =>
                          api.mutate("add_slot", {
                            p_start: warsawToIso(date, time),
                          }),
                        );
                      }}
                    >
                      <label>
                        Nowa godzina
                        <input
                          type="time"
                          required
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </label>
                      <button className="primary" disabled={busy}>
                        <Plus size={16} /> Dodaj termin
                      </button>
                    </form>
                  ) : (
                    <div className="slot-note">
                      <Clock size={17} />
                      <span>
                        Każdy trening trwa <strong>60 minut.</strong>
                        <br />
                        Zgłoszenie wymaga potwierdzenia przez Krystiana.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>
            {admin && (
              <section className="requests">
                <h2>
                  Rezerwacje <span className="count">{bookings.length}</span>
                </h2>
                <p>
                  Odrzucenie zgłoszenia lub odwołanie potwierdzonego treningu
                  zwalnia termin.
                </p>
                {!bookings.length && <p>Brak zgłoszeń.</p>}
                {bookings.map((b) => {
                  const s = slots.find((s) => s.id === b.slot_id);
                  return (
                    <article className="request card" key={b.id}>
                      <div className="avatar">
                        {b.customers.first_name[0]}
                        {b.customers.last_name[0]}
                      </div>
                      <div className="request-person">
                        <b>
                          {b.customers.first_name} {b.customers.last_name}
                        </b>
                        <span>{b.customers.phone}</span>
                      </div>
                      <div className="request-date">
                        {s && fullDate(dateKey(new Date(s.starts_at)))}
                        <span>{s && timeLabel(s.starts_at)} · 60 min</span>
                      </div>
                      <span className={`status ${b.status}`}>
                        {labels[b.status]}
                      </span>
                      {b.status !== "rejected" && (
                        <div className="actions">
                          {b.status === "pending" && (
                            <button
                              disabled={busy}
                              aria-label={`Zatwierdź ${b.customers.first_name}`}
                              onClick={() =>
                                void operation(() =>
                                  api.mutate("set_booking_status", {
                                    p_booking: b.id,
                                    p_status: "approved",
                                  }),
                                )
                              }
                            >
                              <Check size={17} /> Zatwierdź
                            </button>
                          )}
                          <button
                            disabled={busy}
                            aria-label={`Odrzuć ${b.customers.first_name}`}
                            onClick={() => {
                              if (
                                confirm(
                                  "Odrzucić rezerwację? Termin ponownie będzie dostępny.",
                                )
                              )
                                void operation(() =>
                                  api.mutate("set_booking_status", {
                                    p_booking: b.id,
                                    p_status: "rejected",
                                  }),
                                );
                            }}
                          >
                            <X size={17} />{" "}
                            {b.status === "approved" ? "Odwołaj" : "Odrzuć"}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
            {!admin && (
              <section className="bottom-note">
                <div className="note-icon">
                  <MapPin />
                </div>
                <div>
                  <h3>Twój pierwszy raz z padlem?</h3>
                  <p>Nie musisz mieć doświadczenia — wystarczą chęci do gry.</p>
                </div>
              </section>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer>
          <span>PADEL WITH KRYSTIAN</span>
          <p>
            Treningi 60 minut · Bez płatności online.
            <br />
            Podczas konfiguracji używaj wyłącznie fikcyjnych danych.
          </p>
        </footer>
      </main>
      {selected && (
        <div className="overlay">
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal"
          >
            <button
              autoFocus
              className="close"
              disabled={busy}
              aria-label="Zamknij"
              onClick={() => select(null)}
            >
              <X />
            </button>
            {receipt ? (
              <>
                <CheckCircle2 size={42} className="success-icon" />
                <h2 id="dialog-title">Zgłoszenie zapisane!</h2>
                <span className="status pending">
                  Oczekuje na potwierdzenie
                </span>
                <p>
                  {fullDate(dateKey(new Date(selected.starts_at)))} ·{" "}
                  {timeLabel(selected.starts_at)}
                </p>
                <Receipt token={receipt} />
              </>
            ) : (
              <>
                <div className="eyebrow">TWÓJ NASTĘPNY TRENING</div>
                <h2 id="dialog-title">Zarezerwuj trening.</h2>
                <p>
                  {fullDate(dateKey(new Date(selected.starts_at)))} ·{" "}
                  {timeLabel(selected.starts_at)} · 60 minut
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy || !captcha) return;
                    const f = new FormData(e.currentTarget);
                    setBusy(true);
                    setError("");
                    try {
                      const result = await api.book({
                        slotId: selected.id,
                        first: String(f.get("first")),
                        last: String(f.get("last")),
                        phone: String(f.get("phone")),
                        website: String(f.get("website") || ""),
                        captcha,
                      });
                      setReceipt(result.token);
                      await refresh();
                    } catch (err) {
                      setError(message(err));
                      void refresh();
                    } finally {
                      setBusy(false);
                      setCaptcha("");
                      setCaptchaVersion((v) => v + 1);
                    }
                  }}
                >
                  <label>
                    Imię
                    <input
                      name="first"
                      autoComplete="given-name"
                      required
                      maxLength={60}
                    />
                  </label>
                  <label>
                    Nazwisko
                    <input
                      name="last"
                      autoComplete="family-name"
                      required
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Numer telefonu
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      maxLength={20}
                      placeholder="np. 000 000 000"
                    />
                  </label>
                  <label className="honeypot" aria-hidden="true">
                    Strona internetowa
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                  <p className="form-help">
                    Dane służą obsłudze rezerwacji i kontaktowi w sprawie
                    treningu. Na etapie testów wpisuj wyłącznie fikcyjne dane.
                  </p>
                  <Captcha key={captchaVersion} onToken={setCaptcha} />
                  {!api.siteKey && (
                    <p className="error">
                      Brak konfiguracji CAPTCHA. Wysyłanie jest wyłączone.
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="error">
                      {error}
                    </p>
                  )}
                  <button className="primary" disabled={busy || !captcha}>
                    {busy ? "Wysyłanie…" : "Wyślij zgłoszenie"}
                    <ArrowUpRight size={17} />
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
