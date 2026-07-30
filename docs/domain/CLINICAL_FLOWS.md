/**
 * @file Klinik ve petshop uçtan uca iş akışları.
 * @module docs/domain/CLINICAL_FLOWS
 *
 * @description VetNiva'nın pilot kapsamdaki tüm anahtar uçtan uca
 * iş akışları. Her akış için aktör, ön koşullar, adımlar, tenant
 * bağlamı, yetki gereksinimi, audit event'leri, hata senaryoları,
 * ilgili sayfa/API referansları yer alır.
 *
 * Bu dosya `docs/workflows/OVERVIEW.md`'yi tamamlar: orada Faz 0
 * kapsamı, burada pilot Faz 2+ kapsamı.
 *
 * @author GOAL-001 (FAZ-0) uçtan uca iş akışları
 */

# Klinik ve Petshop Uçtan Uca İş Akışları

Bu dosya, pilot kapsamda uçtan uca çalışan anahtar iş akışlarını
tanımlar. Her akış için:

- **Amaç:** Akışın iş hedefi
- **Aktör:** Akışı başlatan rol veya sistem
- **Ön koşullar:** Akış başlamadan önce gereken durum
- **Adımlar:** Sıralı adımlar (mutlaka tenant bağlamında)
- **Tenant bağlamı:** Tenant izolasyonu kuralları
- **Yetki:** Gereken permission'lar
- **Audit event'leri:** Kayıt altına alınan olaylar
- **Hata senaryoları:** Karşılaşılabilecek hatalar ve çözümleri
- **İlgili sayfalar / API'ler:** UI ve backend referansları

Akış şablonu için `docs/workflows/OVERVIEW.md` dosyasındaki
şablona bakın.

---

## İçindekiler

### Klinik Akışları

