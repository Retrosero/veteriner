# GET /api/v1/ai/rag/stats

RAG indeks saglik ve toplam chunk sayisi. SUPERADMIN health-check
ve metrikler icin. GOAL-116 (FAZ-11).

- **Modul:** ai
- **Yetki:** SUPERADMIN.
- **Audit:** Yok (salt okunur saglik endpoint'i).

**Response 200:**

```json
{
  "totalChunks": 142,
  "source": "ai_chunks_yaml"
}
```

- `totalChunks` — In-memory indeksteki toplam chunk sayisi
  (filtresiz).
- `source` — `ai_chunks_yaml` (dosya okundu) veya `empty` (henuz
  indeks yok).

**Hata kodlari:**

- 403 `VET-AUTHZ-0001` — SUPERADMIN degil.

## Ilgili dokumanlar

- `apps/api/src/modules/ai/ai-rag-index.controller.ts`
- `docs/operations/RAG_CHUNK_PIPELINE.md`
