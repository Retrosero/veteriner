# DELETE /api/v1/clinic/patients/:id

Hastayı arşivler (soft delete). `archivedAt` set edilir; klinik
kayıtlar append-only olduğu için geçmiş muayene/aşı kayıtları
ETKİLENMEZ — yalnızca identity gizlenir. **Fiziksel silme YOKTUR.**

- **Modül:** clinic (patient)
- **Yetki:** `clinic:patient:archive` (STAFF, VETERINARIAN)
- **Idempotent:** Evet — zaten arşivli ise mevcut kayıt döner.
- **Audit:** `audit:patient.archive` (severity: warning)

**Path parametreleri:**

- `id` (UUID, zorunlu) — arşivlenecek hasta ID'si

**Response 200:** Arşivlenmiş `Patient` (idempotent: aynı yanıt).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-CLINIC-0001` (404) — Hasta bulunamadı (cross-tenant dahil).

**Kullanım senaryoları:**

- Hayvan kliniğimizden ayrıldıysa (taşınma, başka klinik, vefat
  sonrası kayıt temizliği).
- Yinelenen kayıt tespit edilip gerçek hayvana merge edildikten
  sonra eskiyi arşivleme.
- Mikroçip değişikliği gibi durumlarda eski kaydı arşivleyip yeni
  kayıt açma (duplicate kontrolü arşivlileri görmez).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/patient.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Patient)
- AI chunk: `flow-ownership-transfer` (GOAL-022 — sahiplik devri
  ayrı akıştır, bu endpoint hayvanı arşivler).
