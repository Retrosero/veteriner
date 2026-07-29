# MiniMax Agent Team — Kök Kuralları

Bu kurallar tüm ajanlar ve tüm goal'lar için zorunludur.

## 1. Çalışma biçimi

1. Bir seferde yalnızca bir goal üzerinde çalış.
2. Goal kapsamı dışına çıkma.
3. Eksik veya çelişkili gereksinimi açık varsayım olarak kaydet.
4. Büyük refactor işlemlerini bağımsız goal olmadan yapma.
5. Önce mevcut kodu, migration'ları, testleri ve dokümanları incele.
6. Uygulamayı çalıştırmadan ve test etmeden tamamlandı deme.
7. Kısmi tamamlanan işleri tamamlandı olarak işaretleme.
8. Her goal sonunda değişen dosyaları ve alınan kararları raporla.

## 2. Mimari kuralları

- Başlangıç mimarisi modüler monolittir.
- Domain sınırları açık olmalıdır.
- Modüller birbirlerinin veritabanı tablolarına doğrudan erişmez.
- Modüller arası iletişim servis sözleşmesi veya domain event ile yapılır.
- Controller içinde iş kuralı bulunmaz.
- İş kuralları domain/application servislerinde tutulur.
- Veritabanı modelleri doğrudan API response olarak dönülmez.
- DTO, validation ve mapping zorunludur.
- Harici servisler adapter arayüzlerinin arkasında tutulur.
- Türkiye ve İngiltere kuralları ortak koda koşullu ifadelerle dağılmaz; country adapter kullanılır.

## 3. Multi-tenant güvenliği

- Tenant'a ait tüm tablolarda `tenant_id` zorunludur.
- Tüm unique indexler tenant bağlamını içermelidir.
- Tenant kimliği request body veya query parametresinden güvenilir kabul edilmez.
- Tenant bilgisi doğrulanmış oturumdan alınır.
- PostgreSQL Row Level Security etkin olmalıdır.
- Her repository sorgusu tenant context içinde çalışmalıdır.
- Superadmin erişimi ayrı izin ve ayrı servis katmanıyla sağlanır.
- Tenant izolasyonu için negatif test yazılmadan goal tamamlanamaz.
- Cross-tenant IDOR testleri zorunludur.

## 4. Klinik veri kuralları

- Klinik notlar fiziksel olarak silinmez.
- Düzeltmeler yeni versiyon veya amendment olarak kaydedilir.
- Kim, ne zaman ve neden değiştirdiği saklanır.
- Hayvan sahibi değişiklikleri geçmişiyle tutulur.
- Reçete, aşı, ilaç uygulama ve stok hareketleri birbirine bağlanır.
- Kedi, köpek ve kuş dışındaki türler ilk sürümde oluşturulamaz; genişlemeye uygun enum/reference tasarımı kullanılır.
- Tıbbi kayıt değişiklikleri audit log üretir.
- Hassas sağlık verileri teknik loglara yazılmaz.

## 5. Stok ve finans kuralları

- Stok miktarı doğrudan güncellenmez; stok hareketlerinden türetilir.
- Her stok hareketinin kaynak belgesi ve nedeni bulunur.
- Lot ve son kullanma tarihi desteklenir.
- Klinik tüketimi ile petshop satışı ayrı hareket türleridir.
- Negatif stok davranışı tenant ayarıyla kontrol edilir.
- Para değerleri floating point ile tutulmaz.
- Finansal işlemler idempotent olmalıdır.
- Tahsilat silinmez; iptal/ters kayıt uygulanır.
- e-SMM ilk MVP kapsamı dışındadır ancak adapter alanı ayrılmalıdır.

## 6. Kod kalitesi

- TypeScript strict mode kapatılamaz.
- `any` kullanımı istisna ve açıklama gerektirir.
- Fonksiyonlar tek sorumluluk taşır.
- Yinelenen iş kuralları merkezi servise alınır.
- Magic string ve magic number kullanılmaz.
- Hata mesajlarında sabit hata kodları bulunur.
- Public API değişiklikleri OpenAPI dokümanına yansıtılır.
- Breaking change migration notu olmadan yapılamaz.

## 7. Türkçe açıklama standardı

Her kaynak kod dosyasının başında Türkçe açıklama bloğu bulunmalıdır:

- Dosyanın amacı
- Bağlı olduğu modül
- Temel iş kuralları
- Tenant/güvenlik etkisi
- Önemli bağımlılıklar

Her public sınıf ve karmaşık metot için Türkçe açıklama yazılmalıdır.

Her satıra yorum yazılmaz. Yorumlar yalnızca:

- karmaşık iş kuralları,
- güvenlik kararı,
- tenant izolasyonu,
- finansal hesap,
- klinik kayıt versiyonlama,
- geçici uyumluluk çözümü
  için kullanılır.

Kod isimleri İngilizce, açıklamalar Türkçe olmalıdır.

## 8. Test kuralları

Her goal için uygun olan testler zorunludur:

- Unit test
- Integration test
- API test
- E2E test
- Tenant izolasyon testi
- Yetki testi
- Hata senaryosu testi
- Idempotency testi
- Migration testi

Yalnızca happy-path testleri yeterli değildir.

## 9. Log ve gözlemlenebilirlik

Her request için correlation/request ID bulunur.

Log türleri:

- Audit log
- Sistem hata logu
- Entegrasyon logu
- Background job logu
- Güvenlik logu

Loglarda şu bilgiler bulunmalıdır:

- tenant_id
- branch_id
- user_id
- module
- action
- request_id
- app_version
- severity
- error_code
- fingerprint

Aşağıdakiler loglara yazılmaz:

- parola
- token
- tam telefon numarası
- kimlik numarası
- klinik not içeriği
- ödeme kartı verisi
- hassas dosya içeriği

## 10. Dokümantasyon ve AI bilgi havuzu

Yeni veya değişen her kullanıcı özelliği için:

- Sayfa kataloğu güncellenir.
- İş akışı dokümanı güncellenir.
- Alan sözlüğü güncellenir.
- Yetki bilgisi güncellenir.
- Hata kataloğu güncellenir.
- Türkçe kullanıcı eğitimi güncellenir.
- İngilizce metin anahtarları eklenir.
- Bilgi havuzu arama anahtarları eklenir.

Doküman güncellenmemişse goal tamamlanamaz.

## 11. Güvenlik

- OWASP ASVS temelli kontroller uygulanır.
- Input validation zorunludur.
- Rate limit uygulanır.
- Yetki kontrolü yalnızca frontend'e bırakılmaz.
- Dosya yüklemelerinde MIME, boyut ve zararlı içerik kontrolleri yapılır.
- Secret değerler repoya yazılmaz.
- Kişisel veri çıktıları audit log üretir.
- Yedek ve restore işlemleri test edilir.

## 12. Goal tamamlama koşulu

Aşağıdakilerin tamamı sağlanmadan goal kapatılamaz:

- Kabul kriterleri karşılandı.
- Testler geçti.
- Lint ve type-check geçti.
- Tenant izolasyonu doğrulandı.
- Audit/log gereksinimleri tamamlandı.
- Dokümantasyon güncellendi.
- AI bilgi havuzu güncellendi.
- Migration ve rollback değerlendirildi.
- Bilinen riskler raporlandı.
