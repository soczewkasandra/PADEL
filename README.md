# PADEL WITH KRYSTIAN

Demonstracyjna aplikacja React + TypeScript do zapisów na indywidualne, 60-minutowe treningi padla. Bez płatności i bez wysyłania SMS-ów.

## Podgląd na swoim komputerze

Zainstaluj Node.js 22 lub nowszy. Otwórz terminal w katalogu projektu i wpisz:

```sh
npm ci
npm run dev
```

Otwórz w przeglądarce adres podany przez Vite (zwykle http://localhost:5173). To lokalny podgląd, nie publikacja strony w internecie. W środowisku chmurowym, jeśli nie masz dostępu do portów podglądu, pobierz repozytorium na komputer i uruchom te same polecenia. Samo uruchomienie serwera w chmurze nie zapewnia dostępnego adresu strony.

W tym środowisku można użyć `npm ci --cache /workspace/.npm-cache`, ponieważ domyślny katalog cache może być niedostępny.

## Jak sprawdzić demo

1. W kalendarzu wybierz dzień oznaczony kropką, a potem godzinę.
2. Wpisz fikcyjne dane, np. Alex Przykładowy, 000 000 000, i wyślij zgłoszenie.
3. Zobaczysz status „Oczekuje na potwierdzenie”.
4. Przejdź do „Panel trenera”, zatwierdź lub odrzuć zgłoszenie. Odrzucenie zwalnia godzinę.
5. W panelu wybierz dzień, dodaj godzinę lub zablokuj wolny termin. Treningi nie mogą się nakładać.

Kalendarz pokazuje czas lokalny przeglądarki. Przykładowe terminy obejmują 28 dni od pierwszego uruchomienia. Dane pozostają w localStorage tej przeglądarki. Aby zresetować demo, usuń w narzędziach przeglądarki klucz `padel-krystian-demo-v1` i odśwież stronę.

## Kontrole

```sh
npm test
npm run build
```

## Zakres demonstracyjny

Panel jest otwarty, bez prawdziwego logowania. Nie używaj prawdziwych danych klientów. Dane nie są wspólne dla urządzeń i przeglądarek. Przed udostępnieniem klientom potrzebne będą: backend z bazą danych, uwierzytelnianie i autoryzacja trenera, atomowe rezerwacje zapobiegające jednoczesnym zapisom, zasady prywatności i bezpieczne przechowywanie danych. Strona nie została opublikowana.

## Publiczny podgląd bez terminala — Vercel

Publikację uruchamia właściciel repozytorium. Aplikacja nie publikuje się sama.

1. Wejdź na https://vercel.com i zaloguj się przez GitHub.
2. Wybierz **Add New → Project** (lub **New Project**).
3. Przy repozytorium `soczewkasandra/PADEL` wybierz **Import**. Jeśli nie ma go na liście, skonfiguruj dostęp integracji Vercel do tego jednego repozytorium.
4. Sprawdź ustawienia: **Framework Preset: Vite**, katalog główny repozytorium, **Build Command: npm run build**, **Output Directory: dist**. Zmienne środowiskowe nie są potrzebne.
5. Dopiero gdy chcesz udostępnić demo, kliknij **Deploy**. To tworzy publiczny podgląd aplikacji.
6. Po zakończeniu otwórz adres podany przez Vercel. Jeżeli dostęp wymaga logowania do Vercel, sprawdź ustawienia **Deployment Protection** projektu i zdecyduj, czy chcesz zezwolić na dostęp publiczny.

To wyłącznie demonstracja: panel trenera jest dostępny bez logowania, rezerwacje są lokalne dla każdej przeglądarki i nie trafiają do trenera. Używaj tylko fikcyjnych danych. Zwykle kolejne commity na `main` uruchamiają automatyczny deployment w podłączonym projekcie Vercel; uwzględnij to przed późniejszymi zmianami. Podgląd można wyłączyć, usuwając projekt w ustawieniach Vercel — nie usuwa to repozytorium GitHub.
