# GET /api/v1/clinic/owners

Tenant-scoped owner araması. `search` alanı ad/soyad/telefon/email/
taxId üzerinde case-insensitive substring match yapar; `phone` ve
`city` ek filtre olarak kullanılır. Arşivlenen kayıtlar default
olarak DÖNMEZ (aktif kayıtlar).

- **Modül:** clinic (owner)
- **Yetki:** `clinic:owner:read` (STAFF, VETERINARIAN, OWNER)

**Query parametreleri:**

| Ad       | Tip    | Zorunlu | Açıklama                                                   |
| -------- | ------ | ------- | ---------------------------------------------------------- |
| `search` | string | hayır   | Ad/soyad/telefon/email/taxId içinde arama (1-100 karakter) |
| `phone`  | string | hayır   | E.164 veya ham telefon (substring)                         |
| `city`   | string | hayır   | Şehir filtresi                                             |
| `limit`  | int    | hayır   | Sayfa boyutu (default 20, max 100)                         |
| `offset` | int    | hayır   | Sayfa başlangıcı (default 0)                               |

**Response 200:**

```json
{
  "items": [
    {
      "id": "own-uuid",
      "tenantId": "tnt-uuid",
      "firstName": "Ayşe",
      "lastName": "Yılmaz",
      "phone": "+905321234567",
      "email": "ayse@example.com",
      "taxId": "12345678950",
      "consents": { "kvkk": true, "marketing": false },
      "createdAt": "2026-07-30T12:00:00.000Z",
      "archivedAt": null
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.

**Tenant izolasyonu:** Sorgu daima actor.tenantId kapsamında
çalışır. Farklı tenant'ın owner'ları sonuçta YOK.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/owner.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Owner)
