# POST /api/v1/clinic/owners

Yeni hasta sahibi (owner) kaydı oluşturur. Tenant bağlamı
`actor.tenantId`'den alınır (URL'de taşınmaz — cross-tenant IDOR
koruması).

- **Modül:** clinic (owner)
- **Yetki:** `clinic:owner:create` (STAFF, VETERINARIAN, OWNER)
- **Idempotency:** Önerilir (`Idempotency-Key` header, GOAL-021+ ile
  zorunlu olacak)
- **Audit:** `audit:owner.create` (severity: info)

**Request body (`OwnerCreateInput`):**

```json
{
  "firstName": "Ayşe",
  "lastName": "Yılmaz",
  "phone": "05321234567",
  "email": "ayse@example.com",
  "taxId": "12345678950",
  "address": { "city": "Istanbul", "district": "Kadıköy" },
  "consentKvkk": true,
  "consentMarketing": false
}
```

- `phone` — Ham telefon; service E.164 (`+90XXXXXXXXXX`) formatına
  normalize eder. TR mobil `5XX` ile başlamalıdır.
- `taxId` — 11 hane → TCKN, 10 hane → VKN. Algoritmik doğrulama
  (ülke adaptörü) uygulanır.
- `consentKvkk` — Zorunlu; `false` → 422 `VET-VALIDATION-0002`.
- `consentMarketing` — Opsiyonel (default `false`).

**Response 201 (`Owner`):**

```json
{
  "id": "own-uuid",
  "tenantId": "tnt-uuid",
  "firstName": "Ayşe",
  "lastName": "Yılmaz",
  "phone": "+905321234567",
  "email": "ayse@example.com",
  "taxId": "12345678950",
  "address": { "city": "Istanbul", "district": "Kadıköy" },
  "consents": { "kvkk": true, "marketing": false },
  "createdAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-VALIDATION-0002` (422) — `consentKvkk=false` veya zorunlu
  alan eksik.
- `VET-VALIDATION-0003` (422) — Telefon formatı geçersiz.
- `VET-VALIDATION-0006` (422) — TCKN/VKN algoritmik doğrulama
  başarısız.
- `VET-CLINIC-0002` (409) — Aynı tenant'ta aynı telefonla kayıt var.

**Kullanım senaryoları:**

- Resepsiyon: yeni hasta geldiğinde ilk kayıt.
- Portal daveti öncesi (GOAL-033) owner oluşturma.
- Telefon değişikliği yerine yeni owner (devri `flow-ownership-transfer`).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/owner.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Owner)
- AI chunk: `flow-owner-create`, `error-VET-CLINIC-0002`,
  `kvkk-consent-owner-create`
