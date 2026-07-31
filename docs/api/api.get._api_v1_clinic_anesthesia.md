# GET /api/v1/clinic/anesthesia

Tenant-scoped anestezi takip arama. `status`/`patientId`/
`surgeryPlanId`/`anesthesiologistId`/`dateFrom`/`dateTo`
filtreleri.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`AnesthesiaFilters`):**

- `status` (enum: `draft|finalized`) opsiyonel.
- `patientId` (string) opsiyonel.
- `surgeryPlanId` (string) opsiyonel.
- `anesthesiologistId` (string) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`AnesthesiaListResponse`):**

```json
GET /api/v1/clinic/anesthesia?status=finalized&limit=20
{
  "items": [
    {
      "id": "an-uuid",
      "surgeryPlanId": "sp-uuid",
      "patientId": "pat-uuid",
      "anesthesiaType": "general",
      "status": "finalized",
      "startedAt": "2026-08-10T10:05:00.000Z",
      "endedAt": "2026-08-10T11:30:00.000Z",
      "outcome": "Başarılı"
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

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- Oluştur: `POST /api/v1/clinic/anesthesia`
- AI chunk: `flow-anesthesia`
