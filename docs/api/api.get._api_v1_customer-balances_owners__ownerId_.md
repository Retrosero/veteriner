# GET /api/v1/customer-balances/owners/{ownerId}

Hasta sahibinin güncel bakiyesi: toplam borç, toplam
alacak, net bakiye. Hesaplama Faz 7 tahsilat (GOAL-072) +
ters kayıt (GOAL-073) + petshop sale return (GOAL-065
refundMethod='credit') + Faz 8 kısmi tahsilat üzerinden.

- **Modül:** customer-balances
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `ownerId` (UUID) zorunlu.

**Response 200 (`CustomerBalance`):**

```json
GET /api/v1/customer-balances/owners/own-uuid
{
  "ownerId": "own-uuid",
  "totalDebit": "500.00",
  "totalCredit": "200.00",
  "netBalance": "300.00",
  "currency": "TRY",
  "lastTransactionAt": "2026-07-30T14:00:00.000Z",
  "openInvoiceCount": 1
}
```

- `totalDebit` (Decimal) — tahsil edilmemiş sale toplamı
  (borç).
- `totalCredit` (Decimal) — refund 'credit' + manuel
  alacaklar.
- `netBalance` (Decimal) — `totalDebit - totalCredit` (≥0
  olabilir; negatif = kredi bakiye).
- `currency` (ISO 4217).
- `lastTransactionAt` (ISO datetime|null) — son hareket.
- `openInvoiceCount` (integer) — açık fatura/satış adedi.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Owner bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** Cross-tenant ownerId → 404. SUPERADMIN
bypass'lı.

**Hesaplama:** Atomic sorgu anında hesaplanır (cache'lenmez).
Faz 7 tahsilat + ters kayıt + petshop refund credit +
manuel hareketler dahil.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/customer-balance.ts`
- İşlemler: `GET /api/v1/customer-balances/owners/{ownerId}/transactions`
- Tahsilat: `flow-payment`
- AI chunk: `flow-customer-balance`
