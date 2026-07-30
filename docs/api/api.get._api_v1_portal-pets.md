# GET /api/v1/portal-pets

Giriş yapmış hasta sahibinin (portal kullanıcısı) sahip olduğu
**aktif** hayvanların listesini döner. Personel `PatientsService`'nden
farklıdır: `ownerId` filtresi zorunlu, `archivedAt=null` zorunlu,
PII alanları (muayene, reçete, fatura) dönmez. Sıralama oluşturulma
tarihi azalan; her öğeye son `completed` randevu tarihi (`lastVisitAt`)
türetilerek eklenir.

- **Modül:** portal-pets
- **Yetki:** `PortalSessionGuard` (`actorType: "portal_user"`,
  `role: "PET_OWNER_PORTAL"`, `source: "portal_session"`). Cookie
  `vetniva_portal_session` veya `Authorization: Bearer` header.
- **Audit:** Yok (read-only).
- **Idempotency:** N/A (GET).
- **Yan etki:** Yok.

## Request

Headers:

- `Cookie: vetniva_portal_session=<token>` **veya**
  `Authorization: Bearer <sessionToken>` — zorunlu. Geçersiz
  veya süresi dolmuşsa 401.
- `x-tenant-id` / `x-tenant-slug` — **taşınmaz**; tenant session'dan
  gelir.

Query: Yok (FAZ-0). İleride `?species=...` eklenebilir.

## Response

**200 OK (`PortalPetListResponse`):**

```json
{
  "items": [
    {
      "id": "pat-uuid-1",
      "name": "Pamuk",
      "species": "dog",
      "breed": "Golden Retriever",
      "birthDate": "2021-04-12",
      "photoUrl": null,
      "lastVisitAt": "2026-07-12T10:30:00.000Z"
    },
    {
      "id": "pat-uuid-2",
      "name": "Boncuk",
      "species": "cat",
      "breed": "Tekir",
      "birthDate": "2023-09-01",
      "photoUrl": null,
      "lastVisitAt": null
    }
  ],
  "total": 2
}
```

- `items[].id` — hasta ID.
- `items[].name` — hayvan adı.
- `items[].species` — `dog | cat | bird | rabbit | reptile | other`.
- `items[].breed` — opsiyonel; `null` olabilir.
- `items[].birthDate` — `YYYY-MM-DD` veya `null` (bilinmiyor).
- `items[].photoUrl` — FAZ-0'da her zaman `null` (FileService
  entegrasyonu sonra); Zod `optional`.
- `items[].lastVisitAt` — son `completed` randevunun `start` alanı
  (ISO 8601). Hiç completed randevu yoksa `undefined` (alan yok).
- `total` — `items.length` (pagination FAZ-0'da yok; hard cap 200).

## Hata kodları

- `VET-AUTH-0001` (401) — Portal session yok veya süresi dolmuş
  (`PortalSessionGuard`).
- `VET-AUTHZ-0001` (403) — Session'daki tenant URL'deki tenant
  ile uyuşmuyor (cross-tenant). SUPERADMIN bypass.
- `VET-CLINIC-0001` (404) — Portal user kaydı bulunamadı
  (oturum aktifken user silinmişse normalde olmaz; boş liste
  dönmek yerine burada 404 yalnızca detail'da; listede boş döner).

**Not:** Bu endpoint'te bilgi sızdırmayan 404 (cross-owner hasta
ID'si) yoktur; yalnızca `ownerId` filtresi uygulanır, liste
kendiliğinden kapsamdadır. `requireTenantScope` cross-tenant
erişimi 403 ile reddeder.

## Güvenlik notları

- `ownerId` filtre kaynağı **yalnızca** `PortalUser.ownerId`; URL
  veya body'den alınmaz. Portal user `findById` ile session'dan
  çözülür.
- `archivedAt !== null` kayıtlar **listelenmez** (kimlik gizleme).
- PII alanları (klinik not, muayene, reçete, fatura) response'da
  **yer almaz**; owner sadece temel kimlik + son ziyaret görür.
- `requireTenantScope` cross-tenant denemeyi 403 ile reddeder;
  SUPERADMIN bypass'lı.
- `PatientsService.search` zaten tenant-scoped + `limit=200` cap;
  ek rate-limit katmanı FAZ-3+.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-pet.ts`
- AI chunk: `flow-portal-pet-list`
- Detay: `GET /api/v1/portal-pets/:id`
- Auth: `POST /api/v1/portal-auth/login`
