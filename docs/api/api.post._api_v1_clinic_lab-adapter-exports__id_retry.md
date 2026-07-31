# POST /api/v1/clinic/lab-adapter-exports/{id}/retry

Başarısız export'ı yeniden dene. `status='failed'`
→ `'pending'`. `attemptCount++`. 3 deneme sonrası
kalıcı `failed`.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:order`
- **Audit:** `audit:lab_adapter_export.retry` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body:** opsiyonel (`{ reason?: string }`).

**Response 200 (`LabAdapterExport`):**

`LabAdapterExport`; `status='pending'`,
`attemptCount++`, `lastRetryAt` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Export bulunamadı.
- (409) — Yalnızca `failed`/`rejected` retry edilebilir.
- (409) — `attemptCount > 3` (kalıcı failed).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- Detay: `GET .../lab-adapter-exports/{id}`
- AI chunk: `flow-lab-adapter`
- Audit event: `audit:lab_adapter_export.retry`
