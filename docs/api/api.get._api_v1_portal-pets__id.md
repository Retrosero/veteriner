# GET /api/v1/portal-pets/:id

Giriş yapmış hasta sahibinin sahip olduğu **tek aktif hayvanın**
detayını döner. Cross-tenant, archived, veya başka sahibin hayvanı
için **bilgi sızdırmayan 404** döner (sabit `VET-CLINIC-0001`;
403 kullanılmaz — owner var mı yok mu ayırt edilemez).

- **Modül:** portal-pets
- **Yetki:** `PortalSessionGuard`. `actorType: "portal_user"`,
  `role: "PET_OWNER_PORTAL"`, `source: "portal_session"`.
- **Audit:** Yok (read-only).
- **Idempotency:** N/A (GET).
- **Yan etki:** Yok.

## Request

**Path params:**

- `id` (UUID, zorunlu) — `ParseUUIDPipe` ile doğrulanır. UUID
  formatı geçersizse 400 `VET-VALIDATION-0001`.

**Headers:**

- `Cookie: vetniva_portal_session=<token>` **veya**
  `Authorization: Bearer <sessionToken>` — zorunlu.

## Response

**200 OK (`PortalPetDetail`):**

```json
{
  "id": "pat-uuid-1",
  "name": "Pamuk",
  "species": "dog",
  "breed": "Golden Retriever",
  "birthDate": "2021-04-12",
  "gender": "female",
  "microchip": "900123456789012",
  "color": "Krem",
  "neutered": true,
  "notes": "Sakin ama gürültüden hoşlanmaz.",
  "ownerId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "alertsCount": 2,
  "nextVaccinationDate": "2026-09-15T00:00:00.000Z"
}
```

- `gender` — `male | female | unknown`.
- `microchip` — ISO 11784/11785 microchip numarası veya `null`.
- `color` — kısa renk açıklaması veya `null`.
- `neutered` — kısırlaştırıldı bilgisi (boolean).
- `notes` — owner tarafından da görülebilen kısa not; **klinik
  iç not döndürülmez** (FAZ-0'da `notes` alanı sadece owner-visible).
- `ownerId` — hayvan sahibinin ID'si; doğrulama `actor` ile değil
  `PortalUser.ownerId` ile yapılır.
- `alertsCount` — `AlertsService.getActiveAlertsForPatient` sonuc
  uzunluğu; aktif uyarı sayısı (0 olabilir).
- `nextVaccinationDate` — FAZ-0'da her zaman `undefined` (alan
  yok); vaccination modülü (FAZ-4) sonrası dolar.

## Hata kodları

- `VET-AUTH-0001` (401) — Portal session yok veya süresi dolmuş.
- `VET-AUTHZ-0001` (403) — Cross-tenant session.
- `VET-VALIDATION-0001` (400) — `:id` UUID formatı geçersiz
  (`ParseUUIDPipe`).
- `VET-CLINIC-0001` (404) — Aşağıdaki dört durumun hepsi aynı
  sabit 404 ile döner (bilgi sızdırmaz):
  1. Portal user kaydı session'da var olmasına rağmen bulunamadı.
  2. `PatientsService.findById` cross-tenant → null.
  3. Hasta `archivedAt !== null` (arşivli hasta).
  4. `patient.ownerId !== portalUser.ownerId` (başka sahibin hayvanı).

## Güvenlik notları

- **404 sabit kod:** Cross-tenant, archived, veya owner uyuşmazlığı
  durumlarının hepsi `VET-CLINIC-0001` ile aynı mesajı döner
  ("Hayvan bulunamadı"). 403 kullanılmaz; hasta varlığı
  enumeration'a kapalıdır.
- **`requireTenantScope`:** Session `tenantId` ile route
  `tenantId` uyuşmazsa 403; SUPERADMIN bypass.
- **PII sızıntısı yok:** Klinik iç not, muayene, reçete, fatura
  alanları response'da **yer almaz**.
- **`alertsCount`:** `AlertsService.getActiveAlertsForPatient`
  zaten tenant-scoped; ek authz kontrolü gerekmez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-pet.ts`
- AI chunk: `flow-portal-pet-list`
- Liste: `GET /api/v1/portal-pets`
- Auth: `POST /api/v1/portal-auth/login`
