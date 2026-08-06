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

## API kabul otomasyonu

`tools/acceptance-test` paketi, aynı on senaryonun API seviyesindeki
tekrar edilebilir kabul koşumunu sağlar. Araç, yeni müşteri/hayvan
senaryosundan sonra yalnızca o koşuma ait bir portal hesabı oluşturur,
email doğrulamasını tamamlar ve portal randevu talebini bu oturumla
gönderir. Talebin onay adımı ise personel oturumuyla çalışır. Böylece
portal sahibi ile klinik personelinin yetkileri birbirine karışmaz.

Gerekli ortam değişkenleri:

- `UAT_BASE_URL`, `UAT_TOKEN`, `UAT_VETERINARIAN_TOKEN`
- `UAT_TENANT_ID`, `UAT_BRANCH_ID`
- `UAT_VACCINE_PROTOCOL_ID`, `UAT_VACCINE_STOCK_PRODUCT_ID`
- `UAT_PRODUCT_ID`, `UAT_CAGE_ID`, `UAT_LAB_TEST_ID`

İsteğe bağlı `UAT_PORTAL_TOKEN` sağlanırsa mevcut portal oturumu
kullanılır; sağlanmazsa koşum, oluşturduğu demo sahibi için geçici
portal oturumunu üretir. Randevu zamanı tekrar koşumlarda çakışmaması
için bir hafta sonrasındaki benzersiz bir slotta seçilir.

Çıktı JSON raporu ile değerlendirilir; geçiş için tüm 10 senaryonun ve
tüm adımların başarılı olması gerekir.

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

## Kabul Kriteri Sözlüğü (GOAL-121, FAZ-12)

Her pilot adımı için tek bir "PASS/FAIL" kararının arkasında
üç katmanlı bir kontrol vardır. Aşağıdaki sözlük hem operatörün
(el ile) hem runner'ın (otomatik) karar mekaniğini paylaşır.

### Sözlük terimleri

| Terim                  | Açıklama                                                          | Kaynak                                            |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `PASS`                 | Adımın tüm kontrolleri geçti                                      | `runner.ts` `UatStepResult.passed`                |
| `FAIL`                 | En az bir kontrol başarısız                                       | `runner.ts` `UatStepResult.error`                 |
| `expectedStatus`       | Beklenen HTTP status; tek sayı veya aralık                        | `UatStep.expectStatus`                            |
| `expectedField`        | Response body'sinde truthy olması beklenen alan (nokta notasyonu) | `UatStep.expectField`                             |
| `placeholderSelfRef`   | Placeholder kendi anahtarına referans veriyor (imkansız)          | `PLACEHOLDER_SELF_REF` (`UAT-PLACEHOLDER-0001`)   |
| `placeholderNotFound`  | Placeholder context'te bulunamadı                                 | `PLACEHOLDER_NOT_FOUND` (`UAT-PLACEHOLDER-0002`)  |
| `piiMasked`            | Pilot yorumu PII içerdiği için maskelendi                         | `FEEDBACK_PII_MASKED` (`UAT-FEEDBACK-0001`)       |
| `invalidRating`        | Puan 0-5 dışında                                                  | `FEEDBACK_INVALID_RATING` (`UAT-FEEDBACK-0002`)   |
| `missingReviewer`      | Reviewer adı boş                                                  | `FEEDBACK_MISSING_REVIEWER` (`UAT-FEEDBACK-0003`) |
| `tenantBoundaryBreach` | Yanıt `X-Tenant-Id` header'ı istektekini tutmuyor                 | (k6 tarafı, FAZ-12 sonrası)                       |

### PASS kuralı

Bir adım `passed=true` olması için:

1. `expectedStatus` listede en az bir eşleşme olmalı (örn. 200 veya 201).
2. `expectedField` tanımlıysa response body'sinde ilgili alan
   `isTruthyField` kuralına göre truthy olmalı (string → uzunluk > 0;
   sayı → sıfır olmayan finite; dizi/object → boş olmayan).
3. Fetch aşamasında network/parse hatası olmamalı.

Senaryo `allPassed=true` olması için **tüm adımlar** bu kurala
uymalı ve adım sayısı `scenario.steps.length` ile eşleşmeli
(erken `break` = kısmi çalıştırma = FAIL).

