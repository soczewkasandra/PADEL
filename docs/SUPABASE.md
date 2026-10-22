# Konfiguracja PADEL WITH KRYSTIAN — krok po kroku

Na tym etapie kod jest przygotowany lokalnie. **Nie wysyłamy go na `main`, nie uruchamiamy Vercel, nie zmieniamy Twojej bazy automatycznie.** Poniższe czynności wykonujesz samodzielnie. Najpierw używamy osobnego projektu testowego i wyłącznie fikcyjnych danych.

Nie wklejaj haseł ani sekretnych kluczy do czatu lub GitHuba. Klucz **publishable** jest przeznaczony do przeglądarki; **secret / service_role** ma pełne uprawnienia i nigdy nie może trafić do aplikacji React ani zmiennych `VITE_…`.

## 1. Wybierz bezpieczny projekt do testów

1. Otwórz https://supabase.com/dashboard i zaloguj się.
2. Otwórz swój projekt. Sprawdź nazwę u góry ekranu.
3. Jeśli są w nim ważne dane lub inne aplikacje, utwórz osobny projekt testowy przyciskiem **New project**. Nie uruchamiaj tej migracji w cudzej/istniejącej bazie bez przeglądu i kopii bezpieczeństwa.
4. Zanotuj nazwę projektu. W kolejnych etapach pracuj zawsze w tym samym projekcie testowym.

Nazwy zakładek Supabase mogą nieznacznie zmieniać się z czasem. W razie różnicy zatrzymaj się i podaj samą nazwę widocznej zakładki lub komunikat błędu, bez sekretów.

## 2. Utwórz tabele i zabezpieczenia

1. W tym repozytorium otwórz plik `supabase/migrations/202610220001_booking.sql`.
2. Skopiuj **całą treść pliku**, od `begin;` (komentarz nad nim też może zostać) do `commit;`. Nie kopiuj numerów wierszy ani znaczników Markdown.
3. W panelu Supabase kliknij **SQL Editor → New query**.
4. Wklej treść i kliknij **Run**.
5. Oczekiwany wynik: wykonanie bez błędu, zwykle „Success. No rows returned”.
6. Otwórz **Table Editor**. W schemacie `public` powinny być `slots`, `customers`, `bookings`. Są puste — to prawidłowe.

Migrację uruchamiaj **jeden raz**. Jeśli pojawi się błąd „already exists”, nie usuwaj tabel i nie wyłączaj RLS; zapisz treść błędu do diagnozy. Migracja jest transakcyjna, a jej uruchomienie samo nie tworzy konta trenera ani prawdziwych klientów.

Publiczna osoba może odczytać wyłącznie dostępne terminy przez funkcję. Dostęp do tabel klientów i rezerwacji jest prywatny. Nie klikaj „Disable RLS” ani nie dodawaj polityk typu „Allow public access”.

## 3. Utwórz konto Krystiana i nadaj mu dostęp

1. Kliknij **Authentication → Users → Add user → Create new user**.
2. Wpisz e-mail Krystiana i silne, unikalne hasło. Zapisz je w menedżerze haseł, nie w repozytorium. Jeśli formularz ma opcję **Auto confirm user**, zaznacz ją dla konta utworzonego ręcznie.
3. Otwórz utworzone konto na liście **Users** i skopiuj jego **User UID / User ID**. To identyfikator w formacie `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, nie hasło.
4. W **SQL Editor → New query** wklej poniższe polecenie. Zastąp `WKLEJ_USER_UID` skopiowanym identyfikatorem, zachowując apostrofy:

```sql
insert into private.coach (singleton, user_id)
values (true, 'WKLEJ_USER_UID'::uuid);
```

5. Kliknij **Run**. To polecenie dopuszcza tylko jedno konto trenera. Jeśli już istnieje, **nie podmieniaj go w ciemno** — najpierw sprawdź, kto ma dostęp.
6. Przejdź do **Authentication → Sign In / Providers** (w niektórych wersjach **Providers / Settings**). Wyłącz **Allow new users to sign up** oraz logowanie anonimowe. Zostaw logowanie **Email + Password**.
7. Ustawienia zmieniaj tylko w projekcie przeznaczonym dla tej aplikacji, aby nie odciąć innych aplikacji.

Samo posiadanie konta Supabase Auth, ten sam e-mail w metadanych lub ukryty przycisk nie wystarcza do dostępu. Baza sprawdza dokładny UID z prywatnej tabeli. Odświeżenie strony wylogowuje z panelu, ponieważ sesja jest przechowywana wyłącznie w pamięci.

## 4. Przygotuj CAPTCHA Cloudflare Turnstile

To dodatkowy, bezpłatny weryfikator formularza. **Bez niego zapisy pozostają zablokowane.** Nie dodawaj obejścia na czas testów.

1. Zaloguj się lub utwórz konto na https://dash.cloudflare.com.
2. Otwórz **Turnstile → Add widget**.
3. Nazwij widget np. `PADEL test` i wybierz typ **Managed**.
4. W **Hostname Management** dodaj `localhost` na czas lokalnych testów. W przyszłości dodasz też dokładną nazwę hosta prywatnego podglądu, bez `https://` i bez ścieżki.
5. Zapisz widget. Zobaczysz **Site Key** (publiczny) oraz **Secret Key** (sekretny).
6. Site Key będzie wartością `VITE_TURNSTILE_SITE_KEY`. Secret Key trafi wyłącznie do **Edge Function Secrets** w Supabase w kolejnym kroku.

