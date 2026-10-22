# PADEL WITH KRYSTIAN

React + TypeScript + Supabase. Rezerwacje treningów 60-minutowych, prywatny panel trenera, losowe linki statusu, brak płatności.

**Zmiany przygotowane do konfiguracji i testów, nie do automatycznej publikacji.** Nie łącz z rzeczywistymi danymi klientów przed końcową weryfikacją. Zmiany nie wymagają migracji starych danych: demo w localStorage było wyłącznie przykładowe i nie jest importowane.

## Instrukcja bez wiedzy programistycznej

Otwórz [docs/SUPABASE.md](docs/SUPABASE.md). Zawiera kolejność kliknięć w Supabase, konfigurację CAPTCHA i konta trenera oraz scenariusz testów. Nie uruchamiaj deploymentu Vercel ani nie wysyłaj zmian na automatycznie wdrażaną gałąź `main` przed zakończeniem konfiguracji i testów.

## Dla osoby konfigurującej kod

Node.js 22+, istniejący checkout `/workspace/PADEL`. W zadaniu chmurowym używaj istniejącego checkoutu — nie twórz worktree bez prośby użytkownika.

```sh
npm ci
cp .env.example .env.local
# Uzupełnij publiczny URL i klucz Supabase oraz publiczny klucz Turnstile.
npm run dev
```

W chmurze w razie niedostępnego cache: `npm ci --cache /workspace/.npm-cache`.
Nie istnieje awaryjny tryb demo zapisujący lokalnie dane. Bez konfiguracji aplikacja pokazuje komunikat. Sesja Supabase Auth jest przechowywana wyłącznie w pamięci (odświeżenie strony wymaga ponownego logowania).

```sh
npm test             # komponenty, strefa czasowa, zabezpieczenia Edge Function
npm run test:db      # Docker: osobny, tymczasowy PostgreSQL 17; nigdy baza użytkownika
npm run build        # TypeScript i build Vite
npm run edge:bundle  # aktualizacja pliku do edytora Supabase
```

`test:db` uruchamia własny kontener tylko na interfejsie loopback i usuwa go po teście. Testuje faktyczny SQL, role, RLS, statusy, limity i konkurencję dwóch połączeń. Minimalny stub `auth.uid()` w teście zastępuje tożsamość Supabase; rzeczywiste Auth, gateway, JWT, CORS i Turnstile trzeba dodatkowo sprawdzić w prywatnym podglądzie projektu testowego.

## Architektura i bezpieczeństwo

- Publiczny kalendarz: wyłącznie RPC `available_slots`, bez danych osobowych.
- Publiczne zgłoszenie/status: Edge Function `booking`. CAPTCHA Turnstile jest sprawdzana po stronie serwera dla każdego zapisu. Brak obejścia zapisami REST/RPC z kluczem publicznym.
- Baza: tabele `slots`, `customers`, `bookings`, RLS i jawne uprawnienia. Tylko jeden użytkownik z `private.coach` zarządza danymi. Rola nie jest pobierana z edytowalnych metadanych użytkownika.
- Rezerwacja w jednej transakcji z blokadą wiersza terminu oraz dodatkowym unikalnym indeksem dla aktywnych rezerwacji. Oczekująca i zatwierdzona zajmują godzinę; odrzucona ją zwalnia.
- Link: 32 losowe bajty (256 bitów). Baza przechowuje wyłącznie SHA-256 tokenu. Token znajduje się we fragmencie `#status=…`, nie w ścieżce/query, i po otwarciu jest usuwany z paska adresu. Brak analityki i zewnętrznych fontów. Status nie ujawnia danych osobowych i wygasa 90 dni po treningu.
- Antyspam: CAPTCHA z kontrolą domeny i action, honeypot, walidacja i limit rozmiaru, 3 zweryfikowane próby zapisu na numer/dobę UTC, 30 żądań zapisu i 300 statusu/10 min globalnie. Próby błędne także zużywają budżet. Limity są atomowe i wspólne dla instancji. Numery w limiterze są HMAC-owane sekretem serwera. Nie ufamy nagłówkom IP od klienta. To ograniczenie spamu, nie gwarancja odporności na każdy atak DDoS: atakujący może wyczerpać wspólny budżet; przed większym ruchem potrzebne monitoring i ochrona brzegowa.
- Dostępne godziny w horyzoncie 180 dni. Godziny prezentowane w Europe/Warsaw, w bazie timestamptz. Nie importujemy starych danych demo.

Szczegóły, limity weryfikacji i obowiązki przed pracą z danymi klientów: [docs/SUPABASE.md](docs/SUPABASE.md).
