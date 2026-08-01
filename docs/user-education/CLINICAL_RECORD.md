# Kullanıcı Eğitimi — Klinik Kayıt Yönetimi

## Amaç

Muayene, SOAP notu, vital bulgular, teşhis, tedavi planı,
reçete, lab sonucu ve taburcu özeti gibi klinik kayıtların
nasıl oluşturulacağını, güncelleneceğini ve paylaşılacağını
açıklar.

## Hedef kitle

- VETERINARIAN (ana kullanıcı)
- LAB_TECH (lab sonucu)
- OWNER (portal görüntüleme)

## Senaryolar

### Senaryo 1 — Muayene başlat

1. Randevu detay sayfasından "Muayeneyi Başlat" butonuna tıkla.
2. Veya doğrudan `/clinic/patients/{patientId}/examinations/new`
   sayfasına git.
3. Branş, tür (genel/aşı/kontrol/ameliyat/lab/görüntüleme) seç.
4. "Başlat" butonuna tıkla.
5. Muayene çalışma ekranı açılır (SOAP, Vitals, Diagnoses,
   Orders, Prescriptions, Followups sekmeleri).

### Senaryo 2 — SOAP notu yaz

1. Muayene çalışma ekranında "SOAP" sekmesine tıkla.
2. **S**ubjective (sahibinin anlattığı şikâyet), **O**bjective
   (gözlem), **A**ssessment (ön değerlendirme), **P**lan
   (tedavi planı) alanlarını doldur.
3. "Kaydet" butonuna tıkla.
4. SOAP notu muayeneye bağlanır; sonradan düzeltme için
   amendment oluşturulabilir.

### Senaryo 3 — Vital bulguları ekle

1. "Vitals" sekmesine tıkla.
2. Ateş (°C), nabız (bpm), solunum (rpm), vücut ağırlığı (kg),
   vücut sıcaklığı (°C) alanlarını doldur.
3. "Kaydet" butonuna tıkla.

### Senaryo 4 — Teşhis gir

1. "Diagnoses" sekmesine tıkla.
2. ICD-10 veya VetBERT kodu gir (örn. `J45` — astım).
3. Açıklama ekle (örn. "kronik bronşit").
4. "Kaydet" butonuna tıkla.
5. Teşhis listesi muayeneye eklenir.

### Senaryo 5 — Tedavi planı + order

1. "Orders" sekmesine tıkla.
2. Order türünü seç (medication | fluid_therapy | feeding |
   vital_check | grooming | other).
3. Order detaylarını gir (ilaç adı, doz, sıklık, süre).
4. "Kaydet" butonuna tıkla.

### Senaryo 6 — Reçete yaz

1. "Prescriptions" sekmesine tıkla.
2. İlaçları seç (ilaç kataloğundan veya manuel).
3. Doz, sıklık, süre, kullanım yolu gir.
4. "Kaydet" butonuna tıkla.
5. PDF render ile "Reçete Yazdır" butonu görünür.
6. Portal paylaşımı için "Portal'a Gönder" butonuna tıkla.

### Senaryo 7 — Muayeneyi imzala

1. Tüm sekmeleri doldurduktan sonra "İmzala" butonuna tıkla.
2. Sistem muayeneyi `completed` durumuna geçirir.
3. `signedAt`, `signedBy` set edilir.
4. **Önemli:** İmzalı muayenede doğrudan düzeltme yapılamaz;
   her değişiklik için amendment oluşturulur.

### Senaryo 8 — Hatalı kaydı düzelt (amendment)

1. İmzalı muayene detayına git.
2. "Düzeltme Aç" butonuna tıkla.
3. Düzeltme nedenini gir.
4. Değişiklikleri yap.
5. "Kaydet" butonuna tıkla.
6. Sistem yeni bir amendment versiyonu oluşturur; eski
   versiyon `supersededAt` ile işaretlenir.
7. **Audit:** `audit:examination.amend` üretilir.

## İpuçları

- **İmza öncesi:** Tüm alanları doldurmadan imzalama. Sonradan
  her değişiklik amendment oluşturur.
- **PII:** Reçete ve SOAP notlarında hasta sahibi bilgisi
  görüntülenir; tüm erişimler audit'lenir.
- **Portal paylaşımı:** Reçete + taburcu özeti portal'a
  gönderilebilir. "Portal'a Gönder" butonu ile 7 gün geçerli
  paylaşım linki oluşturulur.
- **PDF:** Tüm klinik kayıtlar için PDF render mevcuttur.
  "PDF İndir" butonu.

## Sık karşılaşılan sorular

**S: İmzalı muayeneyi silebilir miyim?**
C: Hayır, klinik ve finansal kayıtlar append-only'dir. Düzeltme
için amendment oluşturun.

**S: Reçeteyi sonradan güncelleyebilir miyim?**
C: Evet, amendment ile. Eski versiyon korunur, yeni
versiyon eklenir. Audit'te her iki versiyon görünür.

**S: Lab sonucunu muayeneye nasıl bağlarım?**
C: Lab order oluştururken `examinationId` alanını set edin.
Sonuç girildiğinde otomatik olarak muayeneye bağlanır.

**S: Taburcu özeti nerede?**
C: Yatış detayında "Taburcu Özeti" sekmesi. Yatış
`active → discharged` geçişiyle birlikte oluşturulur.

## Hata durumları

| Hata                        | Çözüm                                       |
| --------------------------- | ------------------------------------------- |
| Pasif muayene               | Yeni muayene oluşturun.                     |
| İmzalı muayenede değişiklik | Amendment açın.                             |
| Cross-tenant                | Tenant sınırı; yetkili kliniğe yönlendirin. |
| Yetkisiz                    | VETERINARIAN rolü gerekli.                  |

## İlgili dokümanlar

- `docs/workflows/examination_start.md`
- `docs/api/api.get._api_v1_clinic_examinations.md`
- `goals/GOAL-040 → 047_COMPLETION_REPORT.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:examination:*`
