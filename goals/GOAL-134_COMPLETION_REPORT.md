# GOAL-134 — Resmî Veteriner Adapter (Completion Report)

## Faz
FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Özet
Türkiye'deki resmî veteriner sistemlerine (Türkvet, PETVET,
İl/İlçe Tarım) zorunlu veri aktarımı için adapter sözleşmesi.

## Çıktılar

### Core (`apps/api/src/common/integrations/veterinary/`)
- `registry.adapter.ts`:
  - `VeterinaryRegistry` enum (turkveteriner | petvet |
    il_tarim).
  - `RegistryRecordType` enum (vaccination | microchip |
    ownership | examination | death).
  - `RegistryRecord`, `RegistrySubmitResult` tipleri.
  - `VeterinaryRegistryAdapter` interface (submit,
    query, metadata).
  - `VETERINARY_REGISTRY_ADAPTER` DI token.

### Döküman (bu commit)
- `docs/integrations/VETERINARY_REGISTRY.md` — yasal
  dayanak (5996 sayılı Kanun + Kedi/Köpek Kimliklendirme
  Yönetmeliği), sağlayıcı seçimi, veri şeması, iş akışı
  (batch + single), konfigürasyon, güvenlik (mTLS, API
  key rotation, rate limit), audit.

## İş Kuralları
- **5 yıl saklama:** KVKK + VUK gereği.
- **Audit:** `audit:veterinary_registry.submitted` (info),
  `audit:veterinary_registry.rejected` (warning).
- **Batch:** Günlük 03:00 UTC cron.
- **Single:** Acil durumda anlık (örn. sahiplik devri).
- **Retry:** 3 deneme (1h, 6h, 24h).
- **Authentication:** API key + mTLS (önerilir).
- **Rate limit:** 10 req/saat (provider bazında).

## Yasal Dayanak
- **5996 sayılı Kanun:** Veteriner hizmetleri, bitki
  sağlığı, gıda ve yem.
- **Kedi ve Köpek Kimliklendirme Yönetmeliği**
  (22.01.2021): Mikroçip + aşı kaydı zorunlu (4 ay
  içinde).

## Yapılmayanlar / Bilinçli Atlamalar
- **Real provider implementasyonu** → Faz 14+ (Bakanlık
  onayı + API key).
- **Hayvan sağlığı sertifikaları (aşı pasaportu PDF)** →
  Faz 14+ (mevcut `clinic-record-share.ts` kullanılabilir).
- **Antibiyotik kullanım raporu** → Faz 14+.
- **İhracat sertifikası** → Faz 14+ (FAZ-9 lab adapter).

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `registry.adapter.spec.ts` (FAZ-14+) — mock provider.
- Sandbox: provider'ın test ortamı (varsa).

## Commit
- Core: (bu commit) — `feat(integrations): GOAL-134 resmî veteriner adapter sözleşmesi`
- Docs: (bu commit) — `docs(integrations): GOAL-134 resmî veteriner dokümanı`
