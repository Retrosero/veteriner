/**
 * @file Domain sözlüğü.
 * @module docs/domain/DOMAIN_GLOSSARY
 *
 * @description VetNiva'daki tüm varlık/kavramların tanımı, ilişkileri,
 * zorunlu alanları, yaşam döngüsü ve silme/düzeltme kuralları. Bu
 * sözlük, sonraki tüm goal'ların (GOAL-002+) ortak ürün sözleşmesi
 * görevi görür.
 *
 * Bu dosya `docs/fields/FIELD_GLOSSARY.md`'den farklıdır: orada
 * alan düzeyinde (alan adı, tip, kısıt), burada varlık düzeyinde
 * (kavram, ilişkiler, yaşam döngüsü) tanımlama yapılır.
 *
 * @security Tıbbi ve finansal kayıtlar append-only; silme yok,
 * versiyonlama ve amendment ile düzeltme.
 * @author GOAL-001 (FAZ-0) domain sözlüğü
 */

# VetNiva Domain Sözlüğü

Bu sözlük, VetNiva platformundaki tüm varlıkların (entity) ve
kavramların tanımını, ilişkilerini, zorunlu alanlarını, yaşam
döngüsünü ve silme/düzeltme kurallarını içerir.

**Pilot kapsam:** Türkiye'deki küçük/orta ölçekli veteriner
kliniği; kedi, köpek ve kuş türleri. İngiltere (en-GB) desteği
Faz 14'te eklenir.

**Genel kurallar:**

- Her varlık `tenant_id` zorunludur; PostgreSQL RLS ile korunur.
- Fiziksel silme yok. `archived_at` set edilerek soft-delete yapılır.
- Tıbbi ve finansal kayıtlar **append-only**: değişiklikler
  amendment/ters kayıt ile yapılır, asıl kayıt korunur.
- Audit: oluşturma, güncelleme, arşivleme, kritik işlemler.

---

## İçindekiler

