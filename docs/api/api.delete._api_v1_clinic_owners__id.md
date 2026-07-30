# DELETE /api/v1/clinic/owners/:id

Owner'ı arşivler (soft delete). `archivedAt` set edilir; PII ve
audit trail korunur. **Fiziksel silme YOKTUR** (klinik kayıtlar
append-only; sahiplik geçmişi için gerekli).

- **Modül:** clinic (owner)
- **Yetki:** `clinic:owner:archive` (STAFF, VETERINARIAN, OWNER)
- **Idempotent:** Evet — zaten arşivli ise mevcut kayıt döner.
- **Audit:** `audit:owner.archive` (severity: warning)

**Path parametreleri:**

- `id` (UUID, zorunlu) — arşivlenecek owner ID'si

**Response 200:** Arşivlenmiş `Owner` (idempotent: aynı yanıt).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-CLINIC-0001` (404) — Owner bulunamadı (cross-tenant dahil).

**Kullanım senaryoları:**

- Sahip klinikten ayrıldıysa (taşınma, başka klinik).
- Yinelenen kayıt tespit edilip gerçek owner'a merge edildikten sonra
  eskiyi arşivleme.
- KVKK silme talebi için `flow-kvkk-erasure` chunk'ına yönlendir
  (PII NULL'lama).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/owner.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Owner)
- AI chunk: `flow-ownership-transfer`, `flow-kvkk-erasure`
