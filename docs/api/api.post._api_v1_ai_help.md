# POST /api/v1/ai/help

Kullanıcının doğal dil sorusunu context-aware yanıtlar.
Retrieval + template-based answer üretimi yapar; LLM
entegrasyonu Faz 12+'da bu katmanı değiştirecek.

- **Modül:** ai
- **Yetki:** Oturum açmış tüm kullanıcılar (personel + portal).
- **Audit:** `audit:ai.help.request` (info; PII mask'lı).

**Body (`HelpRequest`):**

```json
{
  "query": "Bir hasta için aşı nasıl uygularım?",
  "locale": "tr-TR",
  "currentPage": "/[locale]/clinic/patients/{patientId}/vaccinations/new",
  "selectedEntity": "patient-uuid",
  "topK": 5,
  "generationSource": "auto"
}
```

- `query` (string, 3-500) zorunlu.
- `locale` (tr-TR | en-GB) zorunlu.
- `currentPage` (string, max 256) opsiyonel.
- `selectedEntity` (string, max 256) opsiyonel.
- `topK` (1-20, default 5) opsiyonel.
- `generationSource` (auto | template | retrieval | hybrid, default
  `auto`) opsiyonel. `auto` chunks.length + answer uzunluguna gore
  otomatik secer; belirli bir mod zorlanirsa o kullanilir.
  `retrieval` zorlanirsa AI_CHUNKS.yaml'dan retrieval sonuclari
  onceliklendirilir (chunks bos olsa bile).

**Response 200 (`HelpResponse`):**

```json
{
  "query_id": "req-uuid",
  "chunks": [
    {
      "chunk_id": "workflow-vaccination-record",
      "score": 0.87,
      "metadata": {
        "chunk_id": "workflow-vaccination-record",
        "type": "flow",
        "title": "Aşı Kaydı (Vaccination Record)",
        "locale": "tr-TR",
        "version": "1.0.0"
      },
      "content": "Aşı uygulaması kaydetmek için..."
    }
  ],
  "duration_ms": 45,
  "answer": "Sorunuza en uygun kaynak: **Aşı Kaydı (Vaccination Record)**.\n\nAşı uygulaması kaydetmek için...",
  "sources": [
    {
      "chunk_id": "workflow-vaccination-record",
      "title": "Aşı Kaydı (Vaccination Record)",
      "snippet": "Aşı uygulaması kaydetmek için..."
    }
  ],
  "generationSource": "hybrid"
}
```

- `generationSource` (template | retrieval | hybrid):
  - `template`: retrieval boş; default mesaj.
  - `retrieval`: chunks var ama template çok kısa.
  - `hybrid`: chunks + anlamlı template.

**Davranış:**

- `ActorContext`'ten `tenantId`, `userId`, `role` çıkarılır;
  istemciden alınmaz (impersonation saldırısına karşı).
- `currentPage` verilirse answer'a sayfa bağlamı eklenir.
- Cross-tenant retrieval: actor.tenantId null ise
  (pre-auth) tüm chunk'lar filtrelenir; yalnızca system
  chunk'ları döner.

**Hata kodları:**

- 400 `VET-VALIDATION-0001` — Geçersiz payload (query < 3
  karakter, locale geçersiz, topK > 20).

## Notlar

- LLM çağrısı Faz 12+'da eklenecek. Şu an template-based
  answer üretimi.
- Embedding şu an naive (256-dim token overlap); production'da
  OpenAI ada-002 (1536 dim) veya cohere/voyage kullanılacak.
- PII içeren chunk'lar yalnızca yetkili rollere (OWNER +
  VETERINARIAN) açık; portal kullanıcılarına filtrelenir.

## İlgili dokümanlar

- `apps/api/src/modules/ai/ai.controller.ts`
- `apps/api/src/common/ai/retrieval.service.ts`
- `docs/ai/AI_CHUNKS.yaml`
- `docs/workflows/` (workflow kataloğu chunk'ları)
- `docs/pages/` (sayfa kataloğu chunk'ları)
