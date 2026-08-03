# GET /api/v1/ai/rag/search

AI_CHUNKS.yaml uzerinde in-memory TF-IDF benzeri arama yapar.
SUPERADMIN erisimlidir; tenant + PII filtreleri otomatik uygulanir.

GOAL-116 (FAZ-11) — RAG chunk pipeline + web index.

- **Modul:** ai
- **Yetki:** SUPERADMIN. Aktör `isSuperadmin=true` veya `role=SUPERADMIN`.
- **Audit:** `ai.rag.search.request` (info; sorgu kisaltilmis PII mask'li).

**Query string:**

- `q` (string, 2-200) zorunlu. Arama sorgusu.
- `locale` (tr-TR | en-GB, default tr-TR).
- `topK` (1-50, default 10). Maks sonuc sayisi.

**Ornek:**

```http
GET /api/v1/ai/rag/search?q=asi%20kaydi&locale=tr-TR&topK=5
```

**Response 200 (`RagIndexSearchResponse`):**

```json
{
  "query": "asi kaydi",
  "locale": "tr-TR",
  "results": [
    {
      "chunk_id": "flow-vaccine_md-asi-kaydi",
      "title": "Asi Kaydi",
      "type": "flow",
      "source": "docs/workflows/vaccine.md",
      "locale": "tr-TR",
      "pii": false,
      "snippet": "Asi uygulamasi kaydetmek icin once hasta detay sayfasini acin...",
      "score": 0.94,
      "matchedTerms": ["asi", "kaydi"]
    }
  ],
  "totalChunks": 42,
  "duration_ms": 7,
  "source": "ai_chunks_yaml"
}
```

**Yanit alanlari:**

- `results[].score`: 0-1 normalize edilmis TF-IDF skoru.
- `results[].matchedTerms`: Hangi query token'lari chunk ile eslesti.
- `results[].snippet`: Chunk content'inin ilk 200 karakteri.
- `source`: `ai_chunks_yaml` veya `empty` (henuz indeks yok).

**Filtreler:**

- **PII**: Sadece SUPERADMIN, OWNER ve VETERINARIAN rolleri
  `pii=true` chunk'lari gorebilir. Diger roller icin filtrelenir.
- **Tenant**: `tenantId` set edilmis chunk'lar yalnizca ayni
  tenant aktoru tarafindan gorulur. `tenantId=null` (system)
  chunk'lar herkese acik.

**Hata kodlari:**

- 400 `VET-VALIDATION-0001` — Query < 2 karakter veya gecersiz
  locale.
- 403 `VET-AUTHZ-0001` — SUPERADMIN degil.

**Uretim notu:**

In-memory TF-IDF scoring pilot kapsaminda yeterlidir. Faz 12+ ile
vector DB (Qdrant/pgvector) entegrasyonu yapilacak; endpoint
sozlesmesi backward-compatible kalacaktir. Detay icin
`docs/operations/RAG_CHUNK_PIPELINE.md`.

## Ilgili dokumanlar

- `apps/api/src/modules/ai/ai-rag-index.service.ts`
- `apps/api/src/modules/ai/ai-rag-index.controller.ts`
- `apps/api/src/common/ai/ai-chunk-loader.service.ts`
- `tools/rag-chunk-producer/`
- `docs/operations/RAG_CHUNK_PIPELINE.md`
