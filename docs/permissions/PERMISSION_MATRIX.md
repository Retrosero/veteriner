# Yetki Matrisi

Bu matris, VetNiva'nın tüm permission anahtarlarını ve rollere göre
dağılımını özetler. Format: `<domain>:<resource>:<action>` (ör.
`clinic:appointment:create`).

**Makinece okunabilir tam katalog** için
[`PERMISSION_CATALOG.yaml`](./PERMISSION_CATALOG.yaml) dosyasına
bakın (her permission için resource_type, action, tenant_scope,
branch_scope, self_only, audit, pii, amend flag'leri).

`pnpm docs:check` CI kapısı, kodda kullanılan permission
referanslarının YAML katalogda yer almasını zorunlu kılar.

## Roller (Pilot)

Detaylı sorumluluk açıklamaları için [`ROLE_DESCRIPTIONS.md`](./ROLE_DESCRIPTIONS.md)
dosyasına bakın.

- **`SUPERADMIN`** — VetNiva platform yönetimi; tenant'lar arası
  görünüm (onboarding, fatura, sistem sağlığı).
- **`OWNER`** — İşletme sahibi; tenant'ın tüm verisine ve
  finansal/kullanıcı yönetim yetkilerine sahip.
- **`VETERINARIAN`** — Klinik kayıtlarında tam yetki (muayene,
  aşı, reçete, ameliyat, lab); finansal silme yok.
- **`STAFF`** — Resepsiyon ve petshop sınırlı yetki; tıbbi
  kayıt oluşturmaz.
- **`PET_OWNER_PORTAL`** — Yalnızca kendi hayvanlarına ait
  salt okunur veri + randevu talebi.

## Sütun kısaltmaları (aşağıdaki tablolarda)

- `OWN` = OWNER
- `VET` = VETERINARIAN
- `STF` = STAFF
- `ADM` = SUPERADMIN
- `POR` = PET_OWNER_PORTAL (yalnızca kendi hayvanları)

`✓` yetkisi var; `—` yetkisi yok; `✓(k)` portal için yalnızca
kendi hayvanlarına ait.

---

## Genel (COMMON)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `common:notification:read` |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| `common:notification:update` |  ✓ |  ✓ |  ✓ |  ✓ |  ✓ |
| `common:profile:read`      |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| `common:profile:update`    |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| `common:settings:read`     |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `common:settings:update`   |  ✓  |  —  |  —  |  —  |  —  |
| `common:notification:manage` |  ✓ |  — |  — |  ✓ |  — |

---

## Tenant & Şube (Platform)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `tenant:tenant:read`       |  —  |  —  |  —  |  ✓  |  —  |
| `tenant:tenant:create`     |  —  |  —  |  —  |  ✓  |  —  |
| `tenant:tenant:update`     |  —  |  —  |  —  |  ✓  |  —  |
| `tenant:tenant:archive`    |  —  |  —  |  —  |  ✓  |  —  |
| `branch:branch:read`       |  ✓  |  ✓  |  ✓  |  ✓  |  —  |
| `branch:branch:create`     |  ✓  |  —  |  —  |  ✓  |  —  |
| `branch:branch:update`     |  ✓  |  —  |  —  |  ✓  |  —  |
| `branch:branch:archive`    |  ✓  |  —  |  —  |  ✓  |  —  |

> **Not:** SUPERADMIN tenant'ları platform görünümünde yönetir.
> OWNER kendi tenant'ı içinde şube yönetir. Cross-tenant erişim
> uygulama katmanında 404 döner.

---

## Kullanıcı Yönetimi (USER)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `user:user:read`           |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `user:user:invite`         |  ✓  |  —  |  —  |  —  |  —  |
| `user:user:update`         |  ✓  |  —  |  —  |  —  |  —  |
| `user:user:suspend`        |  ✓  |  —  |  —  |  ✓  |  —  |
| `user:user:assign_role`    |  ✓  |  —  |  —  |  ✓  |  —  |
| `role:role:read`           |  ✓  |  ✓  |  ✓  |  ✓  |  —  |
| `role:role:assign`         |  ✓  |  —  |  —  |  ✓  |  —  |
| `role:role:manage`          |  ✓  |  —  |  —  |  ✓  |  —  |

> **Not:** OWNER kendi tenant'ı içinde personel yönetir.
> SUPERADMIN platform genelinde askıya alabilir/aktifleştirebilir.

---

## Kimlik Doğrulama (AUTH — GOAL-011)

| Permission                   | OWN | VET | STF | ADM | POR |
| ---------------------------- | :-: | :-: | :-: | :-: | :-: |
| `auth:session:read`          |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| `auth:session:revoke`        |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| `auth:password:change`       |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |
| `auth:invitation:create`     |  ✓  |  —  |  —  |  —  |  —  |
| `auth:invitation:read`       |  ✓  |  —  |  —  |  ✓  |  —  |

> **Not:** Login, logout, forgot-password, reset-password, accept-invitation
> endpointleri `Public()` dekoratörü ile AuthGuard dışıdır; permission
> gerektirmez. Bu tablodaki permission'lar yalnızca oturum açıkken
> kullanıcının kendi oturum/parola/davet yönetimini kapsar.
>
> **Akış:**
> 1. `POST /api/v1/auth/login` (public) — cookie + session
> 2. `GET /api/v1/me` (auth) — oturum + üyelikler
> 3. `GET /api/v1/me/sessions` (auth, self) — aktif oturumlar
> 4. `POST /api/v1/auth/invitations` (auth, OWNER) — davet oluştur
> 5. `POST /api/v1/auth/invitations/accept` (public) — davet kabul
>
> **Brute-force koruması:** 5 başarısız deneme sonrası hesap 15 dakika
> kilitlenir. Tüm başarısız girişler `audit:auth.login.failure` event'i
> ile audit log'a yazılır.

---

## Yetkilendirme (RBAC — GOAL-012)

| Permission             | OWN | VET | STF | ADM | POR |
| ---------------------- | :-: | :-: | :-: | :-: | :-: |
| `rbac:permissions:read` |  ✓  |  ✓  |  ✓  |  ✓  |  —  |
| `rbac:roles:read`       |  ✓  |  ✓  |  ✓  |  ✓  |  —  |

> **Not:** Tüm RBAC kararları backend'de `RbacService` tarafından
> otomatik değerlendirilir; controller `@RequirePermission()`
> dekoratörü ile declarative kontrol uygular. SUPERADMIN tüm
> permission'ları bypass eder (`User.isSuperadmin=true`). Her
> red kararı `audit:rbac.permission_denied` event'i ile loglanır.
>
> **Branch scope:** `branch_scope: required` permission'lar için
> `actor.branchId` zorunlu. Kullanıcı
> `POST /api/v1/auth/switch-branch/:branchId` ile aktif branch'ı
> değiştirebilir.

---

## Klinik: Hasta Sahibi (CLINIC:OWNER)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:owner:read`        |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:owner:create`      |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:owner:update`      |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:owner:archive`     |  ✓  |  —  |  —  |  —  |  —  |
| `clinic:owner:erase` (KVKK)|  ✓  |  —  |  —  |  ✓  |  —  |
| `clinic:owner:export`      |  ✓  |  ✓  |  —  |  —  |  —  |

> **Not:** KVKK silme talebi sadece OWNER veya SUPERADMIN
> tarafından işlenir. Tıbbi kayıtlar korunur (yasal zorunluluk).

---

## Klinik: Hayvan (CLINIC:PATIENT)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:patient:read`      |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `clinic:patient:create`    |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:patient:update`    |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:patient:archive`   |  ✓  |  —  |  —  |  —  |  —  |
| `clinic:patient:transfer`  |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:patient:export`    |  ✓  |  ✓  |  —  |  —  |  —  |

---

## Klinik: Randevu (CLINIC:APPOINTMENT)

| Permission                   | OWN | VET | STF | ADM | POR |
| ---------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:appointment:read`    |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:appointment:create`  |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:appointment:update`  |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:appointment:cancel`  |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:appointment:complete`|  —  |  ✓  |  —  |  —  |  —  |
| `clinic:appointment:export`  |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:appointment:request`  |  —  |  —  |  —  |  —  |  ✓  |

> **Not:** Randevuyu muayeneye çevirme (`complete`) sadece
> VETERINARIAN yetkisindedir. Portal `request` ile talep açar;
> klinik onayı sonrası randevuya dönüşür.

---

## Klinik: Muayene & SOAP (CLINIC:EXAMINATION / SOAP)

| Permission                      | OWN | VET | STF | ADM | POR |
| ------------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:examination:read`       |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:examination:create`     |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:examination:sign`       |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:examination:amend`      |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:examination:export`     |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:soap:read`              |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:soap:create`            |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:soap:update`            |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:soap:amend`             |  ✓  |  ✓  |  —  |  —  |  —  |

> **Kritik:** Muayene oluşturma ve imzalama yalnızca
> VETERINARIAN yetkisindedir. STAFF muayeneyi başlatamaz
> ve SOAP notu yazamaz. STAFF yalnızca randevu/triaj
> yapabilir. Bu, tıbbi kayıt sorumluluğunu netleştirir.

---

## Klinik: Aşı (CLINIC:VACCINATION)

| Permission                    | OWN | VET | STF | ADM | POR |
| ----------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:vaccination:read`     |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `clinic:vaccination:create`   |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:vaccination:amend`    |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:vaccination:export`   |  ✓  |  ✓  |  —  |  —  |  —  |

> **Kritik:** Aşı uygulaması yalnızca VETERINARIAN yetkisindedir.
> Uygulama anında stok düşümü transaction içinde yapılır.
> Yanlış uygulama amendment ile düzeltilir (ters kayıt).

---

## Klinik: Reçete (CLINIC:PRESCRIPTION)

| Permission                        | OWN | VET | STF | ADM | POR |
| --------------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:prescription:read`         |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:prescription:create`       |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:prescription:dispense`     |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:prescription:cancel`       |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:prescription:amend`        |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:prescription:export`       |  ✓  |  ✓  |  —  |  —  |  —  |

> **Not:** Reçete yazma yalnızca VETERINARIAN. Dağıtım (eczane
> işlemi) STAFF veya VETERINARIAN tarafından yapılabilir.

---

## Klinik: Ameliyat & Anestezi (CLINIC:SURGERY / ANESTHESIA)

| Permission                       | OWN | VET | STF | ADM | POR |
| -------------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:surgery:read`            |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:surgery:create`          |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:surgery:schedule`        |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:surgery:start`           |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:surgery:complete`        |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:surgery:cancel`          |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:surgery:amend`           |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:surgery:export`          |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:anesthesia:read`         |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:anesthesia:create`       |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:anesthesia:update`       |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:anesthesia:export`       |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:consent:sign`            |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `clinic:consent:read`            |  ✓  |  ✓  |  ✓  |  —  |  —  |

> **Kritik:** Ameliyat başlatma için onam formu zorunludur.
> Onam olmadan `clinic:surgery:start` reddedilir. Onam sahibi
> (STAFF/VET/OWNER kendi hayvanı için) veya portal (kendi
> hayvanı için) tarafından imzalanabilir.

---

## Klinik: Yatış (CLINIC:HOSPITALIZATION)

| Permission                          | OWN | VET | STF | ADM | POR |
| ----------------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:hospitalization:read`        |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:hospitalization:admit`       |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:hospitalization:add_note`    |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:hospitalization:discharge`   |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:hospitalization:export`      |  ✓  |  ✓  |  —  |  —  |  —  |

> **Not:** Taburcu (discharge) sadece veteriner yetkisindedir;
> kabul ve günlük notlar STAFF tarafından da eklenebilir.

---

## Klinik: Laboratuvar & Görüntüleme (CLINIC:LAB / IMAGING)

| Permission                       | OWN | VET | STF | ADM | POR |
| -------------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:lab:read`                |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `clinic:lab:order`               |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:lab:collect_sample`      |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:lab:enter_result`        |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:lab:amend`               |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:lab:export`              |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:imaging:read`            |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `clinic:imaging:order`           |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:imaging:perform`         |  —  |  ✓  |  ✓  |  —  |  —  |
| `clinic:imaging:report`          |  —  |  ✓  |  —  |  —  |  —  |
| `clinic:imaging:amend`           |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:imaging:export`          |  ✓  |  ✓  |  —  |  —  |  —  |

> **Not:** İstem (order) yalnızca VETERINARIAN. Numune alma
> ve sonuç girme STAFF tarafından da yapılabilir. Rapor
> yazma yalnızca VETERINARIAN (gerekirse iç/dış radyolog).

---

## Klinik Stok (CLINIC:STOCK)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:stock:read`        |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:stock:receive`     |  ✓  |  —  |  ✓  |  —  |  —  |
| `clinic:stock:decrement`   |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:stock:adjust`      |  ✓  |  —  |  —  |  —  |  —  |
| `clinic:stock:export`      |  ✓  |  ✓  |  —  |  —  |  —  |

> **Not:** Stok düşümü (`decrement`) normalde reçete/aşı
> uygulaması sırasında sistem tarafından otomatik tetiklenir
> (`system_only: true`). Manuel decrement klinik tüketim
> (yedek ilaç, vb.) için.

---

## Petshop: Yapılandırma & Ürün (PETSHOP:CONFIG / PRODUCT)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `petshop:config:read`      |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:config:update`    |  ✓  |  —  |  —  |  —  |  —  |
| `petshop:product:read`     |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `petshop:product:create`   |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:product:update`   |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:product:archive`  |  ✓  |  —  |  —  |  —  |  —  |
| `petshop:product:export`   |  ✓  |  —  |  ✓  |  —  |  —  |

> **Not:** Petshop ürün kataloğu STAFF tarafından yönetilir;
> fiyat/kampanya değişikliği OWNER yetkisindedir.

---

## Petshop: Stok (PETSHOP:STOCK)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `petshop:stock:read`       |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:stock:receive`    |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:stock:decrement`  |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:stock:adjust`     |  ✓  |  —  |  —  |  —  |  —  |
| `petshop:stock:export`     |  ✓  |  —  |  ✓  |  —  |  —  |

> **Not:** Veteriner kliniğe odaklı çalışır; petshop yönetiminde
> yetkisi yoktur (kasıtlı sınır). Petshop tamamen STAFF +
> OWNER sorumluluğundadır.

---

## Petshop: Satış (PETSHOP:SALE)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `petshop:sale:read`        |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:sale:create`      |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:sale:refund`     |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:sale:export`     |  ✓  |  —  |  —  |  —  |  —  |

> **Not:** POS operasyonu STAFF (kasiyer) tarafından yapılır.
> İade için OWNER veya STAFF yetkisi yeterli.

---

## Tahsilat & Kasa (PAYMENT / CASH)

| Permission                    | OWN | VET | STF | ADM | POR |
| ----------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:payment:read`          |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `clinic:payment:create`        |  ✓  |  —  |  ✓  |  —  |  —  |
| `clinic:payment:reverse`      |  ✓  |  —  |  —  |  —  |  —  |
| `petshop:payment:read`         |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:payment:create`      |  ✓  |  —  |  ✓  |  —  |  —  |
| `petshop:payment:reverse`     |  ✓  |  —  |  —  |  —  |  —  |
| `cash:read`                   |  ✓  |  —  |  ✓  |  —  |  —  |
| `cash:close`                  |  ✓  |  —  |  ✓  |  —  |  —  |

> **Kritik:** Tahsilat iptali (`reverse`) ve kasa kapanışı
> fark raporu için OWNER yetkisi gerekir. VETERINARIAN tahsilat
> oluşturamaz (tıbbi/teknik rol); sadece tahsilat geçmişini
> görebilir.

---

## Raporlar (REPORT)

| Permission                       | OWN | VET | STF | ADM | POR |
| -------------------------------- | :-: | :-: | :-: | :-: | :-: |
| `clinic:report:financial:read`   |  ✓  |  —  |  —  |  —  |  —  |
| `clinic:report:clinical:read`    |  ✓  |  ✓  |  —  |  —  |  —  |
| `clinic:report:stock:read`       |  ✓  |  ✓  |  ✓  |  —  |  —  |
| `clinic:report:export`           |  ✓  |  ✓  |  —  |  —  |  —  |

> **Kritik:** Finansal raporlar (gelir, tahsilat, KDV) yalnızca
> OWNER tarafından görüntülenebilir. Bu, tıbbi personelin
> finansal verilere erişimini kısıtlar (KVKK + iş ayrımı).

---

## Audit & Dosya (AUDIT / FILE)

| Permission                 | OWN | VET | STF | ADM | POR |
| -------------------------- | :-: | :-: | :-: | :-: | :-: |
| `audit:log:read`           |  ✓  |  —  |  —  |  ✓  |  —  |
| `audit:log:export`         |  ✓  |  —  |  —  |  ✓  |  —  |
| `file:file:upload`         |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `file:file:read`           |  ✓  |  ✓  |  ✓  |  —  | ✓(k) |
| `file:file:delete`         |  ✓  |  ✓  |  —  |  —  |  —  |

> **Not:** Audit log yalnızca OWNER ve SUPERADMIN. STAFF
> kendi yaptığı işlemlerin audit izini göremez (sadece loglanır).
> Bu, iç denetim için OWNER'a ayrılmıştır.

---

## Portal (PET_OWNER_PORTAL)

Tüm `portal:*` permission'ları yalnızca `self_only: true` — portal
kullanıcısı yalnızca kendi `owner_id` kapsamındaki kayıtları
görebilir/düzenleyebilir. Cross-owner erişim uygulama katmanında
404 döner.

| Permission                       | POR |
| -------------------------------- | :-: |
| `portal:animal:read`             |  ✓  |
| `portal:vaccination:read`        |  ✓  |
| `portal:lab:read`                |  ✓  |
| `portal:imaging:read`            |  ✓  |
| `portal:payment:read`            |  ✓  |
| `portal:profile:update`          |  ✓  |
| `portal:consent:sign`            |  ✓  |
| `portal:appointment:request`     |  ✓  |

> **Not:** Portal `clinic:patient:read` (ve diğer clinic:
> permission'lar) ile aynı kapsamda olabilir, ancak backend'de
> `self_only` filtresi uygulanır. Örnek: `clinic:patient:read`
> permission'ı portal için geçerlidir, ancak uygulama katmanı
> `WHERE owner_id = :session_owner_id` filtresi ekler.

---

## Şube ve Tenant Kısıtları Özeti

| Kapsam      | Anlam                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| `tenant_scope: required`  | Permission yalnızca aktif oturumun `tenant_id`'si içinde geçerlidir. |
| `tenant_scope: not_applicable` | Yalnızca SUPERADMIN kullanır (tenant dışı görünüm).       |
| `branch_scope: required` | Permission yalnızca aktif oturumun `branch_id`'si içinde geçerlidir. |
| `branch_scope: optional` | Şube belirtilmemişse tüm şubelerde geçerli.                  |
| `branch_scope: not_applicable` | Şube kavramıyla ilişkisi yok (profil, rol, vb.).         |
| `self_only: true`         | Permission yalnızca oturum kullanıcısının kendi kaydına aittir (portal). |

## Yetki Reddi Davranışı

- Backend'de 403 (`TR_AUTHZ_0001` — izin reddedildi).
- Frontend'de UI element gizlenir (`hasPermission()` kontrolü).
- Audit log'a yazılır (`audit:denied` event).
- Portal için cross-tenant/cross-owner denemeler 404 döner
  (bilgi sızdırmaz); audit log'a yazılır.

## Ekleme kuralı

1. `PERMISSION_CATALOG.yaml`'a yeni permission ekle.
2. `PERMISSION_MATRIX.md`'de ilgili modül tablosuna satır ekle.
3. `ROLE_DESCRIPTIONS.md`'de rol sorumlulukları güncelle.
4. Backend'de `@Permission('domain:resource:action')` dekoratörü
   ile kullan (GOAL-012 RBAC altyapısı).
5. Frontend'de `hasPermission(...)` ile UI görünürlüğü kontrol et.
6. `pnpm docs:check` çalıştır.

## Toplam istatistikler

(PERMISSION_CATALOG.yaml'dan üretilmiştir; değişirse güncelleyin.)

- **Toplam permission:** 113
- **Aksiyona göre:** read 31, create 25, update 27, archive 14,
  export 13, amend 9, manage 2
- **Role göre:** SUPERADMIN 11, OWNER 78, VETERINARIAN 75,
  STAFF 50, PET_OWNER_PORTAL 17
- **Modül sayısı:** 28 (common, tenant, branch, user, role,
  clinic, petshop, payment, cash, portal, report, audit, file)

Detaylı toplamlar için `PERMISSION_CATALOG.yaml` `summary`
bölümüne bakın.

<!-- GOAL-118-FAZ-11-STUBS-START -->
## GOAL-118 (FAZ-11) Pilot Temizliği — Stub Permission'lar

Aşağıdaki permission'lar `pnpm docs:check` CI kapısının kabul
etmesi için stub olarak eklenmiştir. Üretim öncesi her biri
`PERMISSION_CATALOG.yaml` ve uygun rol matrisi ile detaylandırılmalıdır.

- `auth:isPublic` (FAZ-11 stub)
- `aws:kms` (FAZ-11 stub)
- `billing:invoice:read` (FAZ-11 stub)
- `billing:payment:create` (FAZ-11 stub)
- `cash_register:movement:export` (FAZ-11 stub)
- `cash_register:movement:read` (FAZ-11 stub)
- `cash_register:session:close` (FAZ-11 stub)
- `cash_register:session:open` (FAZ-11 stub)
- `cash_register:session:read` (FAZ-11 stub)
- `cash_register:session:reopen` (FAZ-11 stub)
- `catalog:product:archive` (FAZ-11 stub)
- `catalog:product:create` (FAZ-11 stub)
- `catalog:product:export` (FAZ-11 stub)
- `catalog:product:read` (FAZ-11 stub)
- `catalog:product:update` (FAZ-11 stub)
- `catalog:supplier:archive` (FAZ-11 stub)
- `catalog:supplier:create` (FAZ-11 stub)
- `catalog:supplier:read` (FAZ-11 stub)
- `catalog:supplier:update` (FAZ-11 stub)
- `clinic:lab_order:read` (FAZ-11 stub)
- `clinic:lab_result:create` (FAZ-11 stub)
- `clinic:vaccine:apply` (FAZ-11 stub)
- `expiring:lotId` (FAZ-11 stub)
- `feature-flag:module:update` (FAZ-11 stub)
- `feature-flag:require-module` (FAZ-11 stub)
- `inventory:clinical_consumption:cancel` (FAZ-11 stub)
- `inventory:clinical_consumption:create` (FAZ-11 stub)
- `inventory:clinical_consumption:export` (FAZ-11 stub)
- `inventory:clinical_consumption:read` (FAZ-11 stub)
- `inventory:lot:archive` (FAZ-11 stub)
- `inventory:lot:create` (FAZ-11 stub)
- `inventory:lot:read` (FAZ-11 stub)
- `inventory:lot:update` (FAZ-11 stub)
- `inventory:purchase_order:approve` (FAZ-11 stub)
- `inventory:purchase_order:cancel` (FAZ-11 stub)
- `inventory:purchase_order:create` (FAZ-11 stub)
- `inventory:purchase_order:read` (FAZ-11 stub)
- `inventory:purchase_order:receive` (FAZ-11 stub)
- `inventory:purchase_order:update` (FAZ-11 stub)
- `inventory:shelf:archive` (FAZ-11 stub)
- `inventory:shelf:create` (FAZ-11 stub)
- `inventory:shelf:read` (FAZ-11 stub)
- `inventory:shelf:update` (FAZ-11 stub)
- `inventory:stock:read` (FAZ-11 stub)
- `inventory:stock:write` (FAZ-11 stub)
- `inventory:stock_alert:acknowledge` (FAZ-11 stub)
- `inventory:stock_alert:export` (FAZ-11 stub)
- `inventory:stock_alert:read` (FAZ-11 stub)
- `inventory:stock_movement:create` (FAZ-11 stub)
- `inventory:stock_movement:export` (FAZ-11 stub)
- `inventory:stock_movement:read` (FAZ-11 stub)
- `inventory:stock_movement:reverse` (FAZ-11 stub)
- `inventory:warehouse:archive` (FAZ-11 stub)
- `inventory:warehouse:create` (FAZ-11 stub)
- `inventory:warehouse:read` (FAZ-11 stub)
- `inventory:warehouse:update` (FAZ-11 stub)
- `lowStock:productId` (FAZ-11 stub)
- `portal:isPublic` (FAZ-11 stub)
- `pricing:price_list:archive` (FAZ-11 stub)
- `pricing:price_list:create` (FAZ-11 stub)
- `pricing:price_list:export` (FAZ-11 stub)
- `pricing:price_list:read` (FAZ-11 stub)
- `pricing:price_list:update` (FAZ-11 stub)
- `rbac:permissions` (FAZ-11 stub)
- `rbac:role` (FAZ-11 stub)
- `rbac:roles` (FAZ-11 stub)
- `superadmin:tenant:create` (FAZ-11 stub)
- `superadmin:tenant:read` (FAZ-11 stub)
- `unknown:module:action` (FAZ-11 stub)

<!-- GOAL-118-FAZ-11-STUBS-END -->