1. [Yeni hasta sahibi ve hayvan kaydı](#1-yeni-hasta-sahibi-ve-hayvan-kaydı)
2. [Portal üzerinden randevu talebi](#2-portal-üzerinden-randevu-talebi)
3. [Klinik randevusu (resepsiyon)](#3-klinik-randevusu-resepsiyon)
4. [Muayene akışı (SOAP + Teşhis + Tedavi)](#4-muayene-akışı-soap--teşhis--tedavi)
5. [Aşı uygulaması ve stok düşümü](#5-aşı-uygulaması-ve-stok-düşümü)
6. [Reçete yazımı ve dağıtımı](#6-reçete-yazımı-ve-dağıtımı)
7. [Ameliyat planlama ve onam](#7-ameliyat-planlama-ve-onam)
8. [Yatış kabul ve taburcu](#8-yatış-kabul-ve-taburcu)
9. [Laboratuvar istemi ve sonuç](#9-laboratuvar-isti̇mi-ve-sonuç)
10. [Görüntüleme istemi ve rapor](#10-görüntüleme-isti̇mi-ve-rapor)
11. [Sahiplik devri (transfer)](#11-sahiplik-devri-transfer)

### Petshop Akışları

12. [Petshop satış (POS)](#12-petshop-satış-pos)
13. [Stok giriş (tedarik)](#13-stok-giriş-tedarik)
14. [Tahsilat ve kasa kapanışı](#14-tahsilat-ve-kasa-kapanışı)

### Sistem Akışları

15. [KVKK silme talebi](#15-kvkk-silme-talebi)
16. [Hatalı tıbbi kaydı amendment ile düzeltme](#16-hatalı-tıbbi-kaydı-amendment-ile-düzeltme)

---

## 1. Yeni hasta sahibi ve hayvan kaydı

**Amaç:** Yeni bir hasta sahibini ve ona ait bir veya birden
fazla hayvanı sisteme kaydetmek.

**Aktör:** Klinik personeli (STAFF, VETERINARIAN, OWNER).

**Ön koşullar:**

- Aktif oturum (Tenant X).
- `clinic:owner:create`, `clinic:patient:create` yetkileri.

**Adımlar:**

1. Personel "Yeni hasta sahibi" ekranını açar.
2. Ad, soyad, telefon zorunlu; e-posta, adres opsiyonel girilir.
3. KVKK onayı alınır (`kvkk_consent_at = now()`).
4. Hayvan(lar) eklenir: tür (kedi/köpek/kuş), ad, cinsiyet, doğum
   tarihi, opsiyonel ırk/mikroçip.
5. Alerji/kronik durum/uyarı alanları doldurulur (varsa).
6. Kayıt tamamlanır; hasta sahibine otomatik hoş geldin SMS/e-posta
   gönderilir (Faz 8+).

**Tenant bağlamı:** Yeni kayıtlar aktif oturumun tenant'ına
atanır. `tenant_id` request'ten alınmaz.

**Yetki:** `clinic:owner:create`, `clinic:patient:create`.

**Audit event'leri:**

- `owner.created` — yeni hasta sahibi
- `patient.created` — yeni hayvan
- `kvkk.consent.recorded` — KVKK onayı (PII)

**Hata senaryoları:**

- `TR_OWNER_0001` — aynı telefonle ikinci kayıt → uyarı,
  merge önerisi.
- `TR_PATIENT_0001` — aynı mikroçip farklı sahipte → uyarı,
  transfer kontrolü.

**İlgili sayfalar:** `apps/web/src/app/[locale]/patients/new` (Faz 2)

**İlgili API'ler:**

- `POST /api/v1/owners`
- `POST /api/v1/patients`

---

## 2. Portal üzerinden randevu talebi

**Amaç:** Hasta sahibinin portal üzerinden online randevu talep
etmesi; klinik onayı sonrası randevuya dönüşür.

**Aktör:** Hasta sahibi (PET_OWNER_PORTAL).

**Ön koşullar:**

- Portal oturumu (Tenant X doğrulanmış).
- Aktif hayvan(lar).

**Adımlar:**

1. Portal kullanıcısı giriş yapar, hayvanını seçer.
2. Randevu türünü ve tercih ettiği tarih/saati seçer.
3. Açıklama ekler (opsiyonel).
4. Talep `requested` durumunda oluşturulur.
5. Klinik personeline bildirim gider (Faz 8+).
6. Klinik onaylar veya reddeder (sebep ile).
7. Onaylanan talep → normal `Appointment` kaydına dönüşür.

**Tenant bağlamı:** Portal oturumunun tenant'ı. Yeni randevu
talebi bu tenant'a atanır.

**Yetki:** `clinic:appointment:request` (portal için özel).

**Audit event'leri:**

- `appointment.requested` — talep oluştu
- `appointment.approved` / `appointment.rejected`

**Hata senaryoları:**

- `TR_APPT_0001` — geçmiş tarih seçildi → red.
- `TR_APPT_0002` — klinik kapalı gün/saat → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/portal/...` (Faz 3)

**İlgili API'ler:**

- `POST /api/v1/portal/appointment-requests`
- `PATCH /api/v1/appointments/:id/approve`

---

## 3. Klinik randevusu (resepsiyon)

**Amaç:** Klinik personelinin telefon, yüz yüze veya portal
dışından gelen randevuları planlaması.

**Aktör:** Resepsiyon (STAFF), Veteriner (VETERINARIAN).

**Ön koşullar:**

- Aktif oturum.
- Hayvan kaydı mevcut.
- `clinic:appointment:create` yetkisi.

**Adımlar:**

1. Personel hasta sahibini arar (telefon, ad-soyad).
2. Hayvan seçilir (yoksa yeni hasta sahibi + hayvan akışı).
3. Tarih/saat, süre, randevu türü, veteriner, oda seçilir.
4. Açıklama notu eklenir.
5. Kayıt oluşturulur → `scheduled` durumunda.
6. SMS/e-posta hatırlatma planlanır (Faz 8+).

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:appointment:create`.

**Audit event'leri:**

- `appointment.created`
- `appointment.confirmed` (sahibi arandıktan sonra)

**Hata senaryoları:**

- `TR_APPT_0003` — veteriner başka randevuda → uyarı.
- `TR_APPT_0004` — oda dolu → alternatif oda öner.

**İlgili sayfalar:** `apps/web/src/app/[locale]/appointments/...` (Faz 3)

**İlgili API'ler:**

- `POST /api/v1/appointments`

---

## 4. Muayene akışı (SOAP + Teşhis + Tedavi)

**Amaç:** Veterinerin muayene sırasında klinik kayıtları
yapılandırılmış biçimde oluşturması.

**Aktör:** Veteriner (VETERINARIAN).

**Ön koşullar:**

- Aktif oturum.
- `clinic:examination:create` yetkisi.
- Hayvan + veteriner bilgisi mevcut.

**Adımlar:**

1. Veteriner randevu ekranından muayeneyi başlatır
   (`in_progress` durumu).
2. Vital bulgular girilir: ateş, nabız, solunum, kilo, BCS.
3. SOAP notları yazılır:
   - S: Sahibinin gözlemleri
   - O: Muayene bulguları
   - A: Teşhis (problem listesi, ayırıcı tanı)
   - P: Tedavi planı
4. Teşhis(ler) seçilir (katalogdan) veya serbest metin girilir.
5. Tedavi planı kaydedilir (ilaç, doz, süre).
6. Reçete yazılır (ayrı akış).
7. Kontrol randevusu önerilir (opsiyonel).
8. Muayene imzalanır → `signed` durumu.
9. İmza sonrası düzeltme: amendment ile yeni muayene.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:examination:create`, `clinic:examination:sign`.

**Audit event'leri:**

- `examination.started`
- `examination.signed`
- `examination.amended` (sonradan düzeltme)

**Hata senaryoları:**

- `TR_EXAM_0001` — SOAP S alanı boş → imza engellenir.
- `TR_EXAM_0002` — reçete ilaç etkileşimi → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/consultation/...` (Faz 4)

**İlgili API'ler:**

- `POST /api/v1/examinations`
- `POST /api/v1/examinations/:id/sign`
- `POST /api/v1/examinations/:id/amendments`

---

## 5. Aşı uygulaması ve stok düşümü

**Amaç:** Hayvana aşı uygularken stoktan düşüm yapılması.

**Aktör:** Veteriner (VETERINARIAN).

**Ön koşullar:**

- Aktif muayene veya bağımsız işlem.
- `clinic:vaccination:create` yetkisi.
- Aşı ürünü ve lot stokta mevcut (yeterli miktar).

**Adımlar:**

1. Veteriner aşı formunu açar; hayvan ve aşı ürününü seçer.
2. Lot seçilir (SKT kontrolü: geçmiş lot uyarısı).
3. Doz ve uygulama yeri girilir.
4. **Stok kontrolü:** `SELECT quantity_on_hand FROM stock WHERE ...` → yeterli mi?
5. **Stok düşümü:** Transaction içinde:
   - Aşı kaydı oluşturulur
   - Stok hareketi (`clinic_use`) oluşturulur
   - Stok miktarı güncellenir
6. `idempotency_key` ile tekrar korunur.
7. Tekrar tarihi (`next_due_at`) otomatik hesaplanır (protokol'den).
8. Aşı kartı güncellenir (salt okunur görünüm).
9. Portal'da sahibi görebilir (anında).

**Tenant bağlamı:** Aktif oturumun tenant'ı. Stok da aynı tenant'ta.

**Yetki:** `clinic:vaccination:create`, `clinic:stock:decrement`.

**Audit event'leri:**

- `vaccination.created`
- `stock.decremented` (aşı lot bazında)
- `vaccination.card.updated`

**Hata senaryoları:**

- `TR_VAC_0001` — stok yetersiz → işlem iptal.
- `TR_VAC_0002` — SKT yaklaşıyorsa (< 30 gün) → uyarı.
- `TR_VAC_0003` — aynı aşı son 30 gün içinde yapıldı → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/vaccinations/...` (Faz 5)

**İlgili API'ler:**

- `POST /api/v1/vaccinations` (transactional)

---

## 6. Reçete yazımı ve dağıtımı

**Amaç:** Muayene sonrasında reçete yazılması ve ilaçların
dağıtılması.

**Aktör:** Veteriner (reçete yazımı), STAFF (dağıtım).

**Adımlar:**

1. Veteriner muayene ekranından reçeteyi açar.
2. İlaçlar eklenir (katalogdan), doz, sıklık, süre, kullanım
   talimatı girilir.
3. Reçete kaydedilir → `active` durumu.
4. Stok kontrolü: her ilaç için yeterli mi?
5. Dağıtım anında:
   - Stok düşümü (`clinic_use`) transaction içinde
   - Reçete durumu `dispensed` olur
   - Hasta sahibine ilaçlar verilir
6. Yazdırılabilir çıktı (Faz 4+).

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:prescription:create`, `clinic:prescription:dispense`.

**Audit event'leri:**

- `prescription.created`
- `prescription.dispensed`
- `stock.decremented` (ilaç bazında)

**Hata senaryoları:**

- `TR_PRESC_0001` — ilaç etkileşimi → uyarı.
- `TR_PRESC_0002` — stok yetersiz → dağıtım ertelenir.

**İlgili sayfalar:** `apps/web/src/app/[locale]/prescriptions/...` (Faz 4)

**İlgili API'ler:**

- `POST /api/v1/prescriptions`
- `POST /api/v1/prescriptions/:id/dispense`

---

## 7. Ameliyat planlama ve onam

**Amaç:** Cerrahi müdahalenin planlanması, onam alınması ve
operasyonun gerçekleştirilmesi.

**Aktör:** Veteriner/cerrah, sahibi, anestezist, asistanlar.

**Adımlar:**

1. Cerrah ameliyat planlama ekranını açar.
2. Hayvan, prosedür, ekip (cerrah, asistan, anestezist) seçilir.
3. Tarih/saat, oda belirlenir.
4. **Onam formu:** Sahibi imzalar (Faz 8 — e-imza entegrasyonu
   ile). Onam olmadan ameliyat başlatılamaz.
5. Ameliyat `consent_pending` → onam sonrası `scheduled`.
6. Ameliyat günü:
   - `in_progress` durumuna geçirilir
   - Anestezi kaydı başlatılır
   - Operasyon notu yazılır (yapılan işlem, komplikasyonlar)
   - Kullanılan malzemeler kaydedilir (stok düşümü)
7. Ameliyat tamamlanır → `completed`.
8. Yatış kararı verilirse → Yatış akışı başlatılır.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:surgery:create`, `clinic:surgery:perform`,
`clinic:consent:sign` (sahibi).

**Audit event'leri:**

- `surgery.scheduled`
- `consent.signed`
- `surgery.started`
- `surgery.completed`
- `stock.decremented` (malzeme bazında)

**Hata senaryoları:**

- `TR_SURG_0001` — onam eksik → ameliyat başlatılamaz.
- `TR_SURG_0002` — ekip üyesi müsait değil → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/surgeries/...` (Faz 4)

**İlgili API'ler:**

- `POST /api/v1/surgeries`
- `POST /api/v1/surgeries/:id/consent`
- `POST /api/v1/surgeries/:id/start`
- `POST /api/v1/surgeries/:id/complete`

---

## 8. Yatış kabul ve taburcu

**Amaç:** Hayvanın klinikte kabulü, tedavi/gözlem süreci ve
taburcu özeti.

**Aktör:** Veteriner, hemşire (STAFF).

**Adımlar:**

1. Yatış kararı (muayene veya ameliyat sonrası).
2. Hayvan, kabul nedeni, kafes seçilir → `admitted`.
3. Günlük notlar (tedavi, gözlem, ilaç) yazılır.
4. Kullanılan malzemeler stoktan düşülür.
5. Taburcu anında:
   - Taburcu özeti yazılır (tedavi, öneriler, kontrol tarihi)
   - `discharged` durumuna geçirilir
6. Sahibi bilgilendirilir.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:hospitalization:admit`, `clinic:hospitalization:discharge`.

**Audit event'leri:**

- `hospitalization.admitted`
- `hospitalization.note.added` (günlük)
- `hospitalization.discharged`
- `stock.decremented` (malzeme)

**Hata senaryoları:**

- `TR_HOSP_0001` — kafes dolu → alternatif.
- `TR_HOSP_0002` — taburcu özeti boş → engellenir.

**İlgili sayfalar:** `apps/web/src/app/[locale]/hospitalization/...` (Faz 4)

**İlgili API'ler:**

- `POST /api/v1/hospitalizations`
- `POST /api/v1/hospitalizations/:id/notes`
- `POST /api/v1/hospitalizations/:id/discharge`

---

## 9. Laboratuvar istemi ve sonuç

**Amaç:** Lab testi istemek, numune almak ve sonuçları kaydetmek.

**Aktör:** Veteriner (istem), Lab teknisyeni/iç lab (sonuç).

**Adımlar:**

1. Veteriner muayene ekranından lab istemi açar.
2. Testler seçilir (katalogdan), öncelik belirtilir.
3. İstem kaydedilir → `ordered`.
4. Numune alınır (aynı gün veya daha sonra) → `sample_taken`.
5. Lab çalışır → `in_progress`.
6. Sonuçlar girilir (sayısal + birim + referans aralığı + yorum)
   → `resulted`.
7. Veteriner sonuçları görür ve yorumlar.
8. Anormal sonuçlar için klinik uyarısı tetiklenir.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:lab:order`, `clinic:lab:result`.

**Audit event'leri:**

- `lab.ordered`
- `lab.sample_taken`
- `lab.resulted`
- `lab.amended` (sonuç düzeltme)

**Hata senaryoları:**

- `TR_LAB_0001` — dış lab bağlantısı yok → manuel sonuç.
- `TR_LAB_0002` — sonuç referans aralığı dışında → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/lab/...` (Faz 4)

**İlgili API'ler:**

- `POST /api/v1/lab-orders`
- `POST /api/v1/lab-orders/:id/results`

---

## 10. Görüntüleme istemi ve rapor

**Amaç:** Görüntüleme tetkiki istemek, çekmek ve raporlamak.

**Aktör:** Veteriner (istem), radyoloji (sonuç).

**Adımlar:**

1. Veteriner muayene ekranından görüntüleme istemi açar.
2. Tür seçilir (x-ray, ultrasound, CT, MRI, endoscopy).
3. İstem kaydedilir → `ordered`.
4. Çekim yapılır → görüntüler dosya servisine yüklenir →
   `in_progress`.
5. Radyoloji yorumu girilir (iç veya dış radyolog) → `reported`.
6. Veteriner raporu görür, hasta sahibine açıklar.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:imaging:order`, `clinic:imaging:report`.

**Audit event'leri:**

- `imaging.ordered`
- `imaging.performed`
- `imaging.reported`
- `imaging.amended`

**Hata senaryoları:**

- `TR_IMG_0001` — cihaz arızalı → manuel planlama.
- `TR_IMG_0002` — dosya yükleme hatası → tekrar dene.

**İlgili sayfalar:** `apps/web/src/app/[locale]/imaging/...` (Faz 4)

**İlgili API'ler:**

- `POST /api/v1/imaging-orders`
- `POST /api/v1/imaging-orders/:id/report`

---

## 11. Sahiplik devri (transfer)

**Amaç:** Hayvanın yeni bir sahibe devredilmesi.

**Aktör:** Klinik personeli (STAFF, VETERINARIAN, OWNER).

**Adımlar:**

1. Personel "Sahiplik devri" ekranını açar.
2. Hayvan seçilir.
3. Yeni sahip bilgileri girilir (mevcut hasta sahiplerinden veya
   yeni).
4. Transfer tarihi ve sebebi notu girilir.
5. Transfer onaylanır:
   - Hayvan `owner_id` güncellenir
   - Eski sahibin `archived_at` güncellenir (tüm hayvanlarını
     devretti ise)
6. Yeni sahibe portaldan davet gönderilir (Faz 3).

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:patient:transfer`.

**Audit event'leri:**

- `patient.transferred` (eski ve yeni sahip bilgisi)

**Hata senaryoları:**

- `TR_PATIENT_0002` — mikroçip yeni sahipte zaten kayıtlı → uyarı.
- `TR_PATIENT_0003` — eski sahibin açık bakiyesi → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/patients/:id/transfer` (Faz 2)

**İlgili API'ler:**

- `POST /api/v1/patients/:id/transfer`

---

## 12. Petshop satış (POS)

**Amaç:** Petshop kasasında ürün/hizmet satışı.

**Aktör:** Kasiyer (STAFF), müşteri (hasta sahibi veya misafir).

**Adımlar:**

1. Kasiyer POS ekranını açar.
2. Ürün/hizmet ekler (barkod okutarak veya katalogdan).
3. Müşteri seçilir (varsa; misafir olabilir).
4. İndirim uygulanır (opsiyonel).
5. Ödeme alınır (nakit/kart/transfer).
6. **Stok düşümü:** Her kalem için transaction içinde
   `sale_out` hareketi.
7. Fiş yazdırılır / PDF oluşturulur.
8. Satış `completed` durumuna geçer.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `petshop:sale:create`, `petshop:stock:decrement`.

**Audit event'leri:**

- `sale.created`
- `sale.completed`
- `payment.received`
- `stock.decremented` (kalem bazında)
- `receipt.printed` (Faz 7+)

**Hata senaryoları:**

- `TR_SALE_0001` — stok yetersiz → satış engellenir.
- `TR_SALE_0002` — ödeme başarısız → satış iptal.
- `TR_SALE_0003` — barkod bulunamadı → manuel arama.

**İlgili sayfalar:** `apps/web/src/app/[locale]/petshop/pos/...` (Faz 6)

**İlgili API'ler:**

- `POST /api/v1/sales`
- `POST /api/v1/sales/:id/payments`

---

## 13. Stok giriş (tedarik)

**Amaç:** Tedarikçiden gelen ürünlerin stoğa girişi.

**Aktör:** Depo sorumlusu (STAFF), Veteriner (ilaç/aşı).

**Adımlar:**

1. Tedarik irsaliyesi/sipariş bilgisi girilir.
2. Tedarikçi seçilir.
3. Ürünler, lot, SKT, miktar, birim maliyet girilir.
4. Stok hareketi `purchase_in` oluşturulur.
5. Stok miktarı güncellenir.
6. Min seviye uyarıları kontrol edilir (diğer ürünler için).
7. SKT yaklaşan ürünler için uyarı oluşturulur.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:stock:receive` (veya `petshop:stock:receive`).

**Audit event'leri:**

- `stock.received` (tedarik detayı)
- `stock.lot.created` (yeni lot ise)

**Hata senaryoları:**

- `TR_STOCK_0001` — SKT geçmiş → kabul reddedilir.
- `TR_STOCK_0002` — aynı lot zaten var → uyarı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/stock/receive` (Faz 6)

**İlgili API'ler:**

- `POST /api/v1/stock-movements` (`purchase_in`)

---

## 14. Tahsilat ve kasa kapanışı

**Amaç:** Klinik ve petshop tahsilatlarının kaydı, kasa
durumunun güncellenmesi, gün sonu kasa kapanışı.

**Aktör:** Kasiyer / Veteriner / OWNER.

**Adımlar:**

1. Tahsilat ekranı açılır.
2. Tahsilat türü seçilir (muayene, satış, aşı, vb.).
3. Müşteri, tutar, ödeme yöntemi girilir.
4. Kasa seçilir.
5. Tahsilat `completed` durumuna geçer.
6. Kasa bakiyesi güncellenir.
7. Gün sonu: kasa kapanışı raporu oluşturulur, beklenen
   ile gerçek bakiye karşılaştırılır, fark varsa açıklama istenir.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:payment:create`, `petshop:payment:create`,
`clinic:cash:close`.

**Audit event'leri:**

- `payment.received`
- `cash.updated`
- `cash.closed` (gün sonu)

**Hata senaryoları:**

- `TR_PAY_0001` — kasa limiti aşıldı → uyarı.
- `TR_PAY_0002` — kasa kapanışı farkı → yönetici onayı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/payments/...` (Faz 7)

**İlgili API'ler:**

- `POST /api/v1/payments`
- `POST /api/v1/cash/close`

---

## 15. KVKK silme talebi

**Amaç:** Hasta sahibinin KVKK kapsamında kişisel verilerinin
silinmesi talebi.

**Aktör:** Hasta sahibi (talep), Klinik personeli (işlem).

**Adımlar:**

1. Talep alınır (e-posta, yüz yüze veya portal).
2. `kvkk_erasure_requested_at` set edilir.
3. PII alanlar maskelenir:
   - `first_name`, `last_name` → "KİŞİ-XXXX"
   - `phone` → "+90 XXX XXX 00 00"
   - `email` → "erased+xxx@vetniva.local"
4. Tıbbi kayıtlar korunur (yasal zorunluluk, 5 yıl).
5. Hayvan(lar) `archived` olur.
6. Audit: `kvkk.erasure.completed` kaydı oluşturulur
   (talep tarihi, işlem tarihi, işlemi yapan).
7. Talep sahibine onay e-postası gönderilir.

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:owner:erase` (OWNER veya SUPERADMIN).

**Audit event'leri:**

- `kvkk.erasure.requested`
- `kvkk.erasure.completed` (PII erişimi sınırlı)

**Hata senaryoları:**

- `TR_KVKK_0001` — aktif tedavi süreci → uyarı, tamamlama
  beklenecek.
- `TR_KVKK_0002` — yasal saklama süresi dolmamış tıbbi kayıt →
  masked (silinmez).

**İlgili sayfalar:** `apps/web/src/app/[locale]/settings/kvkk` (Faz 2+)

**İlgili API'ler:**

- `POST /api/v1/owners/:id/erase`

---

## 16. Hatalı tıbbi kaydı amendment ile düzeltme

**Amaç:** Yanlış girilen tıbbi kaydı (muayene, aşı, reçete vb.)
silmeden, amendment oluşturarak düzeltmek.

**Aktör:** Veteriner (düzeltme yapan).

**Adımlar:**

1. Personel "Düzeltme talebi" ekranını açar.
2. Düzeltilecek kaydı seçer.
3. Düzeltme sebebini not düşer.
4. Sistem:
   - Orijinal kaydı `amended` durumuna alır
   - Yeni bir kayıt oluşturur (`amends_id` ile orijinale bağlı)
   - Yeni kayıt aktif hale gelir
5. Audit: `record.amended` event'i oluşturulur (orijinal + yeni
   + sebep).
6. Tıbbi zaman çizelgesi her iki kaydı da gösterir
   (düzeltme tarihi + sebep).

**Tenant bağlamı:** Aktif oturumun tenant'ı.

**Yetki:** `clinic:record:amend` (VETERINARIAN, OWNER).

**Audit event'leri:**

- `record.amended` (orijinal id, yeni id, sebep, kullanıcı)

**Hata senaryoları:**

- `TR_AMEND_0001` — orijinal kayıt çok eski (yasal saklama
  dışında) → özel onay.
- `TR_AMEND_0002` — başka kullanıcı üzerinde aktif düzeltme →
  çakışma uyarısı.

**İlgili sayfalar:** `apps/web/src/app/[locale]/records/:id/amend`

**İlgili API'ler:**

- `POST /api/v1/examinations/:id/amendments`
- `POST /api/v1/vaccinations/:id/amendments`
- `POST /api/v1/prescriptions/:id/amendments`

---

## Genel Notlar

- Tüm akışlar **tenant bağlamında** çalışır; `tenant_id` her
  kayıtta zorunludur.
- Fiziksel silme yoktur; düzeltme amendment/ters kayıt iledir.
- Audit event'leri `docs/ai/AI_KNOWLEDGE_BASE.md` ve log
  altyapısı ile entegredir (Faz 1+).
- Hata kodları `docs/errors/ERROR_CATALOG.md` ile uyumludur.
- Sayfa/API referansları ilgili fazda implementasyonla
  birlikte kesinleşir.
