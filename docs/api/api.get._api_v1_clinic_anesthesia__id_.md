# GET /api/v1/clinic/anesthesia/{id}

ID'ye göre anestezi detayı (medications/vitals/complications/
staff alt kayıtları dahil). Cross-tenant → 404.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Response 200 (`AnesthesiaDetail`):**

`AnesthesiaDetail`; tüm alt kayıtlar (`medications[]`,
`vitals[]`, `complications[]`, `staff[]`) dahil.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- (404) — Anestezi bulunamadı (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- Liste: `GET /api/v1/clinic/anesthesia`
- AI chunk: `flow-anesthesia`
