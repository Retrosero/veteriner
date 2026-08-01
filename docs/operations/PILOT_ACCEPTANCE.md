# Pilot Kabul Testleri (GOAL-121)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

Pilot veterinerle uygulanacak uçtan uca kabul testleri. Her
senaryoda işlem süresi, hata, gereksiz adım ve kullanıcı
yorumu kaydedilir.

## Senaryolar (10)

### 1. Yeni müşteri/hayvan

- **Adımlar:**
  1. `/clinic/owners/new` → yeni sahip oluştur.
  2. `/clinic/owners/{id}/patients/new` → yeni hayvan
     ekle.
- **Kabul kriterleri:**
  - Toplam süre < 90 saniye.
  - Hata yok.
  - Tüm zorunlu alanlar doldurulur.
- **Test kullanıcısı:** `staff@pilot.vetniva.local`.

### 2. Randevu

- **Adımlar:**
  1. `/clinic/calendar/new` → yeni randevu.
  2. Tarih + saat + veteriner seç.
  3. Kaydet.
- **Kabul kriterleri:**
  - Süre < 30 saniye.
  - Slot çakışması yoksa 201.
  - Çakışma varsa net hata mesajı.
- **Test kullanıcısı:** `staff@pilot.vetniva.local`.

### 3. Muayene

- **Adımlar:**
  1. Randevudan "Muayeneyi Başlat" → `/clinic/examinations/{id}/work`.
  2. SOAP sekmesi: S, O, A, P doldur.
  3. Vital: ateş, nabız, solunum.
  4. Teşhis: ICD-10.
  5. Order: ilaç.
  6. Reçete: yaz.
  7. İmzala.
- **Kabul kriterleri:**
  - Süre < 15 dakika.
  - SOAP'ta en az 1 cümle her bölümde.
  - İmza sonrası amendment gerekli değişiklikler için.
- **Test kullanıcısı:** `vet@pilot.vetniva.local`.

### 4. Aşı

- **Adımlar:**
  1. `/clinic/patients/{id}/vaccinations/new` → aşı seç.
  2. Lot + SKT gir.
  3. Uygulama bilgileri (route, site, dose).
  4. Kaydet.
  5. Stok düşümünü doğrula.
- **Kabul kriterleri:**
  - Süre < 60 saniye.
  - Lot aktif ve SKT geçmemiş.
  - Stok miktarı doğru düşmüş.
- **Test kullanıcısı:** `vet@pilot.vetniva.local`.

### 5. Petshop satışı

- **Adımlar:**
  1. `/petshop/sales/new` → POS.
  2. Müşteri + ürünler barkod ile ekle.
  3. Ödeme yöntemi seç.
  4. "Satışı Tamamla".
  5. Fiş yazdır.
- **Kabul kriterleri:**
  - Süre < 90 saniye.
  - Stok otomatik düşer.
  - Fiş PDF açılır.
- **Test kullanıcısı:** `staff@pilot.vetniva.local`.

### 6. Tahsilat

- **Adımlar:**
  1. Satış detayından "Ödeme Al".
  2. Tutar + yöntem gir.
  3. Kaydet.
  4. Kasa gün sonu hareketini kontrol et.
- **Kabul kriterleri:**
  - Süre < 30 saniye.
  - Customer balance doğru güncellenir.
  - Kasa hareketi oluşur.
- **Test kullanıcısı:** `staff@pilot.vetniva.local`.

### 7. Ameliyat

- **Adımlar:**
  1. `/clinic/surgery-plans/new` → ameliyat planı.
  2. Onam formu oluştur.
  3. Anestezi takibi başlat.
  4. Operasyon notu (ekip + malzeme).
  5. Ameliyatı tamamla.
- **Kabul kriterleri:**
  - Süre < 30 dakika (normal senaryo).
  - Onam formu imzalanmadan başlamaz.
  - Anestezi her 5 dakikada vital kaydeder.
- **Test kullanıcısı:** `vet@pilot.vetniva.local`.

### 8. Yatış

- **Adımlar:**
  1. `/clinic/patients/{id}/hospitalizations/new` → yatış.
  2. Kafes ata.
  3. Order planla (medication + vital_check).
  4. Gözlem kaydı.
  5. Taburcu özeti.
- **Kabul kriterleri:**
  - Süre < 20 dakika.
  - Order schedule doğru uygulanır.
  - Taburcu sonrası kafes boşalır.
- **Test kullanıcısı:** `vet@pilot.vetniva.local`.

### 9. Laboratuvar

- **Adımlar:**
  1. `/clinic/lab-orders/new` → lab order.
  2. Numune toplama.
  3. Sonuç gir (analyte + value + abnormalFlag).
  4. Uzman onayı (submit → approve).
- **Kabul kriterleri:**
  - Süre < 20 dakika.
  - Anormal flag kırmızı gösterilir.
  - Onay sonrası muayeneye bağlanır.
- **Test kullanıcısı:** `vet@pilot.vetniva.local`.

### 10. Portal

- **Adımlar:**
  1. `owner@pilot.vetniva.local` → portal login.
  2. `/portal/pets` → hayvanları gör.
  3. Aşı kartı indir (PDF).
  4. Randevu talep et.
  5. Çıkış.
- **Kabul kriterleri:**
  - Süre < 5 dakika.
  - Yalnızca kendi hayvanları görünür.
  - PDF indir çalışır.
- **Test kullanıcısı:** `owner@pilot.vetniva.local`.

## Test Şablonu

Her senaryo için doldurulacak tablo:

| Senaryo                | Kullanıcı | Süre | Hata | Adım sayısı | Yorum       | Skor (1-5) |
| ---------------------- | --------- | ---- | ---- | ----------- | ----------- | ---------- |
| 1. Yeni müşteri/hayvan | staff     | 75s  | yok  | 4           | "Anlaşılır" | 4          |
| 2. Randevu             | staff     | 22s  | yok  | 3           | "Hızlı"     | 5          |
| ...                    | ...       | ...  | ...  | ...         | ...         | ...        |

## Kabul Kriterleri (Genel)

- Tüm 10 senaryo ≥ 3.5/5 skor.
- Kritik hata (veri kaybı, tenant izolasyonu ihlali, audit
  eksikliği) **yok**.
- Tüm akışlar ≤ hedef süreler.

## Yapılmayanlar / Bilinçli Atlamalar

- **Gerçek pilot ortamı** → Faz 12+ (FAZ-12 kapsamında
  pilot tenant kurulumu + acceptance runbook).
- **Pilot veri şifreleme** → Faz 12+ (production data
  encryption at-rest).

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-121 pilot kabul testleri`
