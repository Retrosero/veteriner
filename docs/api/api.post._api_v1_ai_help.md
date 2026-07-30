# POST /api/v1/ai/help

Context-aware AI help endpoint'i (FAZ-0 iskelet). Kullanıcının doğal
dil sorusunu alır, retrieval yapar, sonuçları döner. LLM çağrısı Faz
11+'da eklenecek.

- **Modül:** ai
- **Yetki:** Tüm tenant kullanıcıları (PII chunk'lar için yetki kontrolü
  Faz 11+'da)
- **Request body:** `{ query, locale, currentPage?, selectedEntity?, topK? }`
- **Response 200:** `{ query_id, chunks, duration_ms, sources }`
