# GOAL-005 — Dokümantasyon ve AI bilgi havuzu şeması

## Faz

FAZ-0

## MiniMax'e verilecek goal mesajı

# MiniMax Goal Mode Kullanım Talimatı

Her goal başlamadan önce repository kökündeki şu dosyaları oku:

1. `PROJECT_CONTEXT.md`
2. `AGENT_RULES.md`
3. `AGENT_TEAM.md`
4. `GOAL_WORKFLOW.md`
5. Bu goal ile ilgili skill dosyaları

Bir seferde yalnızca bu goal üzerinde çalış. Kapsam dışına çıkma. Çalışmaya başlamadan önce mevcut kodu, migration'ları, testleri ve dokümantasyonu incele.

Bu goal ancak aşağıdakilerin tamamı sağlandığında tamamlanmış kabul edilir:

- Kod çalışıyor.
- Lint, type-check ve build geçiyor.
- Uygun unit, integration ve E2E testleri yazılmış ve çalıştırılmış.
- Tenant izolasyonu ve yetki testleri geçmiş.
- Audit, merkezi hata kaydı ve gerekli güvenlik logları eklenmiş.
- Yeni/değişen her dosyada Türkçe teknik açıklamalar bulunuyor.
- Kullanıcı eğitim dokümanı, sayfa kataloğu, alan sözlüğü, hata kataloğu ve AI bilgi havuzu güncellenmiş.
- Migration ve rollback etkisi değerlendirilmiş.
- `GOAL_COMPLETION_REPORT.md` formatında sonuç raporu hazırlanmış.

Kod isimleri İngilizce, açıklamalar Türkçe olmalıdır. Tıbbi ve finansal kayıtlar geçmişi yok edecek şekilde silinmemeli; versiyon, amendment, iptal veya ters kayıt yaklaşımı kullanılmalıdır.

## Bu goal'un özel talimatı

Sayfa kataloğu, iş akışı kataloğu, alan sözlüğü, yetki kataloğu, hata kataloğu ve kullanıcı eğitim dokümanları için standart şema oluştur.

Her sayfa kaydı en az şu bilgileri taşımalı:

- page_id
- route
- module
- purpose
- allowed_roles
- required_permissions
- fields
- actions
- step_by_step
- possible_errors
- related_pages
- related_api
- keywords
- locale
- version
- last_verified_at

CI içinde dokümansız route, permission veya error code yakalayacak doğrulama altyapısının temelini kur.

## Son çıktı

Goal sonunda `templates/GOAL_COMPLETION_REPORT.md` formatında rapor oluştur. Tamamlanmayan, test edilemeyen veya varsayıma dayanan noktaları açıkça belirt.
