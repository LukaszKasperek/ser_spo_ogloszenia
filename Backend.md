# Backend API - dokumentacja pod Next.js 16+

Ten backend to serwer `Express + TypeScript + MongoDB` z dwoma glownymi obszarami:

- API ogloszen pracy (`/api/praca...`)
- endpoint uploadu formularza (`/upload`)

Dokument ma pomoc szybko podpiac frontend (Next.js 16+, Server Actions) bez zgadywania kontraktu API.

## Stack i uruchomienie

- Runtime: Node.js
- Framework: `express`
- Baza: `mongoose` (MongoDB)
- Walidacja:
  - `zod` dla API ogloszen
  - `express-validator` dla uploadu
- Upload plikow: `multer` (tmp dir w systemie)
- Wysylka maili: `nodemailer`

Skrypty:

- `npm run dev` - uruchomienie developerskie (`tsx src/server.ts`)
- `npm run test` - testy
- `npm run seed` - seed danych

## Architektura plikow (najwazniejsze)

- `src/server.ts` - bootstrap aplikacji, ladowanie `.env`, start serwera, graceful shutdown
- `src/app.ts` - konfiguracja middleware, CORS, rate limit, rejestracja route'ow
- `src/routes/work.ts` - endpointy `GET/POST` dla ogloszen
- `src/controllers/workController.ts` - logika listy, detalu, kontaktu, ulubionych
- `src/validation/workSchemas.ts` - kontrakty request/response (Zod)
- `src/models/workModel.ts` - schema Mongoose (`collection: praca`)
- `src/routes/upload.ts` + `src/controllers/uploadController.ts` - formularz + pliki
- `src/utils/sendMail.ts` - transport SMTP i wysylka maila
- `src/middleware/errorHandler.ts` - globalna obsluga bledow uploadu

## Middleware i bezpieczenstwo

Wlaczone globalnie:

- `helmet` (wzmocnione naglowki; CSP wylaczone)
- `hpp` (ochrona przed HTTP Parameter Pollution)
- `express.json({ limit: '100kb' })`
- `cors`:
  - domyslnie tylko:
    - `https://spottedlezajsk.pl`
    - `https://www.spottedlezajsk.pl`
  - mozna nadpisac env: `CORS_ORIGINS` (CSV)
- `rateLimit`:
  - dla `/api`: `120` zadan / `15 min`
  - dla `/upload`: `8` zadan / `15 min`

Uwaga pod frontend lokalny:

- jesli frontend Next dziala np. na `http://localhost:3000`, trzeba dopisac origin w `CORS_ORIGINS`.

## Konfiguracja ENV

### MongoDB (wymagane)

- `MONGODB_DB_NAME`
- `MONGODB_USER`
- `MONGODB_PASSWORD`
- opcjonalnie:

  - `MONGODB_HOST` (default: `mongo56.mydevil.net`)
  - `MONGODB_PORT` (default: `27017`)
  - `MONGODB_PROTOCOL` (`mongodb` lub `mongodb+srv`, default: `mongodb`)

### Aplikacja

- `PORT` (default: `5000`)
- `NODE_ENV` (`production` wplywa m.in. na `trust proxy`)
- `TRUST_PROXY` (`true` / `false` / liczba)
- `CORS_ORIGINS` (CSV do whitelisty originow)

### E-mail (upload)

- `EMAIL`
- `PASSWORD`

Brak poprawnej konfiguracji SMTP spowoduje blad `500` na `/upload`.

## Model danych: ogloszenie pracy

Kolekcja Mongo: `praca`

Pola:

- `_id: ObjectId`
- `slug: string` (unique)
- `title: string`
- `description: string`
- `tags: string[]`
- `createdAt: Date`
- `contact: { email?: string; address?: string; phone?: string }` (domyslnie ukryte, `select: false`)
- `author: string` (ukryte, `select: false`)

Indeks:

- `{ createdAt: -1, _id: -1 }`

## API: /api/praca

### 1) Lista ogloszen

- **GET** `/api/praca`
- Query:
  - `limit?: number` (1..25, default 25)
  - `cursor?: string` (ObjectId)

Paginacja:

- sortowanie po `_id` malejaco
- cursor-based pagination (`_id < cursor`)
- odpowiedz zwraca `items` i `nextCursor`

Przyklad odpowiedzi `200`:

```json
{
  "items": [
    {
      "_id": "65f0...",
      "slug": "kierowca-kat-b",
      "title": "Kierowca kat. B",
      "description": "...",
      "tags": ["etat"],
      "createdAt": "2026-02-20T10:00:00.000Z"
    }
  ],
  "nextCursor": "65ef..."
}
```

