# VetNiva Pilot Smoke Test Planı

**Tarih:** 2026-08-06
**Pilot ortamı:** Coolify v4 + Traefik + vetniva.appsgo.cloud
**Test verisi:** 4 demo user + 2 owner + 2 patient (Karabaş köpek + Minnoş kedi)
**Amaç:** Tam klinik akışı doğrulamak (login → muayene → reçete → fatura → tahsilat → stok düşümü)

## 0. Ön Koşullar

Tarayıcı: `https://vetniva.appsgo.cloud/`
API doğrudan erişim yok (BFF pattern); tüm akış web üzerinden.

Demo kullanıcılar:

| Email                        | Şifre                  | Rol          |
| ---------------------------- | ---------------------- | ------------ |
| `owner@pilot.vetniva.local`  | `VetNiva-Owner-2026!`  | OWNER        |
| `owner2@pilot.vetniva.local` | `VetNiva-Owner2-2026!` | OWNER        |
| `vet@pilot.vetniva.local`    | `VetNiva-Vet-2026!`    | VETERINARIAN |
| `staff@pilot.vetniva.local`  | `VetNiva-Staff-2026!`  | STAFF        |

Tenant: `pilot-vet-kadikoy` (`11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1`)
Branch: `b203d16a-91e2-49c0-b9d7-9bdc55fdf60d`

## 1. Health Check (5 saniye)

1. `https://vetniva.appsgo.cloud/` → landing page yüklenir (200)
2. Sağlık durumu butonu → `/api/v1/health` 200 döner
3. **Beklenen:** "VetNiva hazır" mesajı görünür

## 2. Login Akışı (3 dakika)

### 2.1 Owner Login

1. `/<locale>/login` sayfasına git (varsayılan `tr` locale)
2. Email: `owner@pilot.vetniva.local`
3. Şifre: `VetNiva-Owner-2026!`
4. **Beklenen:** 200, dashboard'a yönlendirilir, session token cookie'de

### 2.2 Diğer Roller

Aynı akışı sırayla:

- `vet@pilot.vetniva.local` → VETERINARIAN dashboard
- `staff@pilot.vetniva.local` → STAFF dashboard
- `owner2@pilot.vetniva.local` → OWNER dashboard

**Her biri için:**

- [ ] Login 200
- [ ] Role-based menü görünür
- [ ] Sidebar'da farklı modüller (OWNER: tümü, VETERINARIAN: klinik, STAFF: klinik sınırlı)

## 3. Klinik Akış — Tam Döngü (30 dakika)

`vet@pilot.vetniva.local` ile başla (klinik işlemleri için).

### 3.1 Hasta Listesi

1. Sidebar → "Hastalar" / "Patients"
2. **Beklenen:** Karabaş (dog) + Minnoş (cat) listelenir
3. Hasta detayı: Karabaş'a tıkla
4. **Beklenen:** Mikroçip, tür, cins, doğum tarihi, owner bilgisi görünür

### 3.2 Randevu Oluşturma

1. Sidebar → "Takvim" / "Calendar"
2. Bugün için boş slota tıkla
3. Hasta: Karabaş
4. Veterinarian: Dr. Vet (otomatik)
5. Süre: 30 dakika
6. Not: "Rutin kontrol"
7. **Beklenen:** 201, takvimde randevu görünür

### 3.3 Muayene (Examination)

1. Randevu kartına tıkla → detay
2. "Muayeneyi Başlat" butonu
3. SOAP notları:
   - S (Subjective): "Karabaş son 2 gündür iştahsız"
   - O (Objective): "Ateş 39.2°C, mukoza pembe"
   - A (Assessment): "Gastrit şüphesi"
   - P (Plan): "Diyet mama + antiemetik"
4. Tanı: "Gastritis"
5. Vital: Ateş 39.2, Nabız 110
6. **Beklenen:** 201, hasta zaman çizelgesinde muayene görünür

### 3.4 Reçete (Prescription)

1. Muayene detayında "Reçete" sekmesi
2. "Yeni Reçete" butonu
3. İlaçlar:
   - Maropitant 16mg (1 tablet, günde 1, 3 gün)
   - Royale Canin Gastro (1 paket, günde 2 öğün, 7 gün)
4. Not: "Yemekten önce ver"
5. **Beklenen:** 201, reçete hasta zaman çizelgesinde görünür + stok düşümü (eğer stok varsa)

### 3.5 Fatura (Invoice)

1. Reçete detayında "Faturala" butonu
2. Fatura kalemleri (otomatik):
   - Maropitant 16mg × 1 = 75 TL
   - Royale Canin Gastro × 1 = 250 TL
   - Muayene ücreti = 500 TL
3. KDV: %10
4. **Beklenen:** 201, fatura oluşturulur

### 3.6 Tahsilat (Payment)

1. Fatura detayında "Tahsilat" butonu
2. Yöntem: Nakit
3. Tutar: 907.5 TL (tam tutar)
4. **Beklenen:** 201, fatura "Ödendi" statüsüne geçer

### 3.7 Stok Kontrolü (owner ile)

1. Çıkış yap → `owner@pilot.vetniva.local` ile giriş
2. Sidebar → "Stok" / "Inventory"
3. Maropitant 16mg araması
4. **Beklenen:** Stokta 1 adet azalmış (muayene → reçete → stok düşümü zinciri çalışıyor)

### 3.8 Hasta Zaman Çizelgesi

