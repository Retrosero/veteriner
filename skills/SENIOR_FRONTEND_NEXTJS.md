# Skill: Senior Frontend — Next.js

## Standartlar

- App Router ve TypeScript strict kullan.
- Sayfaları domain/feature bazında düzenle.
- Form şemalarını merkezi tut.
- Tüm kullanıcı metinleri i18n anahtarı üzerinden gelsin.
- Türkçe `tr-TR`, İngilizce `en-GB` formatlarına hazırlıklı ol.
- Tarih, saat, para ve sayı formatlarını locale üzerinden üret.
- Yetkisiz işlemleri gizlemek yeterli değildir; backend hatalarını da yönet.
- Her ekran loading, empty, error ve success state içermelidir.
- Form kaybını önlemek için taslak/uyarı davranışı kullan.
- Klinik personelinin hızlı işlem yapması için klavye ve barkod akışlarını düşün.
- Frontend exception'larını merkezi hata sistemine request ID ile gönder.
- Erişilebilirlik kontrollerini uygula.
- Hasta sahibi portalını personel panelinden ayrı layout ve izinlerle tasarla.

## Sayfa dokümantasyonu

Her route için:

- sayfa amacı,
- kullanıcı rolleri,
- ana işlemler,
- alan açıklamaları,
- hata durumları,
- ilgili yardım içeriği
  oluşturulmalıdır.
