# GET /api/v1/payments/{id}

ID'ye göre tek tahsilat getirir. Cross-tenant → 404.

- **Modül:** payments
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`Payment`):**

`Payment` şeması için bkz. `POST /api/v1/payments`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-PAYMENT-0001` (404) — Tahsilat bulunamadı
  (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/payment.ts`
- Liste: `GET /api/v1/payments`
- Ters kayıt: `POST /api/v1/payments/{id}/reverse`
- AI chunk: `flow-payment`
