# PATCH /api/v1/clinic/cages/:id

**Modül:** `clinic`  
**Endpoint:** `docs/api/api.patch._api_v1_clinic_cages__id.md`  
**Yöntem:** `PATCH`  
**Yol:** `/api/v1/clinic/cages/:id`

## Özet

`clinic` modülündeki bu endpoint için stub doküman. GOAL-118 pilot temizliği kapsamında üretildi; detaylı şema, request/response örnekleri ve audit event açıklaması üretim öncesi tamamlanmalıdır.

## Yetkilendirme

- **Roller:** tenant'a göre değişir (OWNER, VETERINARIAN, STAFF, vb.)
- **Permission:** `clinic:*` (modüle göre detaylanır)

## Path Parametreleri

- `:id` (UUID) — Varlık ID. Cross-tenant erişim 404 döner.

## Hata Kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-CLINIC-0001` (404) — Varlık bulunamadı.

## Audit

- **Event:** `audit:clinic.patch` (severity: info)
- **Target:** `clinic:<id>`

## Version

1.0.0
last_verified_at: 2026-08-01
