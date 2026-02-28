# Endpointy localhost do testów (Postman)

Domyślny adres API:

- `http://localhost:5000`

## Work API

- `GET http://localhost:5000/api/praca`
- `GET http://localhost:5000/api/praca?limit=25`
- `GET http://localhost:5000/api/praca?limit=10&cursor=<mongo_object_id>`
- `GET http://localhost:5000/api/praca/:id`
- `GET http://localhost:5000/api/praca/:id/contact`
- `POST http://localhost:5000/api/praca/favorites`

Przykładowe body dla `POST /api/praca/favorites`:

```json
{
  "ids": ["65f0c8b7e8f1d2a3b4c5d6e7"]
}
```

## Upload API

- `POST http://localhost:5000/upload`

Body typu `form-data`:

- `sender` (text)
- `message` (text)
- `file` (file, można dodać wiele plików pod tym samym kluczem)

## Fallback route

- Każdy nieobsłużony `GET` zwraca `"x"`, np.:
  - `GET http://localhost:5000/abc`
