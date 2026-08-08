# Stitch → VetNiva Uygulama Faz Haritası

## Amaç

Google Stitch projesi **VetNiva Design System Dashboard** (`14053311943997908997`)
tasarımlarını, mevcut Next.js uygulamasının erişilebilir, çok dilli ve iş
kurallarıyla uyumlu ekranlarına dönüştürmek.

Bu çalışma, Stitch HTML'sini doğrudan üretim kodu olarak kullanmaz. İndirilen
çıktı görsel referans ve bileşen envanteri olarak değerlendirilir; uygulama
kodu TypeScript, mevcut `@vetniva/ui` primitive'leri, locale etiketleri,
yetki kontrolleri ve domain API sözleşmeleri üzerinde kurulur.

## Kaynak ekran envanteri

| Stitch ekranı                        | Kaynak kimliği                                       | Hedef route / alan            | Faz |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------- | --- |
| DESIGN.md                            | `4494790048319447758`                                | Tasarım kuralları ve tokenlar | 1   |
| Design System                        | `asset-stub-assets_753863977cc74d249c826087e8ad2c83` | Ortak bileşen örnekleri       | 1   |
| VetNiva - Anasayfa                   | `3fb291ebb07042f1b642e2d2b6e7fbae`                   | `/[locale]/dashboard`         | 2   |
| VetNiva - Hastalar Listesi           | `7fa99aee9c5e400c8ed0c06e17df92fd`                   | `/[locale]/patients`          | 3   |
| VetNiva - Hastalar (Filtreler Açık)  | `ca60d5ec64704791bbd8596de1251db0`                   | Hasta listesi filtre paneli   | 3   |
| VetNiva - Yeni Hasta Kaydı           | `d42424ac86bb46798fcfdbca7fb54105`                   | `/[locale]/patients/new`      | 3   |
| VetNiva - Hasta Detayı (Pamuk)       | `8544dce518fc4e40b66f8d01f3ec4cc8`                   | `/[locale]/patients/[id]`     | 4   |
| VetNiva - Aktif Muayene (Pamuk)      | `708e60bd1dcb46df8fdecbb3d670abf8`                   | `/[locale]/consultation/[id]` | 4   |
| VetNiva - İmzalanmış Muayene Kaydı   | `2708e1bbc8b14cfc871eac9d42fdd034`                   | Muayene kayıt/audit görünümü  | 4   |
| VetNiva - Finans Yönetimi            | `48364887d78b4b8f9b7c0ae86cbce105`                   | `/[locale]/finance`           | 5   |
| VetNiva - Petshop ve Satış (POS)     | `ece900ff846245118a5dd1660bbe0ad4`                   | `/[locale]/petshop`           | 5   |
| VetNiva - Ayarlar (Kullanıcılar)     | `9daf80e877384675be32724c9f421239`                   | `/[locale]/settings/users`    | 6   |
| VetNiva - Ayarlar (Klinik Bilgileri) | `dafc4d91afad49dba841ce6d499443dc`                   | `/[locale]/settings/clinic`   | 6   |

## Fazlar ve teslim koşulları

### Faz 1 — Tasarım temeli ve kaynak arşivi

- Her ekranın HTML ve PNG çıktısını `docs/design/screens/stitch/` altında
  ekran kimliğiyle arşivle; indirme URL'lerini ve tarihini manifestte kaydet.
- `DESIGN.md` kurallarını tokenlara dönüştür: renkler, tipografi, 8 px aralık
  ölçeği, radius, gölge, focus halkası ve durum renkleri.
- `AppShell`, sidebar ve top barı Stitch kabuğuyla görsel olarak hizala.
- Ortak `Button`, `Input`, `Badge`, `Card`, tablo araç çubuğu, filtre popover,
  boş/yükleme/hata durumlarını `@vetniva/ui` içinde tamamla.
- Görsel regresyon için her temel primitive'in test ve referans ekranını ekle.

### Faz 2 — Kontrol paneli