1. [Hasta Sahibi (Patient Owner)](#1-hasta-sahibi-patient-owner)
2. [Hayvan (Patient/Animal)](#2-hayvan-patientanimal)
3. [Türler: Kedi, Köpek, Kuş](#3-türler-kedi-köpek-kuş)
4. [Randevu (Appointment)](#4-randevu-appointment)
5. [Muayene (Examination)](#5-muayene-examination)
6. [SOAP Kaydı (Subjective–Objective–Assessment–Plan)](#6-soap-kaydı-subjectiveobjectiveassessmentplan)
7. [Aşı (Vaccination)](#7-aşı-vaccination)
8. [Reçete (Prescription)](#8-reçete-prescription)
9. [Ameliyat (Surgery)](#9-ameliyat-surgery)
10. [Anestezi (Anesthesia)](#10-anestezi-anesthesia)
11. [Yatış (Hospitalization)](#11-yatış-hospitalization)
12. [Laboratuvar (Laboratory)](#12-laboratuvar-laboratory)
13. [Görüntüleme (Imaging)](#13-görüntüleme-imaging)
14. [Petshop](#14-petshop)
15. [Stok (Stock/Inventory)](#15-stok-stockinventory)
16. [Satış (Sale)](#16-satış-sale)
17. [Tahsilat (Payment/Collection)](#17-tahsilat-paymentcollection)
18. [Hasta Sahibi Portalı (Owner Portal)](#18-hasta-sahibi-portalı-owner-portal)

---

## 1. Hasta Sahibi (Patient Owner)

**Tanım:** Klinik tarafından tanınan, bir veya birden fazla hayvanın
yasal sahibi. Hasta sahibi, klinik ile iletişim kurulan birincil
kişidir.

**İlişkiler:**

- Hayvanlar (1-N) — bir sahibin birden çok hayvanı olabilir
- Portal hesabı (0-1) — isteğe bağlı
- Adres (1-N) — birden çok adres kaydedilebilir (ev/iş)
- İletişim tercihi (1) — SMS / e-posta / telefon tercihi

**Zorunlu alanlar:** `first_name`, `last_name`, `primary_phone`,
`tenant_id`.

**Opsiyonel alanlar:** `email`, `secondary_phone`, `address`,
`kvkk_consent_at`, `marketing_consent_at`, `notes`.

**Yaşam döngüsü:**

- `active` → aktif kayıt
- `archived` → tüm hayvanlarını devrettiğinde (sahiplik geçişi
  sonrası otomatik veya manuel)

**Silme/düzeltme:**

- Fiziksel silme yok.
- `archived_at` set edilir; hayvanlar yeni sahibe atanır.
- KVKK gereği talep halinde: `kvkk_erasure_requested_at` set
  edilir; tüm PII maskelenir, tıbbi kayıtlar korunur (yasal
  zorunluluk).
- Ad/soyad düzeltme: amendment ile yeni satır; eski korunur.

**Audit:** Oluşturma, güncelleme, arşivleme, KVKK silme talebi,
sahiplik devri.

---

## 2. Hayvan (Patient/Animal)

**Tanım:** Klinik tarafından takip edilen, sahibinin yasal sorumluluğundaki
canlı. Pilot kapsamda kedi, köpek ve kuş türleri.

**İlişkiler:**

- Sahibi (N-1, zorunlu) → Hasta Sahibi
- Tür (1, zorunlu) → Kedi/Köpek/Kuş enum
- Randevular (1-N)
- Muayeneler (1-N)
- Aşılar (1-N)
- Reçeteler (1-N)
- Ameliyatlar (1-N)
- Yatışlar (1-N)
- Laboratuvar istemleri (1-N)
- Görüntülemeler (1-N)
- Mikroçip (0-1, kuşlarda NULL)
- Alerjiler / kronik durumlar / uyarılar (1-N)
- Zaman çizelgesi (timeline) — tüm tıbbi olaylar

**Zorunlu alanlar:** `name`, `species`, `sex`, `tenant_id`, `owner_id`.

**Opsiyonel alanlar:** `breed`, `birth_date`, `estimated_age_months`,
`microchip_no`, `colour`, `weight_kg`, `neutered`, `allergies`,
`chronic_conditions`, `warnings`, `photo_url`.

**Yaşam döngüsü:**

- `active` → aktif hasta
- `deceased` → ölüm (tarih + sebep notu, append-only)
- `transferred` → sahiplik başka kişiye geçti
- `archived` → klinikten ayrıldı (ölüm/transfer sonrası)

**Silme/düzeltme:**

- Fiziksel silme yok.
- Ölüm: `deceased_at`, `death_cause` set edilir; tıbbi kayıtlar korunur.
- Transfer: yeni `owner_id`; eski sahibin `archived_at` güncellenir.
- Düzeltme: amendment ile yapılır; orijinal kayıt korunur.
- Alerji/kronik durum: append-only — her değişiklik yeni satır.

**Audit:** Oluşturma, sahiplik değişimi, ölüm, kritik tıbbi
alanlar (alerji/kronik durum/uyarı).

---

## 3. Türler: Kedi, Köpek, Kuş

**Tanım:** Pilot kapsamdaki hayvan türleri. Her tür için türe özel
alanlar ve kurallar uygulanır.

### Kedi (Cat)

- Genel alanlar: name, breed, sex, birth_date.
- Tür-spesifik: indoor_only (boolean), litter_count (doğum sayısı,
  opsiyonel).
- Mikroçip: zorunlu (varsa).

### Köpek (Dog)

- Genel alanlar: name, breed, sex, birth_date, weight_kg.
- Tür-spesifik: size_category (`SMALL` < 10kg, `MEDIUM` 10-25kg,
  `LARGE` 25-40kg, `GIANT` > 40kg), neutered (kısırlaştırma).
- Mikroçip: zorunlu (varsa).

### Kuş (Bird)

- Genel alanlar: name, breed, sex, estimated_age_months.
- Tür-spesifik: species_detail (papağan, muhabbet kuşu, kanarya
  vb.), wing_clip_consent, cage_number (kafes no, klinik içi).
- Mikroçip: opsiyonel (bacak bandı kullanılabilir).

**İlişkiler:** Hayvan (1-1) → tür bilgisi hayvana bağlıdır.

**Zorunlu alanlar:** `species_detail` (tür-spesifik, ör. "papağan").

**Yaşam döngüsü:** Hayvan ile aynı; tür bilgisi güncellenemez
(tür değişirse yeni hayvan kaydı açılır, eski `archived`).

---

## 4. Randevu (Appointment)

**Tanım:** Belirli bir tarih/saatte, belirli bir veteriner ve
(opsiyonel) oda/kaynak ile, belirli bir hayvan için planlanan
klinik ziyareti.

**İlişkiler:**

- Hayvan (N-1, zorunlu) → Hayvan
- Sahibi (N-1, zorunlu, hayvan üzerinden türetilir)
- Veteriner (N-1) → Kullanıcı (VETERINARIAN rolü)
- Oda/kaynak (0-1) → Opsiyonel, klinik kaynak
- Türü (1) → `consultation` / `vaccination` / `surgery` / `lab` /
  `imaging` / `grooming` / `control` (kontrol muayenesi)

**Zorunlu alanlar:** `patient_id`, `scheduled_at`, `duration_min`,
`appointment_type`, `tenant_id`, `branch_id`.

**Opsiyonel alanlar:** `veterinarian_id`, `room_id`, `reason`,
`notes`, `created_by` (portal ise portal kullanıcısı).

**Yaşam döngüsü:**

- `scheduled` → planlandı
- `confirmed` → sahibi/klinik tarafından onaylandı
- `waiting` → geldi, muayene bekliyor
- `in_progress` → muayene başladı
- `completed` → tamamlandı
- `cancelled` → iptal (sebep notu zorunlu)
- `no_show` → gelmedi

**İlişkili kayıtlar:**

- Tamamlandığında → 1 Muayene (Examination) oluşturulur
- Aşı randevusu → Aşı kaydı
- Ameliyat randevusu → Ameliyat kaydı

**Silme/düzeltme:**

- Fiziksel silme yok.
- İptal: `cancelled_at`, `cancellation_reason`.
- Tarih/saat değişikliği: amendment ile (eski korunur, audit'e
  yansır).

**Audit:** Oluşturma, onay, durum değişiklikleri, iptal, no_show,
tarih değişikliği.

---

## 5. Muayene (Examination)

**Tanım:** Klinik ziyareti sırasında veteriner tarafından yapılan
klinik değerlendirme. SOAP notları, vital bulgular, teşhis ve
tedavi planını içerir.

**İlişkiler:**

- Randevu (1-1, opsiyonel) → randevudan türeyebilir veya doğrudan
- Hayvan (N-1, zorunlu)
- Veteriner (N-1, zorunlu)
- SOAP (1, zorunlu) → SOAP kaydı
- Vital bulgular (1, opsiyonel) → ölçümler
- Teşhis (1-N) → problem listesi
- Tedavi planı (1-N) → planlanan tedaviler
- Reçete (0-N) → yazılan reçeteler
- Kontrol randevusu (0-1) → önerilen takip
- Ekler (0-N) → görsel/dosya ekleri

**Zorunlu alanlar:** `patient_id`, `veterinarian_id`, `started_at`,
`tenant_id`, `branch_id`, `appointment_id` (önerilir).

**Yaşam döngüsü:**

- `draft` → veteriner yazıyor
- `signed` → imzalandı, artık değiştirilemez (amendment gerekir)
- `amended` → sonradan düzeltme eklendi
- `cancelled` → yanlışlıkla açıldı, kapatıldı

**Silme/düzeltme:**

- Fiziksel silme yok.
- Düzeltme: amendment ile yeni muayene kaydı oluşturulur
  (`amends_id` referansı).
- İmza sonrası düzeltme sadece amendment ile.

**Audit:** Oluşturma, imzalama, amendment.

---

## 6. SOAP Kaydı (Subjective–Objective–Assessment–Plan)

**Tanım:** Muayene sırasında veteriner tarafından doldurulan,
yapılandırılmış klinik notu. Dört bölümden oluşur:

- **S (Subjective):** Hayvan sahibinin gözlemleri, şikayet geçmişi
- **O (Objective):** Muayene bulguları, vital bulgular, lab/görüntüleme sonuçları
- **A (Assessment):** Teşhis, problem listesi, ayırıcı tanı
- **P (Plan):** Tedavi planı, reçete, kontrol, öneriler

**İlişkiler:** Muayene (1-1, zorunlu).

**Zorunlu alanlar:** `examination_id`, `subjective`, `tenant_id`.
İlk muayenede en az S bölümü doldurulmalıdır.

**Opsiyonel alanlar:** `objective`, `assessment`, `plan`,
`attachments` (dosya referansları).

**Silme/düzeltme:** Muayene ile aynı; imzadan sonra sadece
amendment.

**Audit:** Muayene ile birlikte.

---

## 7. Aşı (Vaccination)

**Tanım:** Hayvana uygulanan aşı ürünü. Aşı ürünü, lot, doz ve
uygulama bilgilerini içerir.

**İlişkiler:**

- Hayvan (N-1, zorunlu)
- Aşı ürünü (N-1, zorunlu) → Aşı kataloğu
- Lot (N-1, zorunlu) → Stok lot
- Uygulayan veteriner (N-1, zorunlu)
- Aşı kartı (1, hesaplanmış) → hayvana özel tüm aşılar
- Hatırlatma (0-1) → sonraki tekrar tarihi
- Stok hareketi (1) → uygulama anında stok düşümü

**Zorunlu alanlar:** `patient_id`, `product_id`, `lot_id`,
`administered_by`, `administered_at`, `dose`, `site`,
`tenant_id`, `branch_id`, `idempotency_key`.

**Opsiyonel alanlar:** `next_due_at` (protokol'den otomatik),
`amends_id`.

**Yaşam döngüsü:**

- `active` → geçerli aşı kaydı
- `amended` → düzeltildi (orijinal korunur)
- `cancelled` → yanlışlıkla uygulandı (stok iade edilir)

**İdempotency:** `idempotency_key` (tenant içinde unique); aynı
istem ikinci kez gelirse mevcut kayıt döner.

**Silme/düzeltme:**

- Fiziksel silme yok.
- Düzeltme: amendment ile yeni aşı kaydı (`amends_id` referansı).
- İptal: `cancelled_at` + stok iade hareketi (ters kayıt).

**Audit:** Oluşturma, düzeltme, iptal, stok düşümü.

---

## 8. Reçete (Prescription)

**Tanım:** Muayene sonrasında veteriner tarafından yazılan,
hayvana özel ilaç ve kullanım talimatlarını içeren kayıt.

**İlişkiler:**

- Muayene (N-1, zorunlu)
- Hayvan (N-1, zorunlu)
- Veteriner (N-1, zorunlu)
- Reçete kalemleri (1-N) → ilaç, doz, sıklık, süre
- Stok düşümü (0-N) → ilaçlar klinik stoğundan

**Zorunlu alanlar:** `examination_id`, `patient_id`,
`prescriber_id`, `tenant_id`, `branch_id`.

**Opsiyonel alanlar:** `notes`, `valid_until` (varsayılan 30 gün),
`repeat_count` (tekrar sayısı).

**Yaşam döngüsü:**

- `active` → yazıldı
- `dispensed` → ilaçlar sahibine verildi
- `cancelled` → iptal (stok iade)

**Silme/düzeltme:**

- Fiziksel silme yok.
- Düzeltme: amendment ile; orijinal korunur.
- İptal: `cancelled_at` + stok iade.

**Audit:** Oluşturma, dağıtım, iptal, stok düşümü.

---

## 9. Ameliyat (Surgery)

**Tanım:** Hayvan üzerinde gerçekleştirilen cerrahi müdahale.
Ameliyat öncesi onam, anestezi kaydı ve operasyon notlarını
içerir.

**İlişkiler:**

- Hayvan (N-1, zorunlu)
- Randevu (0-1) → ameliyat randevusu
- Cerrah(lar) (N-M) → birden çok cerrah olabilir
- Asistan(lar) (0-M)
- Anestezi kaydı (1) → ayrı entity
- Onam formu (1) → Hasta Sahibi imzası
- Operasyon notu (1, zorunlu) → yapılan işlem, komplikasyonlar
- Kullanılan malzemeler (0-N) → stok düşümü
- Yatış (0-1) → ameliyat sonrası yatış

**Zorunlu alanlar:** `patient_id`, `scheduled_at`, `primary_surgeon_id`,
`procedure_code`, `tenant_id`, `branch_id`.

**Opsiyonel alanlar:** `assistants`, `complications`, `notes`,
`consent_form_id`.

**Yaşam döngüsü:**

- `scheduled` → planlandı
- `consent_pending` → onam bekleniyor
- `in_progress` → operasyon sürüyor
- `completed` → tamamlandı
- `cancelled` → iptal (sebep notu zorunlu)

**Silme/düzeltme:** Append-only; düzeltme amendment ile.

**Audit:** Oluşturma, onam, başlangıç/bitiş, kullanılan malzemeler.

---

## 10. Anestezi (Anesthesia)

**Tanım:** Ameliyat sırasında uygulanan anestezi protokolü,
kullanılan ajanlar ve hasta monitörizasyonu.

**İlişkiler:**

- Ameliyat (1-1, zorunlu)
- Hayvan (N-1, zorunlu)
- Anestezist (N-1) → kullanıcı
- Kullanılan ajanlar (1-N) → ilaç adı, doz, zaman

**Zorunlu alanlar:** `surgery_id`, `patient_id`, `anesthetist_id`,
`protocol` (protokol adı), `started_at`, `tenant_id`.

**Opsiyonel alanlar:** `ended_at`, `vital_monitoring` (kalp atışı,
SpO2, tansiyon zaman serisi), `complications`, `notes`.

**Yaşam döngüsü:** `in_progress` → `completed` → `amended` (gerekirse).

**Silme/düzeltme:** Append-only; amendment.

**Audit:** Ameliyat ile birlikte.

---

## 11. Yatış (Hospitalization)

**Tanım:** Hayvanın klinikte belirli bir süre kalması (gözlem,
tedavi, ameliyat sonrası). Kafes/yatak ataması, günlük notlar
ve taburcu özetini içerir.

**İlişkiler:**

- Hayvan (N-1, zorunlu)
- Yatış başlangıç nedeni (1) → ameliyat / acil / tedavi / gözlem
- Ameliyat (0-1) → ameliyat sonrası yatış
- Kafes/yatak (0-1) → oda/kaynak
- Günlük notlar (1-N) → her gün için
- Kullanılan malzemeler (0-N) → stok düşümü
- Taburcu özeti (1, zorunlu taburcu anında)

**Zorunlu alanlar:** `patient_id`, `admitted_at`, `tenant_id`,
`branch_id`.

**Opsiyonel alanlar:** `discharged_at`, `cage_id`, `daily_notes`,
`discharge_summary`.

**Yaşam döngüsü:**

- `admitted` → kabul
- `in_treatment` → tedavi sürüyor
- `observation` → gözlemde
- `discharged` → taburcu
- `cancelled` → kabul iptal (yanlışlıkla)

**Silme/düzeltme:** Append-only; taburcu sonrası düzeltme
amendment ile.

**Audit:** Kabul, günlük notlar, taburcu, kullanılan malzemeler.

---

## 12. Laboratuvar (Laboratory)

**Tanım:** Hayvandan alınan numuneler için istenen ve
sonuçlanan laboratuvar testleri.

**İlişkiler:**

- Hayvan (N-1, zorunlu)
- İsteyen veteriner (N-1, zorunlu)
- Test kataloğu (1-N) → test adı, kodu, referans aralıkları
- Numune (1-N) → kan/idr/doku vb.
- Sonuçlar (1-N) → test bazında sonuç + referans aralığı + yorum
- Görüntüleme ilişkisi (0-1) → bazı lab sonuçları görüntüleme ile
  bağlantılı

**Zorunlu alanlar:** `patient_id`, `ordered_by`, `ordered_at`,
`tenant_id`, `branch_id`.

**Opsiyonel alanlar:** `sample_collected_at`, `external_lab`
(dış lab kullanılıyorsa), `notes`.

**Yaşam döngüsü:**

- `ordered` → istendi
- `sample_taken` → numune alındı
- `in_progress` → lab çalışıyor
- `resulted` → sonuç geldi
- `cancelled` → iptal

**Silme/düzeltme:** Append-only; sonuç düzeltme amendment ile.

**Audit:** İstem, numune, sonuç, düzeltme.

---

## 13. Görüntüleme (Imaging)

**Tanım:** Hayvana uygulanan radyoloji, ultrason ve diğer
görüntüleme tetkikleri.

**İlişkiler:**

- Hayvan (N-1, zorunlu)
- İsteyen veteriner (N-1, zorunlu)
- Görüntüleme türü (1) → `xray` / `ultrasound` / `ct` / `mri` /
  `endoscopy`
- Görüntü dosyaları (1-N) → DICOM veya JPG/PNG, dosya servisinde
- Rapor (1, opsiyonel) → radyoloğun yorumu (iç/dış lab)
- Cihaz (0-1) → hangi cihazla çekildi

**Zorunlu alanlar:** `patient_id`, `ordered_by`, `imaging_type`,
`ordered_at`, `tenant_id`, `branch_id`.

**Opsiyonel alanlar:** `performed_at`, `report`, `images`,
`external_provider` (dış lab), `notes`.

**Yaşam döngüsü:** `ordered` → `in_progress` → `reported` → `cancelled`.

**Silme/düzeltme:** Append-only; rapor düzeltme amendment.

**Audit:** İstem, çekim, rapor, düzeltme.

---

## 14. Petshop

**Tanım:** Klinik içindeki petshop işletmesi. Ürün satışı, stok
yönetimi, kampanya ve müşteri sadakati. Klinik ve petshop stokları
ortak depo kullanabilir veya ayrı depo olabilir.

**İlişkiler:**

- Şube (N-1, zorunlu) → petshop klinik şubesine bağlı
- Ürün/hizmet kataloğu (1-N)
- Stok (1-N) → ürün bazında
- Satış (1-N) → POS hareketleri
- Tedarikçi (1-N)
- Müşteri sadakati programı (0-1)
- Kampanya (0-N)

**Zorunlu alanlar:** `branch_id`, `tenant_id`.

**Pilot kapsam:** Barkodlu satış, ürün/hizmet kataloğu, stok
görüntüleme, fiyat listesi, tahsilat. Müşteri sadakati ve
kampanya MVP sonrası.

**Silme/düzeltme:** Petshop ayarları değiştirilebilir; silme yok
(geçmiş satışlar korunur).

---

## 15. Stok (Stock/Inventory)

**Tanım:** Klinik ve petshop'ta bulunan ürünlerin (ilaç, aşı,
gıda, aksesuar) depo/raf/lot bazında takibi. Stok hareketi ile
miktar değişimi kayıt altına alınır.

**İlişkiler:**

- Ürün (N-1, zorunlu) → ürün kataloğu
- Depo (1, zorunlu) → depo/raf
- Lot (1, opsiyonel) → ilaç/aşı/gıda için lot + SKT
- Stok hareketleri (1-N) → tüm giriş/çıkış
- Tedarikçi (0-N) → alımlar
- Klinik tüketim (1-N) → reçete/aşı uygulaması
- Petshop satışı (1-N) → POS

**Zorunlu alanlar:** `product_id`, `warehouse_id`, `tenant_id`,
`quantity_on_hand`, `min_quantity` (uyarı eşiği).

**Opsiyonel alanlar:** `lot_id`, `expiry_date`, `unit_cost`,
`location_code`.

**Stok hareket türleri:**

- `purchase_in` → tedarikten gelen
- `manual_in` → manuel giriş (sayım farkı)
- `manual_out` → manuel çıkış
- `clinic_use` → klinik tüketimi (reçete/aşı)
- `sale_out` → petshop satışı
- `return_in` → müşteri iade
- `discard_out` → imha (SKT geçmiş vb.)
- `transfer_in` / `transfer_out` → depolar arası

**Silme/düzeltme:**

- Stok kaydı silinmez; hareket iptal edilirse **ters hareket**
  oluşturulur.
- Negatif stok'a izin verilmez (Faz 7'de kontrol sıkılaştırılır).

**Audit:** Tüm stok hareketleri (giriş/çıkış/düzeltme/iade).

---

## 16. Satış (Sale)

**Tanım:** Petshop POS'unda gerçekleştirilen ürün/hizmet satışı.
Müşteri (hasta sahibi veya misafir), kalemler, ödeme ve fiş
içerir.

**İlişkiler:**

- Müşteri (0-1) → hasta sahibi olabilir veya misafir
- Satış kalemleri (1-N) → ürün, miktar, birim fiyat, indirim
- Ödemeler (1-N) → nakit, kart, transfer
- Stok hareketleri (1-N) → her kalem için otomatik `sale_out`
- Fiş/fatura (1) → çıktı (Faz 7'de e-SMM entegrasyonu)
- Kasiyer (N-1) → kullanıcı

**Zorunlu alanlar:** `branch_id`, `cashier_id`, `sold_at`,
`tenant_id`, `total_amount`.

**Opsiyonel alanlar:** `customer_id`, `discount_total`, `notes`.

**Yaşam döngüsü:**

- `draft` → fiş taslağı
- `completed` → satış tamamlandı
- `refunded` → iade edildi (ters kayıt)

**Silme/düzeltme:**

- Fiziksel silme yok.
- İade: ayrı `refund` satışı oluşturulur, stok iade hareketi
  tetiklenir.
- Düzeltme: amendment.

**Audit:** Satış, iade, ödeme.

---

## 17. Tahsilat (Payment/Collection)

**Tanım:** Klinik veya petshop hizmetleri için alınan ödemeler.
Klinik hizmetleri (muayene, aşı, ameliyat vb.) ve petshop satışları
için ortak tahsilat altyapısı.

**İlişkiler:**

- Satış (0-1) → petshop satışına bağlı
- Muayene (0-1) → klinik hizmetine bağlı
- Müşteri (0-1) → hasta sahibi
- Ödeme yöntemi (1) → `cash` / `card` / `bank_transfer` / `other`
- Kasa (N-1) → tahsilatın yatırıldığı kasa
- Fiş/fatura (1) → çıktı

**Zorunlu alanlar:** `amount`, `payment_method`, `received_at`,
`tenant_id`, `branch_id`.

**Opsiyonel alanlar:** `customer_id`, `reference_id` (işlem no),
`notes`.

**Yaşam döngüsü:**

- `pending` → beklemede (online ödeme ise)
- `completed` → tahsil edildi
- `reversed` → iptal/ters kayıt

**Silme/düzeltme:**

- Fiziksel silme yok.
- İptal: ters kayıt (`reversed_at` + yeni `reversal` hareketi).

**Audit:** Tüm tahsilatlar, iptaller, kasa hareketleri.

---

## 18. Hasta Sahibi Portalı (Owner Portal)

**Tanım:** Hayvan sahiplerinin kendi hayvanlarının bilgilerini
görebildiği, randevu talep edebildiği, aşı kartını görebildiği
web/mobil arayüz. Tenant'ın dışında, ayrı bir kimlik doğrulama
domain'i ile çalışır.

**İlişkiler:**

- Portal kullanıcısı (1) → ayrı User (role: PET_OWNER_PORTAL)
- Hasta sahibi (1-1) → aynı kişi, opsiyonel olarak bağlı
- Hayvanlar (1-N) → yalnızca kendi hayvanları
- Randevu talepleri (1-N) → beklemede veya onaylı
- Aşı kartı (salt okunur)
- Tahsilat geçmişi (salt okunur)
- Aşı/aşı hatırlatmaları (salt okunur)
- Dosya indirme (lab sonuçları vb., izinli olanlar)

**Zorunlu alanlar:** Portal hesabı için e-posta, telefon, KVKK
onayı.

**Yetki:** Yalnızca kendi hayvanlarına ait veri; cross-patient
erişim yok. RLS + Guard ile zorunlu tutulur.

**Davranış kuralları:**

- Portal kullanıcısı `tenant_id` doğrulanmış oturumdan gelir;
  request body'den alınmaz.
- Aşı kartı, lab sonucu gibi salt okunur veriler için read-only
  endpoint'ler.
- Randevu talebi `requested` durumunda oluşur; klinik onaylar
  → normal Randevu'ya dönüşür.
- Tıbbi kayıtları sahibi düzenleyemez (yalnızca klinik).

**Audit:** Tüm portal oturum açma, veri görüntüleme, talep oluşturma.

---

## Genel Kurallar Özeti

### Audit

Aşağıdaki olaylar **her zaman** audit log'a yansır:

- Oluşturma (CREATE)
- Güncelleme (UPDATE) — kritik alanlar
- Arşivleme / soft-delete
- Silme talebi (KVKK)
- Amendment (tıbbi/finansal düzeltme)
- Cross-tenant erişim denemesi (engellenen)
- Kimlik doğrulama olayları (login, logout, başarısız giriş)
- Yetkilendirme hataları (izin reddi)

### Çapraz İlişkiler

- Hayvan silinemez, ancak `archived` olabilir. Hayvana bağlı
  randevu/muayene/aşı/reçete korunur (yasal zorunluluk).
- Hasta sahibi silinemez; yalnızca arşivlenir.
- Tıbbi kayıtlar (muayene, aşı, reçete, ameliyat) silinemez.
- Finansal kayıtlar (satış, tahsilat) silinemez; ters kayıt ile
  düzeltilir.

### Tenant İzolasyonu

- Her varlık `tenant_id` taşır; PostgreSQL RLS ile korunur.
- Cross-tenant erişim denemeleri uygulama katmanında 404
  döner; bilgi sızdırmaz.
- Süperadmin (platform yönetimi) tenant dışı görünüm için
  ayrı context ile çalışır; normal API'lere erişemez.

### Çoklu Şube

- Pilot tek şube ile başlar; veri modeli çoklu şubeye uygun.
- `branch_id` opsiyonel olabilir (klinik geneli kayıtlar için).
- Şubeler arası transfer: `branch_id` değişimi amendment ile.

### Çoklu Dil (i18n)

- Tüm kullanıcı metinleri `tr-TR` (varsayılan) ve `en-GB` (Faz 14)
  çevirileri ile tutulur.
- Çeviri anahtarları `packages/i18n/src/locales/` altında.
- Yeni çeviri eklenirken ana iki dil birlikte güncellenir.

### Ülke Adaptörü

- Türkiye kuralları (TC kimlik, telefon, vergi) ve İngiltere
  kuralları (NHS, VAT) `country adapter` üzerinden ayrılır
  (Faz 14'te).
- Pilot kapsamda yalnızca Türkiye adaptörü etkindir.

---

**Bu sözlük, sonraki tüm goal'ların (GOAL-002+) ortak ürün
sözleşmesi görevi görür. Yeni kavram eklenirken bu dosyaya
eklenir; değişiklikler git commit history'sinde izlenir.**
