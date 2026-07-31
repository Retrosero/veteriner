# GOAL-115 — Context-Aware Help Endpoint (Completion Report)

## Faz
FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet
Kullanıcının doğal dil sorusunu context-aware yanıtlayan
`POST /api/v1/ai/help` endpoint'i. Retrieval + template-based
answer üretimi yapar; ActorContext'ten tenant/role alır; LLM
entegrasyonu Faz 12+'da bu katmanı değiştirecek.

## Çıktılar

### Core (`apps/api/src/modules/ai/`)
- `ai.controller.ts` — context-aware help endpoint:
  - Zod input validation (query, locale, currentPage,
    selectedEntity, topK).
  - `CurrentActor` ile `tenantId`, `userId`, `role` türetme.
  - RetrievalService çağrısı.
  - `composeAnswer` (template-based) — top chunk'ın title +
    content özeti.
  - `generationSource` (template | retrieval | hybrid) bilgisi.
- `ai.controller.spec.ts` — 3 yeni test:
  - retrieval sonucu + answer.
  - empty retrieval → template fallback.
  - currentPage bağlamı → context-aware answer.

### Döküman (bu commit)
- `docs/api/api.post._api_v1_ai_help.md` — endpoint
  dokümanı.

## İş Kuralları
- **Input validation:** Zod şeması ile sıkı kontrol
  (query 3-500, locale enum, topK 1-20).
- **Tenant filtresi:** `actor.tenantId` null ise (pre-auth /
  system) tüm chunk'lar filtrelenir; yalnızca system
  chunk'ları döner.
- **Context-aware:** `currentPage` verilirse answer'a
  sayfa bağlamı eklenir; kullanıcı hangi sayfada olduğunu
  belirtir.
- **Lokalizasyon:** `locale` (tr-TR | en-GB) hem
  retrieval hem de template answer için kullanılır.
- **Audit:** `audit:ai.help.request` (info; PII mask'lı
  query).
- **PII:** İstemciden gelen alanlara güvenilmez; actor
  context'inden türetilir.

## Yapılmayanlar / Bilinçli Atlamalar
- **LLM entegrasyonu (OpenAI/Anthropic/Cohere)** → Faz 12+
  (template-based answer LLM ile değiştirilecek).
- **Gerçek embedding (OpenAI ada-002 1536-dim)** → Faz 12+
  (naive token overlap şu an).
- **Çoklu-dil cevap üretimi** → Faz 14+ (en-GB LLM fine-tune).
- **Konuşma hafızası (multi-turn)** → Faz 13+ (session
  context).
- **PII mask context'te** → Faz 12+ (PII zaten retrieval
  katmanında filtrelenmeli; chunk metadata `pii: true`
  işaretli olanlar mask'lı döner).

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `ai.controller.spec.ts` → 3 test (FAZ-0'da 1 → FAZ-11'de
  3 test).
- Full api regresyon: 1439 yeşil, 9 skipped, 0 hata.

## Commit
- Core: (bu commit) — `feat(ai): GOAL-115 context-aware help endpoint`
- Docs: (bu commit) — `docs(ai): GOAL-115 help endpoint doküman`
