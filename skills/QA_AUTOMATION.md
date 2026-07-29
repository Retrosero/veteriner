# Skill: QA Automation

## Test katmanları

1. Unit test
2. Integration test
3. API contract test
4. E2E test
5. Security/authorization test
6. Tenant isolation test
7. Regression test
8. Migration test
9. Accessibility smoke test
10. Pilot user acceptance test

## Zorunlu senaryolar

- İki farklı tenant aynı kayıt ID'sini tahmin etse bile veri göremez.
- Yetkisiz çalışan klinik kaydı silemez/değiştiremez.
- Hatalı aşı kaydı eski kaydı yok etmeden düzeltilir.
- Aynı tahsilat isteği iki kez işlense bile çift kayıt oluşmaz.
- Stok yetersizliğinde belirlenen tenant kuralı uygulanır.
- Background job tekrar çalıştığında çift SMS veya çift kayıt oluşturmaz.
- Frontend hata verdiğinde Superadmin hata merkezine olay düşer.
- Portal kullanıcısı başka müşterinin hayvanını göremez.

## Goal kapanışı

Test raporu şunları içermelidir:

- Çalıştırılan testler
- Geçen/kalan test sayıları
- Kapsanmayan riskler
- Manuel test gerektiren alanlar
- Regression etkisi
