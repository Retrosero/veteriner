# GET /api/v1/clinic/hospitalizations/{hospitalizationId}/observations

Yatış sırasındaki tüm gözlemleri listeler. `category`/
`dateFrom`/`dateTo` filtreleri. Default sıralama
`observedAt ASC`.

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Query parametreleri:**

- `category` (enum) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-500, default 100).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`ObservationListResponse`):**

```json
GET /api/v1/clinic/hospitalizations/hosp-uuid/observations
{
  "items": [
    {
      "id": "obs-uuid",
      "category": "vitals",
      "observedAt": "2026-07-30T16:00:00.000Z",
      "data": { "heartRate": "80" },
      "notes": "Stabil"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.
- (404) — Yatış bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Oluştur: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/observations`
- AI chunk: `flow-discharge-summary`
