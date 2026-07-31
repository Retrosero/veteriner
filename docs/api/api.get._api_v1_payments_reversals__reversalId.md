# GET /api/v1/payments/reversals/:reversalId

**Modül:** `payments`  
**Endpoint:** `docs/api/api.get._api_v1_payments_reversals__reversalId.md`  
**Yöntem:** `GET`  
**Yol:** `/api/v1/payments/reversals/:reversalId`

## Özet

`payments` modülündeki bu endpoint için stub doküman. GOAL-118 pilot temizliği kapsamında üretildi; detaylı şema, request/response örnekleri ve audit event açıklaması üretim öncesi tamamlanmalıdır.

## Yetkilendirme

- **Roller:** tenant'a göre değişir (OWNER, VETERINARIAN, STAFF, vb.)
- **Permission:** `payments:*` (modüle göre detaylanır)

## Path Parametreleri

- `:id` (UUID) — Varlık ID. Cross-tenant erişim 404 döner.

## Hata Kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-PAYMENTS-0001` (404) — Varlık bulunamadı.

## Audit

- **Event:** `audit:payments.get` (severity: info)
- **Target:** `payments:<id>`

## Version

1.0.0
last_verified_at: 2026-08-01