### Geçerli sayılmayan durumlar

Aşağıdaki durumlar "kısmi başarı" değil, **FAIL**'dir:

- Adım 3'te hata aldıktan sonra adım 4-5'in boş `passed=true`
  ile geçmesi (senaryo `break` ile kesilir; toplam adım sayısı
  eşleşmediği için `allPassed=false`).
- `placeholderNotFound` hatası alan bir adım (placeholder
  çözümlemesi yarıda kaldı; gerçek test verisi sağlanmalı).
- `placeholderSelfRef` (yapılandırma hatası; config güncellenmeli).

### Kabul sözlüğü — senaryo bazlı PASS kriterleri

| Senaryo             | Modül           | Adım sayısı | Beklenen toplam süre                  | Ek kriter                                                                        |
| ------------------- | --------------- | ----------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `new_owner_patient` | owner           | 4           | < 90s                                 | Tüm zorunlu alanlar (firstName, lastName, phone, email) ve KVKK onayı doğrulanır |
| `appointment`       | appointment     | 3           | < 30s                                 | Slot çakışması yoksa 201; varsa net 4xx hata mesajı                              |
| `examination`       | examination     | 3           | < 15dk (UI süresi; API toplamı < 5s)  | SOAP notu en az 1 cümle her bölümde; imza sonrası amendment akışı                |
| `vaccination`       | vaccination     | 2           | < 60s                                 | Lot aktif, SKT geçmemiş, stok düşümü sonradan doğrulanır                         |
| `petshop_sale`      | petshop         | 3           | < 90s                                 | Stok otomatik düşer, fiş PDF açılır (UI)                                         |
| `collection`        | payment         | 2           | < 30s                                 | Müşteri bakiyesi doğru güncellenir, kasa hareketi oluşur                         |
| `surgery`           | surgery         | 3           | < 30dk (UI süresi; API toplamı < 5s)  | Onam formu imzalanmadan başlamaz; anestezi her 5dk vital                         |
| `hospitalization`   | hospitalization | 3           | < 20dk (UI süresi; API toplamı < 5s)  | Order schedule doğru uygulanır, taburcu sonrası kafes boşalır                    |
| `laboratory`        | lab             | 4           | < 20dk (UI süresi; API toplamı < 10s) | Anormal flag kırmızı gösterilir (UI), onay sonrası muayeneye bağlanır            |
| `portal`            | portal          | 2           | < 5dk                                 | Yalnızca kendi hayvanları görünür (UI), PDF indir çalışır                        |

> **UI süresi** kuralı otomatik runner tarafından doğrulanmaz;
> saha gözlemi veya tarayıcı E2E testi (FAZ-13+) ile ölçülür.
> API tarafında PASS koşulu yalnızca HTTP durum kodu + expected
> field doğrulamasıdır.

### Genel kabul kriterleri (pilot ekibin skoru)

- Tüm 10 senaryo **≥ 3.5/5** ortalama pilot puanı.
- Kritik hata (veri kaybı, tenant izolasyonu ihlali, audit
  eksikliği) **yok** (bkz. `error_events`).
- Tüm senaryolar kabul sözlüğündeki ek kriterleri karşılar.
- `uat-report.md` içinde "Gereksiz adım" olarak işaretlenen
  adım sayısı **< 5** (toplam 30 adım üzerinden; %15 üzeri UX
  sorunu sayılır).

### Adım `expectField` eşleme tablosu

Aşağıdaki eşleme runner tarafından otomatik yapılır; pilot
ekibin bilmesine gerek yoktur, ancak hata ayıklamada yararlıdır:

| Adım                         | Beklenen alan |
| ---------------------------- | ------------- |
| `create_owner`               | `id`          |
| `create_patient`             | `id`          |
| `create_appointment`         | `id`          |
| `start_examination`          | `id`          |
| `create_vaccine_application` | `id`          |
| `create_sale`                | `sale.id`     |
| `create_payment`             | `id`          |
| `create_surgery_plan`        | `id`          |
| `create_hospitalization`     | `id`          |
| `create_lab_order`           | `id`          |
| `create_portal_request`      | `id`          |

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-121 pilot kabul testleri`
- Docs: (bu commit) — `docs(operations): GOAL-121 kabul kriteri sözlüğü`