1. Karabaş detayı → "Timeline" / "Zaman Çizelgesi"
2. **Beklenen:** Tüm akış kronolojik sırada:
   - Randevu oluşturma
   - Muayene + SOAP + tanı + vital
   - Reçete + 2 ilaç
   - Fatura + 3 kalem + KDV
   - Tahsilat + nakit

## 4. KVKK / Privacy Smoke (5 dakika)

`owner@pilot.vetniva.local` ile:

1. Sidebar → "Ayarlar" → "Gizlilik" (varsa)
2. **Beklenen:** KVKK bilgilendirmesi + veri sahibi hakları listesi

## 5. Onboarding Wizard (3 dakika)

1. Sol alt köşedeki "Yardım" butonuna tıkla
2. **Beklenen:** Onboarding wizard overlay olarak açılır
3. Step 1: Rol seçimi → OWNER seçili
4. Step 2: "Fatura nasıl oluşturulur?" sor
5. **Beklenen:** 1-3 saniye içinde fatura senaryosu gösterilir
6. ESC tuşu → wizard kapanır
7. **Beklenen:** Yardım butonu tekrar görünür

## 6. Cross-Tenant İzolasyonu (5 dakika)

1. `owner2@pilot.vetniva.local` ile giriş yap
2. Sidebar → "Hastalar"
3. **Beklenen:** Karabaş ve Minnoş GÖRÜNMEMELI (farklı kullanıcı)
4. **VEYA** Aynı tenant'ın diğer owner'ı olarak aynı hastaları görebilir

Tenant izolasyonu: `owner2` ile `owner` AYNI tenant'ta olduğu için aynı
verileri görmeli. Farklı tenant testi için tenant bazlı veri gerekli
(şu an tek pilot tenant var).

## 7. Audit Trail (2 dakika)

1. Bir aksiyon gerçekleştir (örn. yeni bir not ekle)
2. SUPERADMIN login ol (`owner` zaten SUPERADMIN yetkisi var)
3. SUPERADMIN panel → "Audit Log"
4. **Beklenen:** Son aksiyon audit event olarak görünür
   (actor, action, target, ip_hash, vs.)

## 8. Hata Yönetimi (3 dakika)

### 8.1 401 Unauthorized

1. Çıkış yap
2. `/<locale>/dashboard` URL'ine direkt git
3. **Beklenen:** Login'e yönlendirilir

### 8.2 403 Forbidden

1. `staff@pilot.vetniva.local` ile giriş
2. Sidebar'da SUPERADMIN-only bir menüye tıkla (varsa)
3. **Beklenen:** "Yetkiniz yok" mesajı (VET-AUTHZ-0001)

### 8.3 404 Not Found

1. `/<locale>/clinic/patients/non-existent-id` URL'ine git
2. **Beklenen:** 404 sayfası görünür

## 9. Smoke Test Sonuç Tablosu

| #   | Adım                                         | Beklenen                | Durum |
| --- | -------------------------------------------- | ----------------------- | ----- |
| 1   | Health check                                 | 200                     | ☐     |
| 2   | Login (4 user)                               | 200                     | ☐     |
| 3   | Klinik akış (muayene→reçete→fatura→tahsilat) | 201×4                   | ☐     |
| 4   | Stok düşümü                                  | Stok 1 azalır           | ☐     |
| 5   | KVKK bilgilendirmesi                         | Görünür                 | ☐     |
| 6   | Onboarding wizard                            | Açılır + çalışır        | ☐     |
| 7   | Cross-tenant izolasyon                       | Aynı tenant = aynı veri | ☐     |
| 8   | Audit trail                                  | Event görünür           | ☐     |
| 9   | 401/403/404 hata yönetimi                    | Doğru mesajlar          | ☐     |

## 10. Bilinen Sınırlamalar (Pilot)

- **SMS bildirimleri:** FAZ-13+ (provider entegrasyonu gerekli).
- **e-SMM/e-Fatura:** FAZ-13+ (GİB entegrasyonu gerekli).
- **Ödeme entegrasyonu:** FAZ-13+ (Stripe/iyzico).
- **Çoklu tenant:** Şu an tek tenant seed edildi; cross-tenant
  testi için ikinci tenant gerekli.

## 11. Sorun Giderme

### Sayfa yüklenmiyor

1. Coolify UI'da `vetniva-web` container "Running" mi?
2. `https://vetniva.appsgo.cloud/` Traefik üzerinden 200 dönüyor mu?
3. Tarayıcı DevTools → Network → 404/500 var mı?

### Login başarısız

1. API container "Running" mi?
2. `/api/v1/auth/login` endpoint'i 200 dönüyor mu?
3. Coolify terminal'de `pnpm --filter @vetniva/api test` çalıştır

### Veri görünmüyor

1. Tenant context doğru mu? (URL'de değil, session'da)
2. Owner rolü ile mi giriş yaptın?
3. RLS bypass gerekebilir → SUPERADMIN ile giriş

## 12. Test Sonuçlarını Kaydet

Test bittikten sonra:

1. `goals/PILOT_SMOKE_TEST_RESULTS_2026-08-06.md` oluştur
2. Yukarıdaki tabloyu doldur (geçen/kalan)
3. Varsa hata log'larını ekle
4. Production-ready geçiş kararı:
   - Tüm 9 adım ✅ → "Pilot başarılı, production-ready dönemine geçilebilir"
   - 1-2 ❌ → "Düzeltme gerekli, 1 hafta daha pilot"
   - 3+ ❌ → "Pilot'u yeniden değerlendir"
