# Faz ve Goal Planı

## Faz 0 — Keşif, ürün kuralları ve proje iskeleti

Amaç: Koddan önce pilot kliniğin gerçek akışlarını ve teknik çalışma standartlarını kesinleştirmek.

Goal'lar:

- GOAL-000 Proje repository, monorepo ve kalite kapıları
- GOAL-001 Domain sözlüğü ve pilot klinik iş akışları
- GOAL-002 Rol/yetki matrisi
- GOAL-003 Çoklu dil ve ülke adaptörü sözleşmesi
- GOAL-004 Log, audit ve hata kodu standardı
- GOAL-005 Dokümantasyon ve AI bilgi havuzu şeması

Çıkış kriteri:

- Kodlama standartları ve domain sözleşmeleri onaylı
- CI temel kapıları çalışıyor
- Goal sistemi uygulanabilir

## Faz 1 — Platform çekirdeği

Goal'lar:

- Tenant ve şube
- Kullanıcı, oturum ve güvenli kimlik doğrulama
- Rol ve izin
- Modül/paket feature flag altyapısı
- PostgreSQL RLS
- Audit altyapısı
- Merkezi hata yakalama
- Dosya servisi
- Bildirim altyapısının temeli
- Superadmin tenant görünümü

## Faz 2 — Hasta sahibi ve hayvan

Goal'lar:

- Hasta sahibi CRUD ve arama
- Hayvan kaydı: kedi, köpek, kuş
- Sahiplik geçmişi
- Mikroçip/pasaport temel alanları
- Alerji/kronik durum/uyarı
- Hayvan zaman çizelgesi
- Dosya ve görsel ekleri
- Portal erişim daveti

## Faz 3 — Randevu ve hasta sahibi portalı

Goal'lar:

- Klinik takvimi
- Randevu oluşturma/değiştirme/iptal
- Personel ve oda/kaynak planlama
- Bekleme listesi
- Portal kayıt/giriş
- Portal hayvan listesi
- Online randevu talebi
- Randevu hatırlatma
- Portal tenant izolasyonu ve güvenlik testleri

## Faz 4 — Muayene ve klinik kayıt

Goal'lar:

- Muayene başlatma
- SOAP kaydı
- Vital bulgular
- Teşhis
- Tedavi planı
- Reçete
- Kontrol randevusu
- Klinik kayıt versiyonlama
- PDF/çıktı
- Klinik zaman çizelgesi

## Faz 5 — Aşı ve koruyucu sağlık

Goal'lar:

- Aşı ürün/protokol tanımı
- Hayvana aşı uygulama
- Lot/SKT/doz
- Aşı kartı
- Tekrar tarihi
- Hatırlatma job'u
- Portal aşı görünümü
- Stok düşümü
- Hatalı kaydı amendment ile düzeltme

## Faz 6 — Stok, satın alma ve petshop

Goal'lar:

- Ürün ve hizmet kartları
- Barkod
- Depo/raf
- Lot/SKT
- Tedarikçi
- Satın alma
- Stok hareketleri
- Sayım ve düzeltme
- Petshop POS
- İade
- Klinik tüketimi
- Düşük stok ve SKT uyarıları
- Müşteri/hayvan alışveriş geçmişi

## Faz 7 — Satış, tahsilat ve temel finans

Goal'lar:

- Hizmet ve ürün fiyatlandırma
- Sepet/fatura taslağı
- Tahsilat
- Kısmi tahsilat
- İptal/ters kayıt
- Kasa
- Gün sonu
- Müşteri borç/alacak
- Pilot raporlar
- e-SMM adapter interface; gerçek entegrasyon yok

## Faz 8 — Ameliyat, anestezi ve yatış

Goal'lar:

- Ameliyat planı
- Onam formu
- Ekip ve operasyon notu
- Anestezi takip
- Kullanılan ürünlerin stok tüketimi
- Yatış açma
- Kafes/yatak
- Order ve uygulama kayıtları
- Gözlem
- Taburcu özeti
- Portal paylaşımı

## Faz 9 — Laboratuvar ve görüntüleme

Goal'lar:

- Test kataloğu
- Laboratuvar isteği
- Sonuç girişi
- Referans aralıkları
- Dosya ekleri
- Görüntüleme isteği
- Rapor
- Klinik kayda ilişkilendirme
- Portal görünürlüğü
- Gelecek cihaz entegrasyonu için adapter

## Faz 10 — Superadmin, destek ve gözlemlenebilirlik

Goal'lar:

- Hata olayları
- Fingerprint/gruplama
- Tenant/şube/kullanıcı bağlamı
- Frontend error capture
- Backend exception capture
- Queue job görünümü
- Entegrasyon logları
- Güvenlik logları
- Hata durum yönetimi
- Release ilişkilendirme
- Destek kaydı bağlantısı
- PII maskeleme ve retention

## Faz 11 — Dokümantasyon ve AI kullanım asistanı temeli

Goal'lar:

- Sayfa kataloğu
- İş akışı kataloğu
- Alan sözlüğü
- Yetki kataloğu
- Hata kataloğu
- Türkçe kullanıcı eğitimi
- İngilizce içerik altyapısı
- Doküman-kod CI doğrulaması
- Context-aware yardım endpoint'i
- RAG için chunk/metadata üretimi
- İlk kullanım asistanı: yalnızca navigasyon ve eğitim

## Faz 12 — Pilot, güvenlik ve üretime hazırlık

Goal'lar:

- Pilot veri kurulumu
- Gerçek kullanıcı kabul testleri
- Performans testi
- Güvenlik testi
- Backup/restore testi
- Tenant export
- KVKK süreçleri
- Destek ve incident prosedürü
- Production release
- Pilot geri bildirim backlog'u

## Faz 13 — Türkiye uyumluluk ve entegrasyonlar

Daha sonraki sürüm:

- e-SMM
- e-Fatura/e-Arşiv gerekleri
- Resmî veteriner sistemleri için doğrulanmış adapterler
- SMS/WhatsApp sağlayıcıları
- Ödeme entegrasyonları

## Faz 14 — İngiltere ülke paketi

Daha sonraki sürüm:

- en-GB
- GBP/VAT
- İngiltere adres/telefon
- Klinik kayıt ve controlled drug kuralları
- Fiyat/estimate şeffaflığı
- UK GDPR
- İngiltere ödeme/iletişim sağlayıcıları

## Uygulama sırası önerisi

İlk satışa çıkabilecek ürün için Faz 0–7 + Faz 10–12 tamamlanmalıdır.
Faz 8–9 pilot klinik için ihtiyaç olduğu için paralel ama kontrollü biçimde eklenmelidir.
