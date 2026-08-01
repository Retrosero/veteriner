/**

- @file Pilot kapsamı ve MVP dışı bırakılan konular.
- @module docs/domain/PILOT_SCOPE
-
- @description GOAL-001 (FAZ-0) kapsamında pilot klinik için
- hedeflenen özelliklerin ve bilinçli olarak MVP dışında
- bırakılan konuların netleştirilmesi. Sonraki tüm goal'lar
- (GOAL-002+) bu dokümanı referans alır.
-
- @author GOAL-001 (FAZ-0) pilot kapsamı
  */

# Pilot Klinik Kapsamı (MVP-1)

Bu doküman, pilot klinik için **MVP-1** kapsamında olacak
özellikleri ve **bilinçli olarak dışarıda bırakılan** konuları
tanımlar. Tüm goal'lar (GOAL-002+) bu sınırları referans alarak
ilerler; kapsam dışı konular eklenirse bu doküman güncellenir.

## Hedef kullanıcı

- **Konum:** Türkiye (İstanbul pilotu, daha sonra diğer iller)
- **Klinik tipi:** Küçük/orta ölçekli veteriner kliniği
- **Personel:** 1-5 veteriner, 1-3 resepsiyon/hemşire
- **Petshop:** Klinik içinde, ayrı depo veya klinik deposuyla ortak
- **Hasta sahipleri:** Bireysel müşteriler, kedi/köpek/kuş sahipleri

## MVP-1 dahilindeki modüller

### Klinik operasyonu (Faz 2-5)

- Hasta sahibi kaydı (CRUD + arama)
- Hayvan kaydı (kedi, köpek, kuş + ırk, yaş, mikroçip, alerji,
  kronik durum, uyarı)
- Sahiplik geçmişi (transfer/ölüm, append-only)
- Mikroçip/pasaport temel alanları
- Klinik takvimi (günlük + haftalık görünüm)
- Randevu yönetimi (oluştur, değiştir, iptal, durum)
- Resepsiyon: bekleme listesi
- Muayene (SOAP notları, vital bulgular, teşhis, tedavi planı)
- Reçete (yazım, dağıtım, stok düşümü)
- Aşı (ürün kataloğu, lot, SKT, hatırlatma, stok düşümü)
- Ameliyat (planlama, onam, anestezi, operasyon notu)
- Yatış (kabul, günlük notlar, taburcu özeti)
- Laboratuvar (istem, numune, sonuç)
- Görüntüleme (x-ray, ultrasound, CT, MRI, endoscopy)
- Klinik tüketim → otomatik stok düşümü
- Aşı kartı (portal görünümü)

### Petshop (Faz 6)

- Barkodlu satış (POS)
- Ürün ve hizmet kartları
- Depo/raf/lot/SKT takibi
- Tedarik ve satın alma
- Müşteri sadakati (basit puan)
- Kampanya (basit yüzde)
- Fiyat listeleri ve hizmet ücretleri
- Müşteri/hayvan bazlı alışveriş geçmişi
- Klinik ve petshop stoklarının kontrollü biçimde birlikte
  çalışması

### Finans (Faz 7)

- Satış taslağı, kesinleştirme, iade
- Tahsilat, kasa gün sonu, kasa raporları
- Temel finans raporları
- Müşteri borç/alacak görünümü

### Hasta sahibi portalı (Faz 3)

- Portal kayıt, giriş (Tenant X doğrulanmış)
- Hayvan listesi ve detay (salt okunur)
- Aşı kartı görüntüleme
- Online randevu talebi
- Randevu hatırlatma (SMS, e-posta)
- Tahsilat geçmişi (salt okunur)
- KVKK onayı, PII görüntüleme
- Dosya indirme (lab sonuçları vb.)

### Platform (Faz 1)

- Multi-tenant mimari (Tenant + Şube)
- PostgreSQL RLS ile tenant izolasyonu
- Kullanıcı, oturum, kimlik doğrulama (Tenant X)
- Rol ve izin motoru (RBAC)
- Audit log
- Merkezi hata yakalama
- Superadmin tenant görünümü
- Modül/paket feature flag altyapısı
- Dosya servisi (görsel, lab sonucu PDF, vb.)
- Bildirim altyapısı temeli (in-app, e-posta)

### Çapraz

- Çoklu dil (tr-TR varsayılan, en-GB iskelet)
- KVKK uyumlu tasarım (PII maskeleme, veri silme talebi)
- Audit ve hata standardı (tek kod sistemi)
- Dokümantasyon ve AI bilgi havuzu

## MVP-1 dışı bırakılan konular (bilinçli)

Aşağıdaki konular pilot kapsamda **yoktur**; sonraki
fazlarda veya ayrı goal'larda ele alınır.

### İngiltere / en-GB desteği (Faz 14)