Nie używaj testowych kluczy Cloudflare, które zawsze zaliczają weryfikację, w docelowej konfiguracji. Testy automatyczne używają atrap; w prywatnym podglądzie trzeba sprawdzić prawdziwy widget.

## 5. Przygotuj sekrety funkcji serwerowej

1. Wróć do właściwego projektu Supabase.
2. Otwórz **Edge Functions → Secrets** (czasem zakładka Secrets jest wewnątrz sekcji Functions).
3. Dodaj następujące pary **Name / Value**:

| Name | Co wkleić w Value na czas lokalnych testów |
| --- | --- |
| `TURNSTILE_SECRET_KEY` | Secret Key z widgetu Cloudflare — wyłącznie tutaj |
| `ALLOWED_ORIGINS` | `http://localhost:5173` |
| `TURNSTILE_HOSTNAMES` | `localhost` |
| `RATE_LIMIT_SECRET` | losowy sekret wygenerowany poniżej |

Aby wygenerować `RATE_LIMIT_SECRET`, w **SQL Editor → New query** uruchom:

```sql
select replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '') as rate_limit_secret;
```

Skopiuj **cały wynik z komórki** bez nagłówka kolumny do wartości sekretu. Nie wysyłaj go nikomu. Samo zapytanie nie zapisuje tej wartości do tabeli. Nie kopiuj go do żadnej zmiennej `VITE_…`.

Supabase standardowo sam udostępnia funkcji `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`. Nie kopiuj service_role do frontendu i nie dodawaj go do GitHuba. Jeśli funkcja zgłosi brak tych zmiennych, zatrzymaj konfigurację do diagnozy.

Wiele dozwolonych adresów podaje się po przecinku. Origins to pełne adresy ze schematem i portem, **bez końcowego `/`**, np. `http://localhost:5173,https://konkretny-podglad.vercel.app`. Hostnames to same nazwy, np. `localhost,konkretny-podglad.vercel.app`. Nie używaj `*`.

## 6. Utwórz funkcję rezerwacji w panelu Supabase

Wykonaj ten krok dopiero w projekcie testowym po etapach 2–5. To udostępnia testowy endpoint API; **nie publikuje strony Vercel**. Jego dostęp jest ograniczony konfiguracją domen, CAPTCHA, limitami i uprawnieniami bazy.

1. Otwórz **Edge Functions → Deploy a new function → Via Editor** (lub **Create function → Editor**).
2. Nazwij funkcję dokładnie **`booking`**.
3. Otwórz plik `supabase/dashboard/booking.ts` w repozytorium i skopiuj **całą jego treść**.
4. W edytorze Supabase zastąp przykładową treść pliku **`index.ts`** skopiowanym kodem. To gotowy pojedynczy plik; nie trzeba tworzyć importów lokalnych ani kopiować pozostałych plików.
5. Kliknij **Deploy function**.
6. Otwórz ustawienia/szczegóły funkcji `booking`. Wyłącz opcję **Verify JWT / Enforce JWT verification** dla tej jednej funkcji i zapisz zmianę. Klienci nie mają konta ani JWT. Weryfikację ich formularza wykonuje kod serwera; nie wyłączaj żadnych polityk RLS.
7. Jeśli wywołania zwracają `401 Missing authorization header / Invalid JWT`, sprawdź właśnie to ustawienie. Nie naprawiaj tego przez dodawanie sekretnego klucza do przeglądarki.

