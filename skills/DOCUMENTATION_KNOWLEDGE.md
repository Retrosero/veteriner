# Skill: Dokümantasyon ve AI Bilgi Havuzu

## Amaç

Uygulamanın çalışma mantığını, kullanıcı eğitimini ve AI asistanın cevap vereceği bilgi tabanını kodla senkron tutmak.

## Her özellikte üretilecek dokümanlar

1. Sayfa kataloğu
2. İş akışı
3. Alan sözlüğü
4. Yetki matrisi
5. Hata kataloğu
6. Kullanıcı eğitimi
7. Teknik açıklama
8. Sürüm notu

## Sayfa bilgi modeli

Her sayfa kaydı şu alanları taşımalıdır:

- `page_id`
- `route`
- `module`
- `title_key`
- `purpose`
- `allowed_roles`
- `required_permissions`
- `prerequisites`
- `fields`
- `actions`
- `step_by_step`
- `possible_errors`
- `related_pages`
- `related_api`
- `keywords`
- `locale`
- `version`
- `last_verified_at`

## AI asistan davranışı

Asistan cevaptan önce:

- tenant modüllerini,
- kullanıcının rol ve izinlerini,
- kullanıcının dilini,
- mevcut sayfayı,
- seçili hasta/hayvan bağlamını
  değerlendirmelidir.

Asistan tıbbi teşhis vermez. İlk sürümde yalnızca:

- uygulama kullanımını anlatır,
- doğru menüye yönlendirir,
- alanları açıklar,
- hata çözüm adımlarını gösterir,
- kullanıcının yetki durumunu açıklar.

## Doküman-kod uyumu

CI kontrolü:

- Yeni route dokümansızsa hata
- Yeni permission dokümansızsa hata
- Yeni error code katalogda yoksa hata
- Değişen form alanı alan sözlüğünde yoksa hata
- Yeni i18n anahtarı eksik locale içeriyorsa hata
