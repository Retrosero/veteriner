# GET /api/v1/clinic/patients

Tenant-scoped hasta araması. `search` alanı ad / ırk / mikroçip
üzerinde case-insensitive substring match yapar; `ownerId` ve
`species` ek filtre olarak kullanılır. Arşivlenen kayıtlar default
olarak DÖNMEZ (aktif kayıtlar).

- **Modül:** clinic (patient)
- **Yetki:** `clinic:patient:read` (STAFF, VETERINARIAN)

**Query parametreleri:**

| Ad        | Tip    | Zorunlu | Açıklama                                      |
| --------- | ------ | ------- | --------------------------------------------- |
| `ownerId` | UUID   | hayır   | Owner ID filtresi                             |
| `species` | enum   | hayır   | `dog` \| `cat` \| `bird` \| `other`           |
| `search`  | string | hayır   | Ad/ırk/mikroçip içinde arama (1-200 karakter) |
| `limit`   | int    | hayır   | Sayfa boyutu (default 20, max 200)            |
| `offset`  | int    | hayır   | Sayfa başlangıcı (default 0)                  |

**Response 200:**

```json
{
  "items": [
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
      "notes": null,
      "createdAt": "2026-07-30T12:00:00.000Z",
      "archivedAt": null
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.

**Tenant izolasyonu:** Sorgu daima actor.tenantId kapsamında
çalışır. Farklı tenant'ın hastaları sonuçta YOK.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/patient.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Patient)