- Anasayfa: KPI kartları, günlük randevu tablosu, hızlı işlemler ve sistem
  durumu.
- Mock veri yalnızca API hazır değilse açıkça demo adapter'ı ile izole edilir.
- Dashboard dokümanı, i18n anahtarları ve erişilebilirlik kontrolleri güncellenir.

### Faz 3 — Hasta bulma ve kayıt

- Hasta listesi; arama, kolon seçimi, sayfalama ve filtre sayacı.
- Filtreler açık varyantı; klavye ile kapanan, mobilde bottom-sheet olan
  erişilebilir filtre yüzeyi.
- Yeni hasta kaydı; sahip/hasta ilişkisinin API doğrulaması, yetki kontrolü,
  negatif senaryoları ve hataları.

### Faz 4 — Klinik kayıt akışı

- Hasta detay üst bilgisi, sekmeler, alerji/sensitif uyarıları ve geçmiş.
- Aktif muayene: taslak, kayıt, imza ve işlem durumları.
- İmzalanmış kayıt: salt okunur görünüm, amendment/düzeltme başlangıcı ve
  denetim geçmişi. Klinik kayıtlarda fiziksel silme veya doğrudan güncelleme
  arayüzü oluşturulmaz.

### Faz 5 — Finans ve POS

- Finans dashboardu ve işlem listesi; para alanları `Decimal` kaynaklı ve
  yerelleştirilmiş görünür.
- POS: ürün arama, sepet, stok uyarısı ve tahsilat başlangıcı.
- Tahsilat için idempotency, ters kayıt/iptal akışı ve yetki testleri zorunlu.

### Faz 6 — Ayarlar

- Klinik bilgileri, çalışma saatleri ve bölgesel ayarlar.
- Kullanıcı listesi, davet drawer'ı, rol/şube seçimi ve durum yönetimi.
- Her ayar işlemi için yetki, audit ve PII maskeleme gereksinimleri doğrulanır.

### Faz 7 — Uçtan uca kalite kapısı

- Desktop (1440 px) ve mobile (390 px) görsel karşılaştırma.
- `lint`, `type-check`, ilgili unit/integration/API/E2E testleri,
  `docs:check` ve `i18n:check` çalıştırılır.
- Tenant izolasyonu, yetkilendirme, hata durumları ve audit beklentileri
  ekran bazında kabul edilir.

## Mimari sınırlar

- Stitch çıktısı, domain davranışı veya API sözleşmesi için kaynak değildir.
- Tenant kimliği hiçbir UI formundan alınmaz; oturum bağlamından gelir.
- Finansal ve klinik kayıtlarda silme yerine iptal, ters kayıt veya amendment
  akışı kullanılır.
- Tüm kullanıcı metinleri `tr-TR` ve `en-GB` anahtarlarıyla sağlanır.
- Yeni route, izin, hata kodu ve kullanıcı akışı ilgili dokümantasyona eklenir.

## Kaynak alma prosedürü

1. Stitch'te ekranı seçip HTML ve ekran görüntüsü dışa aktarılır.
2. Barındırılan indirme URL'si oluştuğunda dosyalar `curl -L` ile arşive alınır.
3. Her dosya adına ekran kimliği eklenir; manifestte kaynak URL, indirme tarihi,
   checksum ve hedef route tutulur.
4. Varlıklar telifli/özel kaynak sayılır; yalnızca bu repository içinde
   kullanılır ve secret veya kullanıcı verisi içermez.

## Kabul kriterleri

- On üç kaynak ekranın her biri envanterdeki hedef route veya bileşen alanına
  karşılık gelir.
- Ortak kabuk ve bileşenler tekrar kullanılabilir; ekranlarda kopyalanmış
  tasarım kodu oluşmaz.
- Uygulanan her ekranın responsive, erişilebilir ve i18n doğrulaması vardır.
- Backend bağımlılığı olan her akış, gerçek yetki/tenant/audit kurallarına
  bağlanmadan tamamlandı kabul edilmez.