Dla programisty: odpowiednik CLI to `supabase functions deploy booking --no-verify-jwt`. Nie trzeba tego polecenia, jeśli używasz edytora. Plik dashboard jest generowany z tego samego kodu, który testujemy. Nie edytuj obu wersji niezależnie.

## 7. Skopiuj publiczne dane połączenia

1. W Supabase kliknij **Connect** u góry projektu lub **Project Settings → Data API / API** i znajdź **Project URL** (np. `https://…supabase.co`).
2. Otwórz **Project Settings → API Keys** i skopiuj **Publishable key**, zwykle zaczynający się od `sb_publishable_`.
3. Nie wybieraj **Secret key**, `sb_secret_…`, ani **service_role**.

Aplikacja potrzebuje trzech zmiennych:

| Nazwa | Wartość |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
| `VITE_TURNSTILE_SITE_KEY` | Publiczny Site Key Cloudflare |

Jeśli uruchamiamy lokalnie, skopiuj `.env.example` do pliku o nazwie `.env.local` w katalogu aplikacji i zastąp trzy przykładowe wartości. Plik `.env.local` jest ignorowany przez Git. Po zmianie potrzebny jest restart lokalnego serwera.

Jeśli później użyjemy Vercel, wejdź w **projekt PADEL → Settings → Environment Variables**. Dodaj te same trzy nazwy i wartości **wyłącznie dla Preview**, nie dla Production. Samo zapisanie zmiennych nie aktualizuje istniejącej strony. **Teraz nie klikaj Deploy ani Redeploy i nie łącz kodu z produkcyjną gałęzią.** Zmienne `VITE_…` są wbudowywane podczas kompilacji i widoczne dla odwiedzających; nie mogą zawierać sekretów.

## 8. Prywatny podgląd — dopiero gdy konfiguracja jest gotowa

Najpierw zakończmy konfigurację i kontrolę testów. W obecnym zadaniu niczego nie wdrażamy i nie wysyłamy zmian na GitHuba.

Aby później sprawdzić stronę bez terminala, można przygotować osobną gałąź i **chroniony podgląd Vercel Preview**, bez zmiany Production. Przed wysłaniem kodu trzeba w ustawieniach Vercel sprawdzić, która gałąź jest produkcyjna oraz czy **Deployment Protection → Vercel Authentication** rzeczywiście chroni Preview. Dostępność tych opcji zależy od konta/planu. Jeśli Preview nie da się ochronić, nie publikuj go jako obejścia — użyj lokalnego podglądu albo uzgodnij inną ochronę.

Po uzyskaniu konkretnego adresu chronionego podglądu:

1. Dodaj jego pełny origin do `ALLOWED_ORIGINS` w Supabase Secrets.
2. Dodaj sam hostname do `TURNSTILE_HOSTNAMES` w Supabase Secrets.
3. Dodaj ten sam hostname do widgetu Cloudflare Turnstile.
4. Sprawdź, że Preview używa testowego projektu Supabase, nie bazy z danymi klientów.
5. W razie zmiany sekretów odśwież funkcję/redeploy ją, jeśli stara konfiguracja nadal jest używana, i powtórz test. Nie twórz duplikatów kluczy.

To jest opis kolejnego etapu, **nie zgoda na automatyczne wdrożenie teraz**.

## 9. Testy z fikcyjnymi danymi w podglądzie

Wszystkie testy przeprowadź przed prawdziwymi zapisami. Na tym etapie nie wysyłamy SMS-ów.

