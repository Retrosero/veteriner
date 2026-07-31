# GET /api/v1/cash-register/sessions/:id

**Modül:** `cash-register`  
**Endpoint:** `docs/api/api.get._api_v1_cash-register_sessions__id.md`  
**Yöntem:** `GET`  
**Yol:** `/api/v1/cash-register/sessions/:id`

## Özet

`cash-register` modülündeki bu endpoint için stub doküman. GOAL-118 pilot temizliği kapsamında üretildi; detaylı şema, request/response örnekleri ve audit event açıklaması üretim öncesi tamamlanmalıdır.

## Yetkilendirme

- **Roller:** tenant'a göre değişir (OWNER, VETERINARIAN, STAFF, vb.)
- **Permission:** `cash-register:*` (modüle göre detaylanır)

## Path Parametreleri

- `:id` (UUID) — Varlık ID. Cross-tenant erişim 404 döner.

## Hata Kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-CASH-REGISTER-0001` (404) — Varlık bulunamadı.

## Audit

- **Event:** `audit:cash-register.get` (severity: info)
- **Target:** `cash-register:<id>`

## Version

1.0.0
last_verified_at: 2026-08-01
