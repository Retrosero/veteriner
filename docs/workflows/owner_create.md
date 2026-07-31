# İş Akışı — Hasta Sahibi Ekleme (Owner Create)

**Kısa ad:** `owner-create`
**Modül:** owner
**İlgili API:** `POST /api/v1/owner/owners`
**Sayfa:** `/[locale]/clinic/owners/new`

## Amaç
Kliniğe gelen hayvanın yasal sahibini kayıt altına almak.
İlk temas anında veya daha sonra gerçekleşebilir.

## Aktör
- VETERINARIAN
- STAFF (resepsiyon)

## Tetikleyici
- Hayvan sahibi kliniğe gelir.
- Telefon / e-posta ile randevu talebi gelir.
- Mevcut sahiplik devri (ownership transfer) başlatılır.

## Akış adımları

1. **Aktör bilgileri formunu açar.**
   - `route = /[locale]/clinic/owners/new`
   - Yetki: `clinic:owner:create`.

2. **Zorunlu alanları doldurur.**
   - `firstName`, `lastName` (string, max 100).
   - `phone` (E.164).
   - `email` (opsiyonel, RFC 5322).
   - `taxId` (opsiyonel; VKN 10 veya TCKN 11 hane).
   - `address` (opsiyonel).

3. **Form doğrulanır.**
   - PII mask context'ten geçer.
   - Validation hatası: `VET-VALIDATION-0002` (422) veya
     `VET-VALIDATION-0003` (422).

4. **`POST /api/v1/owner/owners` çağrılır.**

5. **Sunucu tarafı kontrolleri:**
   - Aynı `phone` ile kayıt var mı? Varsa:
     `VET-OWNER-0001` (409) — duplicate.

6. **Sahip kaydı oluşturulur.**
   - `id` (uuid) atanır.
   - `tenantId = actor.tenantId`.
   - `createdById = actor.actorId`.
   - `createdAt = now()`.
   - Audit: `audit:owner.create` (info).

7. **Response 201 + `Owner` payload döner.**

8. **UI sahip detay sayfasına yönlendirir.**
   - `/[locale]/clinic/owners/{id}`.
   - Toast: "Sahip kaydı oluşturuldu".

9. **Opsiyonel: hayvan ekleme akışına yönlendirilir.**
   - CTA: "Şimdi hayvan ekle".

## Tenant izolasyonu
- Tüm CRUD tenant-scoped.
- Cross-tenant erişim → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).

## Audit
- `audit:owner.create` (info).
- `audit:owner.read` (info; listeleme/detay).

## Hata senaryoları

| Senaryo | HTTP | Hata kodu | Çözüm |
|---------|------|-----------|-------|
| Duplicate phone | 409 | `VET-OWNER-0001` | Aynı telefonla sahip zaten kayıtlı; mevcudu bul. |
| Geçersiz telefon | 422 | `VET-VALIDATION-0004` | E.164 formatında gir. |
| Geçersiz TCKN | 422 | `VET-VALIDATION-0006` | 11 hane gir. |
| Geçersiz VKN | 422 | `VET-VALIDATION-0005` | 10 hane gir. |
| Cross-tenant | 404 | `VET-CLINIC-0001` | Tenant sınırı; kontrolü yap. |
| Yetkisiz | 403 | `VET-AUTHZ-0001` | `clinic:owner:create` gerekli. |

## İlgili dokümanlar
- `docs/api/api.post._api_v1_owner_owners.md`
- `docs/pages/web.app.locale.clinic.owners.yaml` (planlanan)
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:owner:create`
- `goals/GOAL-020_COMPLETION_REPORT.md`
