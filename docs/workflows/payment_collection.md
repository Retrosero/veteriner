# İş Akışı — Tahsilat (Payment Collection)

**Kısa ad:** `payment-collection`
**Modül:** payment
**İlgili API:** `POST /api/v1/payments`
**Sayfa:** `/[locale]/clinic/sales/{saleId}/payments/new`

## Amaç
Klinik veya petshop satışı için ödeme/tahsilat kaydetmek.
Kısmi ödeme, birden fazla ödeme yöntemi ve tahsilat iptali
desteklenir.

## Aktör
- STAFF (resepsiyon/kasiyer)
- VETERINARIAN
- OWNER (kendi hayvanı için ödeme self-service — FAZ-12+)

## Tetikleyici
- Satış tamamlandıktan sonra ödeme alınır.
- Önceki borç için tahsilat yapılır.
- Sahip `customerBalances` üzerinden bakiye öder.

## Akış adımları

1. **Tahsilat formu açılır.**
   - `route = /[locale]/clinic/sales/{saleId}/payments/new`
   - Veya `/[locale]/clinic/owners/{ownerId}/payments/new` (borç için).
   - Yetki: `clinic:payment:create`.

2. **Satış veya sahip seçilir.**
   - `saleId` (spesifik satış) veya `ownerId` (genel borç).
   - Veya `customerBalanceId` (müşteri bakiyesi).

3. **Tutar girilir.**
   - `amount` (Decimal, > 0).
   - `currency` (TRY | GBP | USD | EUR).

4. **Ödeme yöntemi.**
   - `paymentMethod`: cash | card | bank_transfer | mobile | other.
   - Birden fazla yöntem: `payments[]` (array).

5. **`POST /api/v1/payments` çağrılır.**

6. **Sunucu tarafı kontrolleri:**
   - Sale mevcut ve aynı tenant'ta mı?
   - Sale daha önce iptal edilmişse: `VET-PAYMENT-0001` (409).
   - Sale zaten tamamen ödenmişse: `VET-PAYMENT-0002` (409;
     fazla ödeme).

7. **Tahsilat oluşturulur.**
   - `id` (uuid), `status = "completed"`.
   - `paidAt` = now.
   - Sale üzerinde `paidAmount += amount`.
   - Customer balance: `paidAmount += amount` (borç düşer).
   - Audit: `audit:payment.create` (info).

8. **Response 201 + `Payment` döner.**

9. **Kasa/gün sonu (GOAL-074) güncellenir.**
    - `cashRegisterSession.movements[]` yeni ödeme eklenir.
    - Audit: `audit:cash_register.movement` (info).

10. **Fiş/makbuz (PDF).**
    - `GET /api/v1/payments/{id}/pdf`.

11. **Opsiyonel: iptal (ters kayıt — GOAL-073).**
    - `POST /api/v1/payments/{id}/reverse`.
    - Yeni `PaymentReversal` kaydı; nakit kasa düzeltilir.

## Tenant izolasyonu
- Sale + customer balance aynı tenant'ta olmalı.

## Audit
- `audit:payment.create` (info).
- `audit:payment.reverse` (warning; iptal).
- `audit:cash_register.movement` (info).
- `audit:customer_balance.update` (info; bakiye değişimi).

## Hata senaryoları

| Senaryo | HTTP | Hata kodu |
|---------|------|-----------|
| Sale iptal | 409 | `VET-PAYMENT-0001` |
| Fazla ödeme | 409 | `VET-PAYMENT-0002` |
| Geçersiz tutar | 422 | `VET-VALIDATION-0010` |
| Cross-tenant | 404 | `VET-CLINIC-0001` |
| Yetkisiz | 403 | `VET-AUTHZ-0001` |

## İlgili dokümanlar
- `docs/api/api.post._api_v1_payments.md`
- `goals/GOAL-072_COMPLETION_REPORT.md`
- `goals/GOAL-073_COMPLETION_REPORT.md` (iptal)
- `goals/GOAL-074_COMPLETION_REPORT.md` (kasa)
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:payment:create`
