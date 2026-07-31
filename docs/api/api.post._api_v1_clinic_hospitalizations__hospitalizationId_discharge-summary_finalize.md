# POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/finalize

Taburcu özetini kapatır. `status='draft'` → `status='finalized'`.
Finalize sonrası değişiklik `amend` ile.

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:discharge` (yüksek yetki)
- **Audit:** `audit:discharge_summary.finalize` (info)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Request body:** opsiyonel (`{ note?: string }`).

**Response 200 (`DischargeSummary`):**

`DischargeSummary`; `status='finalized'`, `finalizedAt`,
`finalizedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Özet bulunamadı.
- (409) — Zaten `finalized` veya `amended`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Amend: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/amend`
- Portal paylaşım: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/portal-share`
- AI chunk: `flow-discharge-summary`
- Audit event: `audit:discharge_summary.finalize`