Bledy:

- `400` - niepoprawny query (`limit`, `cursor`)

### 2) Szczegoly ogloszenia

- **GET** `/api/praca/:id`
- `id` musi byc poprawnym `ObjectId`
- pola ukryte (`author`, `contact`) nie sa zwracane

Bledy:

- `400` - zle ID
- `404` - ogloszenie nie istnieje

### 3) Kontakt do ogloszenia

- **GET** `/api/praca/:id/contact`
- zwraca tylko `contact` i dodatkowo waliduje shape odpowiedzi

Przyklad odpowiedzi `200`:

```json
{
  "contact": {
    "email": "firma@example.com",
    "phone": "+48 123 456 789"
  }
}
```

Bledy:

- `400` - zle ID
- `404` - brak ogloszenia
- `500` - kontakt w bazie ma zly format

### 4) Ulubione (batch lookup)

- **POST** `/api/praca/favorites`
- Body:

```json
{
  "ids": ["65f0...", "65f1..."]
}
```

Zasady:

- `ids`: min 1, max 100
- kazde ID musi byc `ObjectId`
- backend usuwa duplikaty ID przed zapytaniem

Przyklad odpowiedzi `200`:

```json
{
  "found": [
    {
      "_id": "65f0...",
      "slug": "kierowca-kat-b",
      "title": "Kierowca kat. B",
      "description": "...",
      "tags": ["etat"],
      "createdAt": "2026-02-20T10:00:00.000Z"
    }
  ],
  "missing": [
    {
      "id": "65f1...",
      "message": "Ogłoszenie nie aktualne."
    }
  ]
}
```

Bledy:

- `400` - niepoprawny body

## API: /upload (formularz + pliki)

- **POST** `/upload`
- `Content-Type: multipart/form-data`

Pola:

- `sender: string` - dozwolone:
  - `Od Spottera`
  - `Od Spotterki`
- `message: string` - dlugosc `3..2000`
- `file` - tablica plikow (do 3 sztuk)

Limity:

- max 3 pliki
- max 15 MB na pojedynczy plik
- max 20 MB lacznie
- MIME: `image/jpeg`, `image/png`, `image/jpg`
- dodatkowo backend sprawdza sygnature binarna JPG/PNG (nie tylko MIME)

Odpowiedz sukces:

```json
{
  "message": "ok"
}
```

Typowe bledy:

- `400` - walidacja formularza lub zly typ/rozmiar pliku
- `429` - rate limit
- `500` - blad wysylki maila / blad serwera

## Konwencja bledow (dla frontu)

W praktyce backend zwykle zwraca:

```json
{ "error": "..." }
```

lub dla sukcesu:

```json
{ "message": "ok" }
```

Dlatego frontend powinien:

- zawsze sprawdzac `response.ok`
- dla bledow parsowac `error` z JSON (fallback na tekst domyslny)

## Integracja z Next.js 16+ (Server Actions)

Rekomendowany podzial:

- Server Actions do mutacji:
  - `submitUploadAction(formData)` -> `POST /upload`
  - `fetchFavoritesAction(ids)` -> `POST /api/praca/favorites`
- Server Components / fetch na serwerze do odczytu:

  - lista: `GET /api/praca?limit=...&cursor=...`
  - detal: `GET /api/praca/:id`
  - kontakt: `GET /api/praca/:id/contact`

Wazne:

- przekazuj `cache: 'no-store'` tam, gdzie dane maja byc swieze
- dla listy mozna rozwazyc cache + revalidacje zaleznie od UX
- dla uploadu wysylaj `FormData` (nie JSON)
- zadbaj o obsluge `429` i przyjazny komunikat retry na froncie

Przyklad helpera serwerowego (frontend):

```ts
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const baseUrl = process.env.BACKEND_URL!;
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? 'Wystapil blad API');
  }

  return data as T;
}
```

## Minimalna checklista przed startem frontu

- ustaw `BACKEND_URL` w projekcie Next (np. `http://localhost:5000`)
- dodaj origin frontu do `CORS_ORIGINS` w backendzie
- uzupelnij ENV Mongo oraz SMTP
- uruchom backend i zweryfikuj:

  - `GET /api/praca`
  - `GET /api/praca/:id`
  - `GET /api/praca/:id/contact`
  - `POST /api/praca/favorites`
  - `POST /upload` (multipart)

---

Jesli chcesz, moge w kolejnym kroku przygotowac od razu gotowy szkielet `lib/backend.ts` + zestaw typow TS pod te endpointy do bezposredniego wklejenia w Next.js.
