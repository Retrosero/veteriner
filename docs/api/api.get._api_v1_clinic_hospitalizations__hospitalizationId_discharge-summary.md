# GET /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary

Yatışın taburcu özeti detayı. Cross-tenant → 404.

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Response 200 (`DischargeSummary`):**

`DischargeSummary`; `medications[]` + amendments[] dahil.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Yatış veya özet bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Oluştur: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- AI chunk: `flow-discharge-summary`
