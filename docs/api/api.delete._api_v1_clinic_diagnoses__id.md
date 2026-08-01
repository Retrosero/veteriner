# DELETE /api/v1/clinic/diagnoses/{id}

Teşhis kaydını arşivler (soft delete). `archivedAt` set edilir;
klinik kayıt append-only olduğu için fiziksel silme yapılmaz.
Idempotent: zaten arşivliyse no-op (ek audit yazılmaz).

- **Modül:** diagnoses
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:diagnosis.archive` (severity: warning) —
  before/after archivedAt, examinationId, patientId.
  No-op durumda audit üretmez.

**Path params:**

- `id` (string, zorunlu) — `diagnosis-<tenant8>-<uuid8>`.

**Request body:** yok.

**Response 200:**

```json
{
  "archived": true,
  "id": "diagnosis-7a1b2c3d-000001"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Teşhis bulunamadı / cross-tenant.

**İş kuralları:**

- `archivedAt` set edilir; kayıt DB'de kalır (append-only
  politika — klinik kayıt fiziksel olarak silinmez). Liste
  endpoint'leri (`GET .../examinations/{id}/diagnoses`,
  `GET .../patients/{id}/diagnoses`) `archivedAt IS NULL` filtresi
  uygulayarak arşivli kayıtları döndürmez.
- `?includeArchived=true` ile hasta bazlı listede arşivli
  kayıtlar görünür hale gelir.
- Zaten arşivli (`archivedAt != null`) ise service no-op; ek
  audit yazılmaz (idempotent). Client aynı yanıtı alır
  (`{ archived: true, id }`).
- Status state machine'den bağımsız: arşivleme `active` /
  `resolved` / `chronic` / `ruled_out` hepsinden yapılabilir.
  Aktif problem listesinden çıkarmak için `setChronic` veya
  `resolve` tercih edilir; arşivleme yalnızca "yanlışlıkla
  girildi, listeden tamamen kaldır" senaryosu içindir.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`

- `findById(tenantId, id)` tenant-scoped; cross-tenant denemesi →
  403 `VET-AUTHZ-0001` veya 404 `VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Teşhis ekle: `POST /api/v1/clinic/examinations/{id}/diagnoses`
- AI chunk: `flow-diagnosis`
