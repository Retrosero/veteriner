# PUT /api/v1/clinic/vaccines/cards/portal-setting

Tenant için aşı kartı portal görünürlüğü ayarını günceller.
Ayar `false` yapılırsa portal endpoint'i
(`GET /api/v1/portal/vaccines/cards/patient/{id}`) 403
`VET-AUTHZ-0002` ile reddeder.

- **Modül:** vaccines (vaccine-cards)
- **Yetki:** `clinic:vaccination:read`
- **Audit:** `audit:vaccine.card.portal_setting.update` (info)

**Request body (`TenantVaccineCardPortalSettingInput`):**

```json
PUT /api/v1/clinic/vaccines/cards/portal-setting
{
  "portalVaccineCardEnabled": false
}
```

- `portalVaccineCardEnabled` (boolean) zorunlu.

**Response 200 (`TenantVaccineCardPortalSetting`):**

```json
{
  "tenantId": "tnt-uuid",
  "portalVaccineCardEnabled": false,
  "updatedAt": "2026-07-30T12:30:00.000Z",
  "updatedBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (Zod).

**Tenant izolasyonu:** Ayar tenant-scoped tek satır; UPSERT
yapısı `actor.tenantId`'ye yazılır. Başka tenant'ın ayarı
değiştirilemez. SUPERADMIN bypass'lı.

**Audit detayı:**

- `actor.actorId`, `actor.tenantId`, önceki ve yeni
  `portalVaccineCardEnabled` değeri payload'a eklenir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-card.ts`
- Getir: `GET /api/v1/clinic/vaccines/cards/portal-setting`
- AI chunk: `flow-vaccine-card`
- Audit event: `audit:vaccine.card.portal_setting.update`
