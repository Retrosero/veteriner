# @file Rol Sorumlulukları.

# @module docs/permissions/ROLE_DESCRIPTIONS

#

# @description VetNiva'daki 5 temel rol için detaylı sorumluluk,

# yetki kapsamı ve kullanım senaryoları. Yetki matrisi için

# `PERMISSION_MATRIX.md` ve makinece okunabilir katalog için

# `PERMISSION_CATALOG.yaml` dosyalarına bakın.

#

# @author GOAL-002 (FAZ-0) yetki matrisi

# @since 2026-07-30

# =============================================================================

# Rol Sorumlulukları

VetNiva'da 5 temel rol tanımlıdır. Her rolün sorumluluk alanı,
tenant/şube kapsamı ve tipik kullanım senaryoları aşağıda
açıklanmıştır.

> **Yetki hatırlatma:** Tüm permission'lar `tenant_id` kapsamındadır.
> SUPERADMIN hariç tüm roller yalnızca kendi tenant'larındaki
> verilere erişir. Portal kullanıcıları yalnızca kendi
> hayvanlarına (`self_only`) erişir.

---

## 1. SUPERADMIN — Platform Yönetimi

**Amaç:** VetNiva platformunun kendisi. Tenant'lar arası görünüm,
onboarding, fatura, sistem sağlığı.

