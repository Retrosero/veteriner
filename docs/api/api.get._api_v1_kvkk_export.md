# GET /api/v1/kvkk/export

Tenant verisinin JSON formatında tam export'ı (KVKK Madde 11 +
UK GDPR Madde 15). PII alanları mask'lenmeden döner (veri
sahibinin kendi verisi).

- **Modül:** kvkk
- **Yetki:** `clinic:tenant:export` (OWNER + SUPERADMIN)
- **Audit:** `audit:kvkk.export.applied` (severity: info)

**Response 200 (`KvkkTenantDataExport`):**

```json
{
  "exportedAt": "2026-08-05T12:00:00.000Z",
  "tenantId": "tnt-uuid",
  "tenantSlug": "pilot-vet-kadikoy",
  "format": "json",
  "data": {
    "owners": [],
    "patients": [],
    "examinations": [],
    "vaccinations": [],
    "prescriptions": [],
    "sales": [],
    "payments": []
  },
  "retentionNotice": {
    "message": "Tıbbi kayıtlar KVKK Madde 7 uyarınca 7 yıl, finansal kayıtlar 5 yıl saklanır.",
    "legalBasis": "KVKK_MADDE_7",
    "retentionYears": 7
  }
}
```

- `data.owners` / `data.patients` / vb. — Tenant-scoped tüm
  kayıtlar (PII mask'lenmez, veri sahibinin kendi verisi).
- `retentionNotice.legalBasis` — Yasal saklama dayanağı.
- `retentionNotice.retentionYears` — Tıbbi kayıtlar için
  saklama süresi (yıl).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.

**İlgili dokümanlar:**

- `docs/security/KVKK_DATA_LIFECYCLE.md` (GOAL-126)
- `packages/contracts/src/kvkk.ts`
