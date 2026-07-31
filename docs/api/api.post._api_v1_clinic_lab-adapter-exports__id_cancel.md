# POST /api/v1/clinic/lab-adapter-exports/{id}/cancel

Export'ı iptal eder. Yalnız `pending`/`processing`
durumda iptal edilir.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_adapter_export.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`LabAdapterExportCancelInput`):**

```json
POST /api/v1/clinic/lab-adapter-exports/lae-uuid/cancel
{
  "reason": "Dış laboratuvar bakımda"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`LabAdapterExport`):**

`LabAdapterExport`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Export bulunamadı.
- (409) — `completed`/`failed`/`cancelled` zaten
  son durumda; iptal edilemez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- Detay: `GET .../lab-adapter-exports/{id}`
- AI chunk: `flow-lab-adapter`
- Audit event: `audit:lab_adapter_export.cancel`
