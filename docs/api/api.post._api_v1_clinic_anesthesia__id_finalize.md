# POST /api/v1/clinic/anesthesia/{id}/finalize

Anestezi takibini kapatır. `status='draft'` → `status='finalized'`.
`outcome` (mortality/uneventful_recovery/minor_complications/
major_complications) zorunlu.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:finalize` (yüksek yetki)
- **Audit:** `audit:anesthesia.finalize` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`AnesthesiaFinalizeInput`):**

```json
POST /api/v1/clinic/anesthesia/an-uuid/finalize
{
  "outcome": "uneventful_recovery",
  "recoveryTime": "15",
  "postOpNotes": "Stabil uyandı",
  "complicationsSummary": "Minor hipotansiyon (düzeltildi)"
}
```

- `outcome` (enum) zorunlu.
- `recoveryTime` (integer, dakika) opsiyonel.
- `postOpNotes` (string) opsiyonel.
- `complicationsSummary` (string) opsiyonel.

**Response 200 (`Anesthesia`):**

`Anesthesia`; `status='finalized'`, `endedAt`,
`finalizedBy`, `outcome` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Anestezi bulunamadı.
- (409) — Zaten `finalized`.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Ameliyat planı etkisi:** `surgeryPlan.completed` ile
eşleşir (otomatik plan complete edilebilir; GOAL-080).

**Audit detayı:** `outcome` + `complicationsSummary` +
`recoveryTime` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- Detay: `GET /api/v1/clinic/anesthesia/{id}`
- Ameliyat: `flow-surgery-plan` (GOAL-080)
- AI chunk: `flow-anesthesia`
- Audit event: `audit:anesthesia.finalize`
