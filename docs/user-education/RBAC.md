# VetNiva — Yetkilendirme ve Roller (RBAC) Rehberi

Bu rehber, VetNiva'nın rol-bazlı erişim kontrolü (RBAC) modelini
ve her rolün günlük iş akışındaki yetkilerini açıklar. GOAL-012
kapsamında uygulanan RBAC altyapısı, 113+ permission anahtarını
5 ana rol için yönetir.

## Hedef kitle

- **İşletme sahibi (OWNER)** — yetki yönetimi ve personel ataması.
- **Veteriner hekim (VETERINARIAN)** — klinik modülleri.
- **Klinik personeli (STAFF)** — resepsiyon, petshop, kabul.
- **Süper admin (SUPERADMIN)** — platform yönetimi (tenant dışı).
- **Hasta sahibi portalı (PET_OWNER_PORTAL)** — yalnızca kendi hayvanları.

## Roller ve temel farklar

| Rol              | Tenant verisi         | Tipik kullanım yeri              |
| ---------------- | --------------------- | -------------------------------- |
| `SUPERADMIN`     | Tüm tenant'lar        | Platform yönetimi, onboarding    |
| `OWNER`          | Yalnızca kendi tenant'ı | İşletme yönetimi, finans, KVK  |
| `VETERINARIAN`   | Yalnızca kendi tenant'ı | Klinik kayıtlar, reçete, aşı    |
| `STAFF`          | Yalnızca kendi tenant'ı | POS, kabul, hasta sahibi yönetimi |
| `PET_OWNER_PORTAL` | Yalnızca kendi hayvanları | Portal randevu, aşı hatırlatma |

## Yetki nasıl çalışır?

VetNiva'da her işlem **iki aşamalı** kontrol edilir:

1. **Kimlik doğrulama (auth)** — Sen kimsin? (`AuthGuard`)
2. **Yetki kontrolü (RBAC)** — Bu işlemi yapabilir misin? (`PermissionsGuard` + `RbacService`)

> **Kritik kural:** Yetki kontrolü **her zaman backend'de** yapılır.
> Frontend yalnızca görünürlük ve kullanıcı deneyimi sağlar;
> gerçek karar sunucuda verilir.

### Permission'lar nasıl ifade edilir?

Her permission `<domain>:<resource>:<action>` formatındadır:

- `clinic:appointment:create` → Klinik modülünde randevu oluşturma
- `branch:branch:read` → Şube bilgisi okuma
- `tenant:tenant:update` → Tenant güncelleme

Her permission için tanımlı özellikler:

- **`tenant_scope: required`** — Bu işlem aktif tenant içinde yapılmalı.
  Tenant bağlamı yoksa reddedilir.
- **`branch_scope: required`** — Bu işlem aktif branch içinde yapılmalı.
  Branch context yoksa reddedilir.
- **`self_only: true`** — Yalnızca oturum kullanıcısının kendi kaydına
  erişim. Portal kullanıcıları için tipik.
- **`audit: true`** — Kullanım audit log'a yansır (her red kararı
  daima loglanır).

## SUPERADMIN — ayrıcalıklı erişim

SUPERADMIN kullanıcılar `User.isSuperadmin=true` bayrağına sahiptir
ve tüm permission'ları bypass eder. Bu kullanıcılar:

- **Tenant üyeliği olmadan** çalışır (cross-tenant görünüm).
- `X-Branch-Id` header'ı ile herhangi bir tenant'ın branch'ına
  geçebilir.
- Tüm `audit:rbac.permission_granted` event'leri ile denetim
  altındadır (bypass bile loglanır).

> **Güvenlik notu:** `isSuperadmin` bayrağı yalnızca veritabanı
> seeder veya admin tarafından set edilir. Normal API ile
> değiştirilemez. GOAL-016 superadmin paneli bu yönetimi sağlayacak.

## Branch scope — multi-branch tenant