1. Otwórz **Panel trenera**, zaloguj się kontem Krystiana. Dodaj przyszły dzień i godzinę, np. jutro 10:00. Dodanie 10:30 powinno być odrzucone; 11:00 jest dozwolone.
2. Otwórz stronę w drugiej przeglądarce lub oknie prywatnym, bez logowania.
3. Wybierz tę godzinę, wpisz `Alex`, `Przykładowy`, `000 000 000`, przejdź CAPTCHA i wyślij zgłoszenie.
4. Sprawdź komunikat **Oczekuje na potwierdzenie**. Kliknij **Kopiuj link**, zachowaj go i otwórz w innym oknie. Nie powinno być tam nazwiska ani telefonu.
5. W kolejnej przeglądarce odśwież kalendarz: godzina jest niedostępna mimo braku zatwierdzenia. Dwa otwarte wcześniej formularze nie mogą skutecznie zająć jej dwa razy.
6. W panelu trenera odśwież listę, zatwierdź zgłoszenie. Odśwież stronę statusu: powinna pokazać **Potwierdzona**.
7. Odwołaj tę rezerwację (albo odrzuć inne oczekujące zgłoszenie). Termin znowu ma być wolny, a zapisany link pokazywać **Odrzucona**. Odrzuconego zgłoszenia nie da się reaktywować; klient składa nowe.
8. Zablokuj wolną godzinę: ma zniknąć klientowi. Odblokuj: ma wrócić.
9. Zaloguj się innym, testowym kontem Auth (utworzonym ręcznie, bez dodawania do `private.coach`). Powinno zobaczyć **brak uprawnień**, bez danych klientów i bez zarządzania.
10. Zmień jeden znak w prywatnym linku: powinien pokazać brak rezerwacji, bez ujawniania żadnych danych.
11. Bez CAPTCHA formularz nie powinien pozwalać na zapis. Czwarta zweryfikowana próba dla tego samego numeru tego samego dnia UTC powinna być ograniczona. W testach antyspamu wykorzystuj tylko fikcyjne numery.
12. Wyloguj się: panel nie może dalej pokazywać danych klientów.

Kalendarz odświeża się co 30 sekund i ma przycisk ręcznego odświeżania. Niezależnie od widocznej dostępności ostateczną decyzję podejmuje transakcja w bazie. Przy przerwaniu sieci tuż po wysłaniu może nie dotrzeć link potwierdzenia, mimo utworzonej rezerwacji; trener powinien wtedy sprawdzić listę. Nie ma obietnicy dostarczenia SMS ani odzyskania utraconego linku przez publiczny formularz.

## 10. Co sprawdzono automatycznie, a co wymaga Twojej konfiguracji

Kod zawiera:

- testy komponentów (logowanie, brak uprawnień, zgłoszenie, link i status), czasu Europe/Warsaw oraz obsługi serwerowej CAPTCHA i limitów;
- testy migracji w osobnej rzeczywistej bazie PostgreSQL 17: uprawnienia anon/trener/inne konto, RLS, statusy, blokady, nakładanie terminów, limity oraz dwie równoczesne transakcje;
- kontrolę TypeScript i kompilację produkcyjną.

Te testy nie logują się do Twojego Supabase i nie zastępują testów prawdziwego Supabase Auth, ustawień JWT, sieci, CAPTCHA, sekretów i podglądu. Nie deklarujemy gotowości produkcyjnej przed zakończeniem punktów 1–9 i przeglądem konfiguracji.

## 11. Przed prawdziwymi klientami

Należy jeszcze ustalić dane administratora danych, treść obowiązku informacyjnego i polityki prywatności, okres przechowywania/usuwania danych oraz zasady kontaktu. Obecny tekst przy formularzu opisuje cel, ale nie jest kompletną polityką prywatności. Trzeba ustawić kopie zapasowe i sposób odzyskania bazy, monitoring błędów oraz obsługę utraconych linków. Dane klientów i rezerwacje nie są automatycznie usuwane; okres retencji wymaga decyzji właściciela i procedury/automatyzacji. Wpisy limitera starsze niż 2 dni są sprzątane przy kolejnych wywołaniach.

Link statusu jest kluczem dostępu: osoba, która go otrzyma, zobaczy status i termin, choć nie zobaczy danych osobowych. Nie przesyłaj go publicznie. Status przestaje być dostępny 90 dni po treningu. Nie dodawaj analityki nagrywającej formularze, tokeny lub dane osobowe. Nie zapisuj treści żądań w logach funkcji. Jeśli później dodasz domenę inną niż standardowe `*.supabase.co`, wymaga ona przeglądu nagłówka CSP w `vercel.json`.

Ograniczenia antyspamu są celowo restrykcyjne na start: 30 prób zapisu i 300 odczytów statusu na 10 minut dla całej aplikacji; 3 zweryfikowane próby na numer dziennie. To stałe okna czasowe; przy granicy okien można wykonać więcej prób w krótkim odstępie. CAPTCHA, unikalne rezerwacje i limity istotnie ograniczają nadużycia, ale nie gwarantują odporności na DDoS ani świadome blokowanie grafiku przez człowieka. Monitoruj limity przed zwiększeniem ruchu.

Nie publikuj produkcyjnie, dopóki konfiguracja, wszystkie scenariusze testowe i kwestie danych klientów nie zostaną zakończone. Wysłanie zmian na `main` może automatycznie uruchomić Vercel — dlatego obecne zmiany pozostają lokalne.
