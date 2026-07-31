# POST /api/v1/inventory/clinical-consumptions/:id/cancel

**Modül:** `inventory`  
**Endpoint:** `docs/api/api.post._api_v1_inventory_clinical-consumptions__id_cancel.md`  
**Yöntem:** `POST`  
**Yol:** `/api/v1/inventory/clinical-consumptions/:id/cancel`

## Özet

`inventory` modülündeki bu endpoint için stub doküman. GOAL-118 pilot temizliği kapsamında üretildi; detaylı şema, request/response örnekleri ve audit event açıklaması üretim öncesi tamamlanmalıdır.

## Yetkilendirme

- **Roller:** tenant'a göre değişir (OWNER, VETERINARIAN, STAFF, vb.)
- **Permission:** `inventory:*` (modüle göre detaylanır)

## Path Parametreleri

- `:id` (UUID) — Varlık ID. Cross-tenant erişim 404 döner.

## Hata Kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-INVENTORY-0001` (404) — Varlık bulunamadı.

## Audit

- **Event:** `audit:inventory.post` (severity: info)
- **Target:** `inventory:<id>`

## Version

1.0.0
last_verified_at: 2026-08-01