- İngiltere klinik kayıt kuralları (RCVS, BVA)
- GBP / VAT / İngiltere fiyatlandırma
- NHS, RCVS sistemleri adaptörü
- Mikroçip UK veritabanı entegrasyonu (Petlog)
- İngiltere reçete formatı
- e-SMM (İngiltere) — VAT-ready fiş/fatura

**Neden dışarıda:** Pilot Türkiye'de. en-GB çevirileri iskelet
olarak duruyor; fonksiyonel adaptörler Faz 14'te.

### e-SMM entegrasyonu (Faz 7+)

- GİB e-Fatura/e-Arşiv entegrasyonu
- Mali değer içeren tüm çıktılar pilot'ta PDF olarak alınır;
  resmi e-belgeye dönüşüm sonra.

**Neden dışarıda:** Yasal süreç ve sertifikasyon gerekiyor;
pilot kapsamda manuel PDF çıktısı yeterli.

### Resmi veteriner sistemleri adaptörleri (Faz 14+)

- TÜRKVET, e-İlaç, İTS entegrasyonları
- aşı raporlarının resmi sunuculara gönderimi
- reçete raporlaması

**Neden dışarıda:** Kurumsal entegrasyon maliyetli; pilot
kapsamda klinik içi kayıt yeterli.

### Gelişmiş finans (Faz 8+)

- Çoklu KDV oranları, indirim mekanizmaları
- Tedarikçi fatura yönetimi
- Banka entegrasyonu (e-ekstre, otomatik mutabakat)
- Çoklu döviz

**Neden dışarıda:** Pilot için tek KDV oranı, tek döviz (₺),
basit tahsilat yeterli.

### Laboratuvar cihaz entegrasyonları (Faz 13+)

- Doğrudan cihaz bağlantıları (Mindray, IDEXX vb.)
- HL7 / ASTM protokolü
- DICOM gateway (ileride)

**Neden dışarıda:** Pilot'ta manuel veri girişi kabul edilebilir;
resmi entegrasyon Faz 13'te.

### Beyaz etiket (white-label) (Yok)

- Klinik başına tema/logo/alan adı özelleştirmesi
- E-posta/sms şablonlarının tenant bazlı özelleştirilmesi

**Neden dışarıda:** Pilot tek bir marka (VetNiva) için
geliştiriliyor; white-label MVP dışı.

### Mobil uygulama (native) (Faz 15+)

- iOS/Android native uygulama
- Push notification
- Offline-first

**Neden dışarıda:** Pilot web-first. PWA Faz 12'de.

### Yapay zeka özellikleri (Faz 16+)

- Triage önerileri
- Otomatik SOAP taslağı
- Aşı hatırlatma optimizasyonu
- Anomali tespiti

**Neden dışarıda:** Pilot kapsamda kurallar ve şablonlar yeterli;
yapay zeka MVP sonrası.

### Çoklu şube (operasyonel) (Faz 1 altyapısı hazır)

- Veri modeli çoklu şubeye uygun.
- Pilot **tek şube** ile başlar.
- Şubeler arası stok transferi Faz 1'de çalışır, operasyonel
  kullanım Faz 6+ sırasında.

## Karar kriterleri (kapsam netleştirmesi için)

Bir konunun pilot'a eklenmesi/çıkarılması için:

1. **Yasal zorunluluk:** KVKK, vergi, mesleki yönetmelik gereği mi?
2. **Klinik çalışma durması:** Bu özellik olmadan pilot yapılabilir mi?
3. **Maliyet/fayda:** Geliştirme maliyeti < 2 hafta ve kullanıcı için
   yüksek değer mi?
4. **Bağımlılık:** Diğer MVP-1 özelliklerini engelliyor mu?
5. **Ölçeklenebilirlik:** Sonraki fazlarda eklemek pahalı mı?

Eğer 1-3 "evet" ama 4-5 "hayır" ise pilot'a ekle; aksi halde MVP
sonrasına bırak.

## Pilot kapsam güncelleme süreci

Kapsam değişikliği için:

1. Yeni konu önerisi → bu dokümana PR açılır.
2. Mevcut pilot şube + 2 işletme sahibi + 2 personel ile test
   senaryoları gözden geçirilir.
3. Owner (kullanıcı) onayı.
4. PR merge → ilgili goal'lar güncellenir.

## İlgili dokümanlar

- `PROJECT_CONTEXT.md` — ürün vizyonu, ilkeler
- `docs/domain/DOMAIN_GLOSSARY.md` — varlık/kavram sözlüğü
- `docs/domain/CLINICAL_FLOWS.md` — uçtan uca iş akışları
- `PHASE_PLAN.md` — tüm fazların planı
- `goals/GOAL-000` → `goals/GOAL-005` — Faz 0 detay goal'ları
- `goals/GOAL-010+` — Faz 1+ detay goal'ları

---

**Pilot kapsamı, GOAL-001 ile birlikte tanımlanmış ve tüm
sonraki goal'lar için referans alınacak şekilde bu dokümana
sabitlenmiştir. Değişiklikler PR + onay sürecinden geçer.**
