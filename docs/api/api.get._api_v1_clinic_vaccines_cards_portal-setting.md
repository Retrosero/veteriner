# GET /api/v1/clinic/vaccines/cards/portal-setting

Tenant için aşı kartı portal görünürlüğü ayarını getirir. Ayar
`tenantVaccineCardSetting` tablosunda tenant başına tek satır
tutulur; kayıt yoksa default `{ portalVaccineCardEnabled: true }`
döner.

- **Modül:** vaccines (vaccine-cards)
- **Yetki:** `clinic:vaccination:read`
- **Audit:** yok (salt okunur)

**Response 200 (`TenantVaccineCardPortalSetting`):**

```json
GET /api/v1/clinic/vaccines/cards/portal-setting
{
  "tenantId": "tnt-uuid",
  "portalVaccineCardEnabled": true,
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "updatedBy": "usr-uuid"
}
```

- `portalVaccineCardEnabled` (boolean) — `false` ise portal
  endpoint'i (`GET /api/v1/portal/vaccines/cards/patient/{id}`)
  403 `VET-AUTHZ-0002` döner.
- `updatedAt` (ISO 8601 datetime) — son güncelleme zamanı.
- `updatedBy` (string|null) — son güncelleyen kullanıcı.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**Tenant izolasyonu:** Ayar tenant-scoped tek satır; başka
tenant'ın ayarı görünmez. SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-card.ts`
- Güncelle: `PUT /api/v1/clinic/vaccines/cards/portal-setting`
- AI chunk: `flow-vaccine-card`
- Audit event: `audit:vaccine.card.portal_setting.update`
  (PUT tarafında)
