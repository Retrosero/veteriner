# PATCH /api/v1/petshop/sales/:id

**Modül:** `petshop`  
**Endpoint:** `docs/api/api.patch._api_v1_petshop_sales__id.md`  
**Yöntem:** `PATCH`  
**Yol:** `/api/v1/petshop/sales/:id`

## Özet

`petshop` modülündeki bu endpoint için stub doküman. GOAL-118 pilot temizliği kapsamında üretildi; detaylı şema, request/response örnekleri ve audit event açıklaması üretim öncesi tamamlanmalıdır.

## Yetkilendirme

- **Roller:** tenant'a göre değişir (OWNER, VETERINARIAN, STAFF, vb.)
- **Permission:** `petshop:*` (modüle göre detaylanır)

## Path Parametreleri

- `:id` (UUID) — Varlık ID. Cross-tenant erişim 404 döner.

## Hata Kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-PETSHOP-0001` (404) — Varlık bulunamadı.

## Audit

- **Event:** `audit:petshop.patch` (severity: info)
- **Target:** `petshop:<id>`

## Version

1.0.0
last_verified_at: 2026-08-01
