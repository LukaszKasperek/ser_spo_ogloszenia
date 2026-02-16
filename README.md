# Spotted Leżajsk – API

Backend API dla formularza „Spotted” – przyjmuje wiadomości (z opcjonalnymi zdjęciami) i wysyła je mailem.

## Wymagania

- Node.js
- Konto Gmail (SMTP) do wysyłki maili

## Instalacja

```bash
npm install
```

## Konfiguracja

Utwórz plik `config.env` w katalogu głównym:

```env
EMAIL=twoj.email@gmail.com
PASSWORD=haslo-aplikacji
```

Opcjonalnie:

- `PORT` – port serwera (domyślnie 5000)
- `NODE_ENV` – `production` / inna (wpływa m.in. na trust proxy i logi)
- `TRUST_PROXY` – `true` / `false` / liczba (za reverse proxy)

## Uruchomienie

```bash
npm start
```

Serwer startuje z `nodemon` (przeładowanie przy zmianach). Domyślnie nasłuchuje na porcie 5000.

## API

### `POST /upload`

Wysyła wiadomość (i ewentualne załączniki) mailem.

**Content-Type:** `multipart/form-data` lub `application/json` (dla pól tekstowych).

**Body:**

| Pole     | Typ    | Wymagane | Opis |
|----------|--------|----------|------|
| `sender` | string | tak      | Nadawca: `Od Spottera` lub `Od Spotterki` |
| `message`| string | tak      | Treść wiadomości (3–2000 znaków) |
| `file`   | plik   | nie      | Zdjęcia (max 3), każdy max 15 MB |

**Ograniczenia:**

- Wiadomość: 3–2000 znaków
- Pliki: max 3, tylko JPEG/PNG, po 15 MB, łącznie max 20 MB
- Rate limit: 8 żądań na 15 minut na klienta

**Odpowiedzi:**

- `200` – `{ "message": "ok" }`
- `400` – `{ "error": "tekst błędu walidacji" }`
- `429` – `{ "error": "Zbyt wiele żądań, spróbuj ponownie później." }`
- `500` – `{ "error": "Wystąpił błąd serwera." }`

**CORS:** Dozwolone originy: `https://spottedlezajsk.pl`, `https://www.spottedlezajsk.pl`.

### `GET *` (dowolna ścieżka)

Odpowiedź: `x_spo` (tekst). Służy m.in. do weryfikacji działania API.

## Bezpieczeństwo

- **Helmet** – nagłówki HTTP
- **HPP** – ochrona przed parameter pollution
- **express-validator** – walidacja `sender` i `message`
- Walidacja sygnatur plików (magic bytes) – tylko prawdziwe JPEG/PNG
- Pliki tymczasowe usuwane po wysłaniu maila

## Struktura projektu

```
.
├── server.js           # Aplikacja Express, trasy, multer, rate limit
├── utils/
│   └── sendMail.js     # Nodemailer, wysyłka na EMAIL z config.env
├── config.env          # (tworzony ręcznie) EMAIL, PASSWORD
└── package.json
```

## Licencja

ISC
