# AI Bilgi Havuzu — İskelet

Bu doküman, VetNiva AI asistanının kullanıcı sorularını yanıtlarken
başvurduğu bilgi kaynağını oluşturur. Faz 11'de (Dokümantasyon ve AI
kullanım asistanı temeli) zenginleştirilecektir.

## AI asistan kapsamı (GOAL-000)

İlk sürümde AI asistan **yoktur**. Sadece altyapı hazırlanır:

- `docs/pages/` — sayfa bilgi kayıtları (YAML)
- `docs/workflows/` — iş akışları
- `docs/errors/` — hata kataloğu
- `docs/permissions/` — yetki matrisi
- `docs/fields/` — alan sözlüğü
- `docs/user-education/` — Türkçe kullanıcı eğitimi

## İlk sürüm AI asistanının kuralları (Faz 11+)

Asistan **tıbbi teşhis vermez**. Yalnızca:

1. Uygulama kullanımını anlatır.
2. Doğru menüye yönlendirir.
3. Alanları açıklar.
4. Hata çözüm adımlarını gösterir.
5. Kullanıcının yetki durumunu açıklar.

Cevaplamadan önce:

- Tenant modülleri (hangi özellikler açık)
- Kullanıcının rolü ve izinleri
- Kullanıcının dili
- Mevcut sayfa
- Seçili hasta/hayvan bağlamı

değerlendirilir.

## Arama anahtarları (keywords)

Her sayfa kaydı (`docs/pages/...yaml`) `keywords` alanı içerir. AI
asistanı kullanıcı sorusunun niyetini bu anahtarlarla eşleştirir.

Örnek:

- Soru: "Aşı kaydı nasıl yapılır?"
- Eşleşen sayfa: `web.clinic.vaccination.create`
- Yönlendirme: `/{locale}/clinic/patients/{id}/vaccinations/new`

## Chunk/metadata planı (Faz 11+)

- Her sayfa kaydı RAG chunk'ına dönüştürülür.
- Metadata: `page_id`, `module`, `locale`, `version`, `last_verified_at`.
- Türkçe anahtarlar öncelikli; İngilizce iskeleti korunur.

## Güncelleme politikası

- `docs/pages/` değiştiğinde AI asistan bilgi tabanı otomatik güncellenir.
- `pnpm docs:check` geçmeden PR merge edilmez.
- `last_verified_at` 90 günü geçen sayfalar `degraded` flag'i alır.
