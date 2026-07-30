# GET /api/v1/clinic/patients/:patientId/ownership/active

Bir hayvana ait **aktif** (endDate=null) sahiplik kaydını getirir.
Tenant-scoped; cross-tenant erişimde hasta bulunamadı döner
(bilgi sızdırmaz). Aktif kayıt yoksa 404 `VET-CLINIC-0011`.

- **Modül:** clinic (ownership)
- **Yetki:** `clinic:patient:read` (STAFF, VETERINARIAN, OWNER
  portal `self_only`)
- **Audit:** Yok (read-only).
- **Idempotency:** N/A (GET).
- **Yan etki:** Yok.

## Request

**Path params:**

- `patientId` (UUID, zorunlu) — hasta ID. Tenant-scoped.

## Response

**200 OK (`Ownership`):**

```json
{
  "id": "own-tnt-1234-ab12cd34",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "ownerId": "ownr-uuid",
  "startDate": "2024-03-15T00:00:00.000Z",
  "endDate": null,
  "reason": "initial",
  "otherNote": null,
  "createdBy": null,
  "createdAt": "2024-03-15T09:00:00.000Z"
}
```

Aktif kayıt `endDate=null` olan tek kayıttır. Birden fazla
aktif kayıt olması durumunda 409 `VET-CLINIC-0006` fırlatılır
(veri bütünlüğü ihlali). Yeni devir için `POST .../ownership`
kullanılır.

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (404) — Hasta bulunamadı veya başka
  tenant'a ait (bilgi sızdırmaz).
- `VET-CLINIC-0006` (409) — Birden fazla aktif kayıt (veri
  bütünlüğü ihlali).
- `VET-CLINIC-0011` (404) — Aktif sahiplik kaydı yok.
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.
- `VET-VALIDATION-0001` (400) — patientId UUID değil.

## Kullanım senaryoları

- Hayvan detay sayfasında "Mevcut sahip" kartı.
- Reçete yazımı öncesi sahiplik doğrulaması.
- Portal tarafında kendi hayvanının sahibini gösterme.

## Dikkat edilecek noktalar

- **Tekil aktif kayıt:** `endDate=null` filtrelenir; birden
  fazla sonuç dönerse 409 fırlatılır (normal veri akışında
  mümkün değildir; manuel SQL düzeltmesi gerekir).
- **Tenant izolasyonu:** `findActiveByPatient` repository
  katmanında `tenantId` filtresi ile sorgular; başka
  tenant'ın aktif kaydı dönmez.
- **Append-only:** Aktif kayıt silinmez; `POST .../ownership`
  ile devir yapılır ve eski kayıt `endDate` ile kapatılır.
- **KVKK:** Aktif kayıt owner PII içermez (yalnızca ID);
  UI sahip bilgisi için `GET /api/v1/clinic/owners/{id}`
  çağrısı yapar.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/ownership.ts`
  (sahiplik tipleri)
- Domain modeli: `apps/api/src/common/ownership/ownership.types.ts`
- Modül: `apps/api/src/modules/ownership-history/ownership-history.service.ts`
- Liste: `api.get._api_v1_clinic_patients__patientId_ownership.md`
- Devir: `api.post._api_v1_clinic_patients__patientId_ownership.md`
- Hayvan: `api.get._api_v1_clinic_patients__id.md`
