# GET /api/v1/clinic/surgery-plans

Tenant-scoped ameliyat planı arama. `patientId`/`surgeonId`/
`status`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** surgery-plans
- **Yetki:** `clinic:surgery:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`SurgeryPlanFilters`):**

- `patientId` (string) opsiyonel.
- `surgeonId` (string) opsiyonel.
- `status` (enum: `planned|in_progress|completed|cancelled`)
  opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`SurgeryPlanListResponse`):**

```json
GET /api/v1/clinic/surgery-plans?status=planned&dateFrom=2026-08-01
{
  "items": [
    {
      "id": "sp-uuid",
      "patientId": "pat-uuid",
      "surgeonId": "usr-uuid",
      "scheduledAt": "2026-08-10T10:00:00.000Z",
      "procedureName": "Kısırlaştırma (OVH)",
      "status": "planned"
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

- API sözleşmesi: `packages/contracts/src/surgery-plan.ts`
- Oluştur: `POST /api/v1/clinic/surgery-plans`
- AI chunk: `flow-surgery-plan`