**Tenant kapsamı:** Tüm tenant'lar (cross-tenant görünüm).
**Şube kapsamı:** Yok (şube kavramı tenant'a aittir).

### Sorumluluklar

- **Tenant onboarding:** Yeni tenant oluşturma, ilk admin
  kullanıcı atama, fatura planı seçme.
- **Tenant yönetimi:** Tenant kapatma (archive), tenant
  bilgilerini güncelleme.
- **Platform sağlığı:** Sistem genelinde hata oranları,
  performans, kota aşımı izleme.
- **Global audit:** Tenant'lar arası denetim, KVKK ihlal taraması.
- **Süper admin desteği:** Tenant'ların VIP destek taleplerine
  doğrudan erişim.

### Kapsam dışı

- Normal klinik operasyonu (muayene, aşı, reçete). Klinik
  verilerine normal API'lerle erişemez (RLS).
- Klinik finansal detaylar (her tenant'ın kendi finansal
  görünümü vardır; SUPERADMIN yalnızca aggregate metrics).

### Tipik kullanım senaryoları

- Yeni klinik başvurusu → `tenant:tenant:create` ile onboarding.
- Sistem arızası → tüm tenant'ların sağlık durumunu izleme.
- KVKK denetimi → tenant'ların `audit:log:export` raporlarını
  talep etme (kendi audit erişimi ile).

### Dikkat edilmesi gereken noktalar

- SUPERADMIN tenant verisini güncellemez (yalnızca görür
  veya platform ayarlarını değiştirir).
- SUPERADMIN eylemleri `audit:log` ile yoğun şekilde kayıt
  altına alınır.
- Tek bir SUPERADMIN hesabı tüm tenant'lara eriştiği için
  MFA zorunludur (GOAL-011'de tanımlanacak).

---

## 2. OWNER — İşletme Sahibi

**Amaç:** Klinik/petshop işletmesinin sahibi veya genel müdürü.
Tenant'ın tüm verisine ve finansal/kullanıcı yönetimine erişir.

**Tenant kapsamı:** Yalnızca kendi tenant'ı.
**Şube kapsamı:** Tenant içindeki tüm şubeler (multi-branch).

### Sorumluluklar

- **Kullanıcı yönetimi:** Personel davet etme, rol atama,
  askıya alma. Klinik ekibinin işe alım/işten çıkarış süreçleri.
- **Şube yönetimi:** Yeni şube açma, şube kapatma, şube
  bilgilerini güncelleme.
- **Tenant ayarları:** Fatura planı, çalışma saatleri, KVKK
  politikası, iletişim tercihleri.
- **Finansal yönetim:** Tüm tahsilatları görme, finansal
  raporlar, KDV raporları, ters kayıt.
- **Klinik operasyonu (tam yetki):** Tüm klinik verilerini
  görme, oluşturma, arşivleme. Tıbbi kayıt düzeltme (amendment).
- **Petshop yönetimi:** Ürün kataloğu, fiyat listeleri, kampanyalar,
  stok politikası.
- **Audit görüntüleme:** Tenant içi tüm audit log kayıtlarını
  görme ve dışa aktarma.
- **KVKK:** Hasta sahibi silme taleplerini işleme (tıbbi kayıtlar
  korunur, PII maskelenir).

### Tipik kullanım senaryoları

- Yeni personel işe alımı → `user:user:invite` + `user:user:assign_role`.
- Mali ay sonu → finansal raporları `clinic:report:financial:read`
  ile görüntüleme, `clinic:report:export` ile PDF/Excel çıktısı.
- KVKK talebi → `clinic:owner:erase` ile PII silme, audit kaydı.
- Stok yenileme → `clinic:stock:receive` veya `petshop:stock:receive`.

### Dikkat edilmesi gereken noktalar

- OWNER doğrudan tıbbi kayıt oluşturmaz (klinik işi
  VETERINARIAN'a bırakır), ama amendment yapabilir
  (denetim amaçlı).
- OWNER tahsilat oluşturabilir ama iptal edebilir
  (`clinic:payment:reverse`).
- OWNER tüm audit log'u görebilir; bu, iç denetim için
  güçlü bir araçtır ama aynı zamanda güç kötüye kullanımına
  karşı da korunmalıdır (MFA, audit log'u izleme).

---

## 3. VETERINARIAN — Veteriner Hekim

**Amaç:** Klinik tıbbi operasyonları. Hasta hayvana ilişkin
tüm tıbbi kararlar (muayene, aşı, reçete, ameliyat, lab,
görüntüleme).

**Tenant kapsamı:** Yalnızca kendi tenant'ı.
**Şube kapsamı:** Tenant içindeki tüm şubeler (atanmış olduğu
şubeler; Faz 1'de sınırsız).

### Sorumluluklar

- **Muayene:** Yeni muayene oluşturma, SOAP notu yazma, vital
  bulgular, teşhis, tedavi planı. İmzalama (artık
  değiştirilemez).
- **Aşı:** Aşı uygulaması (stok düşümü ile birlikte), lot
  seçimi, SKT kontrolü. Hatalı uygulamayı amendment ile
  düzeltme.
- **Reçete:** Yeni reçete yazma, ilaç etkileşim kontrolü,
  dağıtım. İptal gerekirse `clinic:prescription:cancel`
  (stok iade).
- **Ameliyat:** Planlama, ekip atama, başlatma, tamamlama.
  Anestezi kaydı. Operasyon notu.
- **Yatış:** Kabul, günlük notlar, taburcu (özet ile).
- **Lab & Görüntüleme:** İstem oluşturma, sonuç değerlendirme,
  rapor yazma.
- **Tıbbi kayıt düzeltme:** İmzalı kayıtlar için amendment
  oluşturma (orijinal korunur).
- **Klinik raporlar:** Klinik metrikleri (muayene, aşı) görme.
  Finansal raporları GÖREMEZ.

### Kapsam dışı

- **Finansal:** Tahsilat oluşturamaz, iptal edemez, finansal
  raporları göremez (`clinic:payment:create` yok). Bu,
  iş ayrımı (segregation of duties) prensibidir: tıbbi
  karar veren kişi aynı zamanda para toplamaz.
- **Petshop yönetimi:** Petshop ürün/stok/satış permission'ları
  yoktur. Klinik operasyonuna odaklanır.
- **Kullanıcı yönetimi:** Personel davet edemez veya rol
  atayamaz.
- **Tenant yönetimi:** Tenant veya şube yönetimi yok.
- **Süper admin:** Audit log erişimi yok (sadece OWNER
  görebilir).

### Tipik kullanım senaryoları

- Sabah muayeneleri → randevu `clinic:appointment:complete` +
  muayene `clinic:examination:create` + SOAP.
- Aşı uygulaması → `clinic:vaccination:create` (stok otomatik
  düşer).
- Ameliyat günü → `clinic:surgery:start` (onam kontrolü ile),
  `clinic:anesthesia:create/update`, `clinic:surgery:complete`.
- Hatalı kayıt → orijinali amendment ile düzeltme
  (`clinic:*:amend`).

### Dikkat edilmesi gereken noktalar

- VETERINARIAN her imzaladığı kayıt artık değiştirilemez;
  düzeltme için amendment gerekir.
- Stok düşümü normalde reçete/aşı uygulaması sırasında
  otomatik tetiklenir; manuel düşüm `clinic:stock:decrement`
  ile yapılabilir ama audit edilir.
- VETERINARIAN tıbbi karar verirken danışma için
  `common:notification:read` ile diğer veterinerlerin
  yorumlarını görebilir (Faz 11+ AI asistan).

---

## 4. STAFF — Klinik Personeli

**Amaç:** Resepsiyon, hasta kabul, petshop kasiyer, genel
klinik desteği. Tıbbi karar vermez.

**Tenant kapsamı:** Yalnızca kendi tenant'ı.
**Şube kapsamı:** Atanmış olduğu şube (multi-branch).

### Sorumluluklar

- **Resepsiyon:** Randevu oluşturma, güncelleme, iptal.
  Bekleme listesi yönetimi.
- **Hasta sahibi yönetimi:** Yeni hasta sahibi kaydı, var olan
  kayıtları güncelleme. Arşivleme YAPAMAZ (OWNER).
- **Hayvan kaydı:** Yeni hayvan oluşturma, temel bilgi
  güncelleme. Transfer/ölüm/arsivleme YAPAMAZ.
- **Muayene görüntüleme:** Mevcut muayeneleri görme (okuma).
  Muayene oluşturma/imzalama YAPAMAZ (VETERINARIAN).
- **Stok:** Tedarik alma (`stock:receive`). Manuel decrement
  (yedek ilaç için). Sayım düzeltmesi YAPAMAZ (OWNER).
- **Petshop:** Ürün kataloğu yönetimi, satış (POS) oluşturma,
  iade, tahsilat.
- **Kasa:** Kasa bakiyesi görüntüleme, gün sonu kasa
  kapanışı.
- **Yatış:** Kabul (VETERINARIAN ile birlikte), günlük notlar.
  Taburcu YAPAMAZ (VETERINARIAN).
- **Onam:** Hasta sahibine onam imzalatma (VETERINARIAN
  ile birlikte).
- **Tahsilat:** Klinik ve petshop tahsilatı oluşturma
  (VETERINARIAN yapamaz; STAFF ve OWNER yapabilir).

### Kapsam dışı

- **Tıbbi karar:** Muayene, aşı uygulaması, reçete yazma,
  ameliyat, lab sonuç değerlendirme. STAFF tıbbi kayıt
  oluşturamaz.
- **Finansal kritik:** Tahsilat iptali (`payment:reverse`),
  KVKK silme (`owner:erase`).
- **Kullanıcı yönetimi:** Personel davet/rol atama.
- **Audit:** Audit log görüntüleme yok.

### Tipik kullanım senaryoları

- Sabah resepsiyon → telefondan randevu al,
  `clinic:appointment:create`.
- Hasta geldiğinde → `clinic:appointment:complete` ile
  muayeneye hazırla (STAFF başlatamaz; VETERINARIAN
  başlatır).
- Petshop satış → `petshop:sale:create` (stok otomatik düşer,
  tahsilat alınır, fiş yazdırılır).
- Akşam kasa → `cash:close` ile gün sonu raporu.

### Dikkat edilmesi gereken noktalar

- STAFF tıbbi içerik yazamaz (SOAP, reçete, vb.). Bu,
  tıbbi sorumluluğun net sınırıdır.
- STAFF petshop'ta tüm satışları yapabilir ama iade için
  OWNER onayı gerekebilir (yüksek tutarlı iadeler).
- STAFF tenant ayarlarını değiştiremez; yalnızca OWNER.

---

## 5. PET_OWNER_PORTAL — Hasta Sahibi Portalı

**Amaç:** Hayvan sahiplerinin kendi hayvanlarının bilgilerini
görebildiği, randevu talep edebildiği salt okunur portal.
Klinik tarafından yönetilen bir hesap; kendi kendine kayıt
yoktur (klinik davet eder).

**Tenant kapsamı:** Klinik tarafından atanmış tenant.
**Self-scope:** Yalnızca `owner_id = :session_owner_id`
kapsamındaki hayvanlar.

### Sorumluluklar (sınırlı)

- **Kendi hayvanlarını görme:** Profil, aşı kartı, lab
  sonuçları, görüntüleme raporları, tahsilat geçmişi
  (salt okunur).
- **Randevu talebi:** Klinik tarafından onaylandığında
  randevuya dönüşür.
- **Onam verme:** Ameliyat/işlem öncesi onam formunu
  kendi hayvanı için dijital olarak imzalama.
- **Profil güncelleme:** Şifre, telefon, iletişim tercihi
  (yalnızca kendi profili).
- **Dosya yükleme:** Kendi hayvanı için dosya (aşı
  sertifikası fotoğrafı, vb.) yükleme.

### Kapsam dışı (kesinlikle yok)

- **Tıbbi kayıt oluşturma:** Portal kullanıcısı SOAP
  yazamaz, reçete yazamaz, aşı uygulayamaz. Tıbbi içerik
  yalnızca klinik tarafından girilir.
- **Diğer hayvanları görme:** Cross-owner erişim yok
  (başka hasta sahibinin hayvanı).
- **Fiyat/fatura değiştirme:** Tahsilat geçmişi salt
  okunur; itiraz için klinikle iletişim.
- **Klinik ayarları:** Tenant ayarlarına erişim yok.
- **Stok/petshop yönetimi:** Klinik iç operasyonuna erişim yok.
- **Audit:** Audit log görüntüleme yok (kendi işlemleri
  loglanır ama göremez).

### Tipik kullanım senaryoları

- Aşı hatırlatma SMS'i geldi → portala girip `portal:animal:read`
  ile hayvanı gördü → `portal:vaccination:read` ile aşı
  kartını kontrol etti.
- Muayene sonrası → portala girip `portal:lab:read` ile
  kan sonuçlarını gördü (klinik tarafından girilmiş).
- Yeni randevu → `portal:appointment:request` ile müsait
  tarih/saat aralığını seçti, klinik onayı bekledi.
- Ameliyat öncesi → `portal:consent:sign` ile dijital
  onam verdi.

### Dikkat edilmesi gereken noktalar

- Portal `tenant_id`'si doğrulanmış oturumdan gelir;
  request body'den alınmaz (güvenlik).
- Tüm portal permission'ları `self_only: true`; cross-owner
  erişim uygulama katmanında 404 döner (bilgi sızdırmaz).
- Portal kullanıcısı `PII` (telefon, e-posta) alanlarını
  görebilir ama `PII` taşıyan alanlar maskelenir
  (KVKK loglanır).
- Portal hesabı klinik tarafından oluşturulur; kendi
  kendine kayıt YOKTUR (Faz 3'te).

---

## Karşılaştırma Tablosu

| Özellik                | SUPERADMIN | OWNER | VETERINARIAN | STAFF | PORTAL |
| ---------------------- | :--------: | :---: | :----------: | :---: | :----: |
| Tenant kapsamı         |    Tümü    |   1   |      1       |   1   |   1    |
| Şube kapsamı           |    Yok     | Tümü  |     Tümü     | Atan. | Atan.  |
| Tıbbi kayıt oluşturma  |     —      |   —   |      ✓       |   —   |   —    |
| Tıbbi kayıt imzalama   |     —      |   —   |      ✓       |   —   |   —    |
| Tıbbi kayıt düzeltme   |     —      |   ✓   |      ✓       |   —   |   —    |
| Tıbbi kayıt görme      |     —      |   ✓   |      ✓       |   ✓   |  ✓(k)  |
| Tahsilat oluşturma     |     —      |   ✓   |      —       |   ✓   |   —    |
| Tahsilat iptal         |     —      |   ✓   |      —       |   —   |   —    |
| Petshop satış          |     —      |   ✓   |      —       |   ✓   |   —    |
| Kullanıcı yönetimi     |     ✓      |   ✓   |      —       |   —   |   —    |
| Şube yönetimi          |     ✓      |   ✓   |      —       |   —   |   —    |
| Tenant yönetimi        |     ✓      |   —   |      —       |   —   |   —    |
| Audit log görme        |     ✓      |   ✓   |      —       |   —   |   —    |
| KVKK silme             |     ✓      |   ✓   |      —       |   —   |   —    |
| Finansal rapor         |     —      |   ✓   |      —       |   —   |   —    |
| Klinik rapor           |     —      |   ✓   |      ✓       |  (s)  |   —    |
| Stok raporu            |     —      |   ✓   |      ✓       |   ✓   |   —    |
| Randevu talep (portal) |     —      |   —   |      —       |   —   |   ✓    |
| Onam (kendi hayvanı)   |     —      |  (s)  |     (s)      |  (s)  |  ✓(k)  |

**Kısaltmalar:**

- `(s)`: Sınırlı — yalnızca kendi oluşturduğu veya kendi
  şubesindeki kayıtlar.
- `✓(k)`: Portal — yalnızca kendi hayvanları.

---

## Yetki Matrisi Kaynak Haritası

- [`PERMISSION_MATRIX.md`](./PERMISSION_MATRIX.md) — modül
  bazlı özet tablo.
- [`PERMISSION_CATALOG.yaml`](./PERMISSION_CATALOG.yaml) — tüm
  permission'lar için yapısal katalog (CI doğrulamalı).
- `docs/fields/FIELD_GLOSSARY.md` — alan düzeyinde sözlük.
- `docs/domain/DOMAIN_GLOSSARY.md` — varlık/kavram sözlüğü.
- `docs/ai/AI_KNOWLEDGE_BASE.md` — RAG chunk yapısı.
- `docs/user-education/` — rol bazlı Türkçe kullanıcı
  eğitimleri (Faz 2+ sırasında doldurulacak).
