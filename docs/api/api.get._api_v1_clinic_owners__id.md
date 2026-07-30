# GET /api/v1/clinic/owners/:id

ID'ye göre owner detayı. Cross-tenant denemesi 404 döner (bilgi
sızdırmaz).

- **Modül:** clinic (owner)
- **Yetki:** `clinic:owner:read` (STAFF, VETERINARIAN, OWNER)

**Path parametreleri:**

- `id` (UUID, zorunlu) — owner ID'si

**Response 200 (`Owner`):**

```json
{
  "id": "own-uuid",
  "tenantId": "tnt-uuid",
  "firstName": "Ayşe",
  "lastName": "Yılmaz",
  "phone": "+905321234567",
  "email": "ayse@example.com",
  "taxId": "12345678950",
  "address": { "city": "Istanbul", "district": "Kadıköy", "fullAddress": "..." },
  "consents": { "kvkk": true, "marketing": false },
  "createdAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null
}
```

Arşivlenen owner da döner (`archivedAt != null`). Filtreleme ihtiyaca
göre client tarafında yapılır.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-CLINIC-0001` (404) — Owner bulunamadı (cross-tenant dahil).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/owner.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Owner)