Her oturum `UserSession.activeBranchId` alanı ile aktif branch
bağlamını taşır:

- **Login sırasında** tenant'ın ilk aktif branch'ı atanır
  (pilot tek şube).
- **Branch değiştirme** için
  `POST /api/v1/auth/switch-branch/:branchId` çağrılır.
  - Normal kullanıcı: yalnızca kendi tenant'ının branch'larına
    geçebilir.
  - SUPERADMIN: herhangi bir tenant'ın branch'ına geçebilir
    (X-Branch-Id header'ı ile).
- **Permission'lar `branch_scope: required` ise** actor.branchId
  zorunlu; aksi hâlde `VET-AUTHZ-0004` hatası döner.

## Günlük senaryolar

### Senaryo 1: Yeni personel davet etme (OWNER)

1. `POST /api/v1/auth/invitations` ile davet gönderin.
2. Davetli e-posta ile gelen link'i tıklar.
3. `POST /api/v1/auth/invitations/accept` ile parola oluşturur.
4. Davetli artık tenant üyesi; ilgili permission'lar kapsamında
   çalışır.

### Senaryo 2: Yanlış rol atamayı düzeltme (OWNER)

1. `UserTenantMembership` tablosunda rolü değiştirin
   (ileride tenant-settings UI'ı).
2. Sonraki session'da yeni rol aktif olur.

### Senaryo 3: Yetkisiz erişim denemesi (tüm roller)

1. Kullanıcı bir endpoint'e erişir.
2. `RbacService.evaluate` permission'ı kontrol eder.
3. Rol eşleşmiyorsa `audit:rbac.permission_denied` event'i yazılır.
4. `VET-AUTHZ-0001` (yetki yok) hatası ile 403 döner.
5. Süperadmin panelinde yetkisiz erişim denemeleri alarm olarak
   gösterilir.

## Sık sorulan sorular

### SUPERADMIN tenant verisini değiştirebilir mi?

SUPERADMIN cross-tenant **görünüm** sağlar (debug, onboarding);
normal CRUD endpoint'lerine tenant context olmadan erişemez.
Gerçek değişiklik için platform yönetim endpoint'leri (GOAL-016)
kullanılır.

### Hasta sahibi (portal) tenant bilgilerini görebilir mi?

Hayır. `PET_OWNER_PORTAL` rolü `self_only: true` permission'lar
dışında tenant endpoint'lerine erişemez. Yanlışlıkla tenant
endpoint'ine istek atılırsa 403 alır.

### Yetki değişikliği ne kadar sürede aktif olur?

- Mevcut session: Hemen (her istek başında resolve edilir).
- Login sonrası: Yeni oturumda yeni roller aktif olur.

### Bir permission'ı kim yönetir?

Permission kataloğu (`docs/permissions/PERMISSION_CATALOG.yaml`)
yazılım güncellemesi ile değişir. Rol atamaları ise
`UserTenantMembership.role` üzerinden tenant bazında yapılır.
İleride (GOAL-013+) UI üzerinden yönetilecek.

## Hata kodları

- `VET-AUTHZ-0001` (403) — Genel yetkisiz erişim.
- `VET-AUTHZ-0003` (403) — Self-only uyuşmazlığı.
- `VET-AUTHZ-0004` (403) — Branch scope gerekli.
- `VET-AUTHZ-0005` (403) — Belirli rol gerekli.
- `VET-AUTHZ-0006` (403) — Tenant bağlamı zorunlu.

## İlgili dokümanlar

- `docs/permissions/PERMISSION_CATALOG.yaml` — Tüm permission
  tanımları (makinece okunabilir).
- `docs/permissions/PERMISSION_MATRIX.md` — İnsan okunabilir matris.
- `docs/permissions/ROLE_DESCRIPTIONS.md` — 5 rolün detaylı
  sorumluluk açıklamaları.
- `apps/api/src/common/rbac/` — Backend RBAC altyapısı.
