# POST /api/v1/clinic/patients/:id/transfer

Hayvanın sahipliğini yeni bir owner'a devreder. Bu goal
(**GOAL-022**) **kimlik seviyesinde** bir devirdir: yalnızca
`Patient.ownerId` alanı güncellenir. Tam tarihsel `PatientOwnership`
kaydı + aktif/arşiv ilişki yönetimi `OwnershipHistoryService`
(FAZ-2 ileri) ile gelecektir.

Tenant bağlamı `actor.tenantId`'den alınır (URL'de taşınmaz — cross-
tenant IDOR koruması). Hem mevcut hasta hem yeni owner aynı
tenant'ta olmalıdır; aksi durumda 404 (bilgi sızdırmaz).

- **Modül:** clinic (patient)
- **Yetki:** `clinic:patient:transfer` (STAFF, VETERINARIAN)
- **Audit:** `audit:patient.transfer` (severity: **warning**) —
  before/after `ownerId/ownerName/ownerEmail/ownerPhone`; PII
  alanları `AuditService PiiMasker` ile mask'lenir.
- **Idempotency:** Önerilir (`Idempotency-Key` header, FAZ-3+ ile
  zorunlu olacak).
- **Yan etki:** In-memory `transferAudit` map'e `txf-<tenant8>-
  <uuid8>` anahtarla kayıt; ileride admin görünümü ve DB
  persistence için temel.

## Request

**Path params:**

- `id` (UUID, zorunlu) — hasta ID. Tenant-scoped.

**Body (`PatientOwnershipTransferInput`):**

```json
{
  "newOwnerId": "own-uuid-yeni-sahip",
  "reason": "Mülkiyet devir sözleşmesi imzalandı (2026-07-30)."
}
```

- `newOwnerId` (UUID, zorunlu) — yeni sahip. Aynı tenant'ta olmalı.
- `reason` (string, zorunlu) — 1-500 karakter. Audit metadata'da
  saklanır; KVKK uyumu için klinik not içermesi önerilir.

## Response

**200 OK (`TransferResult`):**

```json
{
  "patient": {
    "id": "pat-uuid",
    "tenantId": "tnt-uuid",
    "ownerId": "own-uuid-yeni-sahip",
    "name": "Boncuk",
    "species": "dog",
    "breed": "Golden Retriever",
    "birthDate": "2022-04-15",
    "gender": "female",
    "microchip": "123456789012345",
    "color": "Kahverengi",
    "neutered": true,
    "notes": "Sahibine bağlı, sosyal.",
    "createdAt": "2026-06-01T10:00:00.000Z",
    "archivedAt": null
  },
  "transferId": "txf-tnt-1234-ab12cd34"
}
```

`patient` güncel sahibiyle döner; `transferId` in-memory transfer
audit map'e yazılan tekil kayıt kimliğidir.

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-CLINIC-0001` (404) — Hasta bulunamadı (cross-tenant dahil).
- `VET-AUTHZ-0002` (404) — Yeni sahip bulunamadı (cross-tenant
  dahil).
- `VET-CLINIC-0005` (422) — Hasta arşivli; aktif devre kapalı.
- `VET-CLINIC-0007` (422) — Aynı owner'a transfer (no-op).

## Kullanım senaryoları

- Sahiplik satışı / hibe sonrası klinik kaydının yeni sahibe
  taşınması.
- Müşteri ayrılışı: aynı hayvan başka klinikte takip edilecekse
  yeni owner atanır.
- Evlat edinme sonrası kayıt güncelleme.

## Dikkat edilecek noktalar

- Sahiplik devri **kimlik seviyesindedir**: mevcut klinik
  muayene/aşı/reçete geçmişi korunur, ownerId alanı değişir. Tam
  `PatientOwnership` tarihçesi `OwnershipHistoryService` ile ileride
  gelecek.
- **Aynı kişiye transfer** 422 ile reddedilir (no-op, audit
  yazılmaz, transferId üretilmez).
- **Arşivli hasta** için yeni hasta kaydı açılmalıdır; arşivden
  çıkarma henüz desteklenmiyor.
- Devir öncesi yasal onay (sözleşme/imza) UI tarafında alınmalı;
  backend yalnızca `reason` metnini saklar.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/patient.ts`
  (`patientOwnershipTransferInputSchema`) + `ownership.ts`
- Akış: `docs/ai/AI_CHUNKS.yaml` → `flow-ownership-transfer`
- Hata: `error-VET-CLINIC-0005`, `error-VET-CLINIC-0007`
- Hasta: `api.post._api_v1_clinic_patients.md`,
  `api.get._api_v1_clinic_patients__id.md`
- Sahip: `api.post._api_v1_clinic_owners.md`
