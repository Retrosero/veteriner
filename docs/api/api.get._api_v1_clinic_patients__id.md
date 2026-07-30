# GET /api/v1/clinic/patients/:id

ID'ye göre hasta detayı. Cross-tenant denemesi 404 döner (bilgi
sızdırmaz).

- **Modül:** clinic (patient)
- **Yetki:** `clinic:patient:read` (STAFF, VETERINARIAN)

**Path parametreleri:**

- `id` (UUID, zorunlu) — hasta ID'si

**Response 200 (`Patient`):**

```json
{
  "id": "pat-uuid",
  "tenantId": "tnt-uuid",
  "ownerId": "own-uuid",
  "name": "Boncuk",
  "species": "dog",
  "breed": "Golden Retriever",
  "birthDate": "2022-04-15",
  "gender": "male",
  "microchip": "123456789012345",
  "color": "Kahverengi",
  "neutered": true,
  "notes": "Sahibine bağlı, sosyal.",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null
}
```

Arşivlenen hasta da döner (`archivedAt != null`). Filtreleme
ihtiyaca göre client tarafında yapılır.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-CLINIC-0001` (404) — Hasta bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/patient.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Patient)
- AI chunk: `error-VET-CLINIC-0001`
