# GET /api/v1/clinic/patients/:id/vaccinations/next-due

Belirli bir hastanın gelecek tarihli aşı kayıtlarını listeler.
`status='administered'` + `nextDueAt` şu andan sonra olan
kayıtlar. Cross-tenant → boş liste (bilgi sızdırmaz).

- **Modül:** vaccinations
- **Yetki:** `clinic:vaccination:read`
- **Audit:** YAYINLAMAZ (read-heavy; gürültü kontrolü).

**Path:**

```
GET /api/v1/clinic/patients/pat-uuid/vaccinations/next-due
```

- `:id` (string) — hayvan ID.

**Filtre:** Yalnızca `status='administered'` ve
`nextDueAt > now()` olan kayıtlar. `null` `nextDueAt` olan
kayıtlar dönmez.

**Response 200 (`Vaccination[]`):**

```json
[
  {
    "id": "vacr-tnt12345-000001",
    "tenantId": "tnt-uuid",
    "patientId": "pat-uuid",
    "veterinarianId": "usr-uuid",
    "protocolId": "vacp-tnt12345-000001",
    "vaccineName": "DHPP - 1. doz",
    "dose": "1 ml",
    "lotNumber": "LOT-2026-0001",
    "manufacturer": "Nobivac",
    "administeredAt": "2026-07-30T09:30:00.000Z",
    "nextDueAt": "2026-08-20T09:30:00.000Z",
    "status": "administered",
    "notes": null,
    "createdBy": "usr-uuid",
    "createdAt": "2026-07-30T09:30:00.000Z",
    "cancelledAt": null,
    "cancellationReason": null
  }
]
```

Boş durumda `[]` döner (200).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**Tenant izolasyonu:** `repository.listByPatient(tenantId,
patientId, "administered")` tenant filtresiyle çalışır.
Cross-tenant patient ID → boş liste. SUPERADMIN bypass'lı
(`requireTenantScope`).

**Kullanım:** Hasta zaman çizelgesi (timeline) veya
"gelecek aşılar" widget'ı için idealdir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccination.ts`
- Genel liste: `GET /api/v1/clinic/vaccinations`
- Gecikmiş: `GET /api/v1/clinic/patients/{id}/vaccinations/overdue`
- AI chunk: `flow-vaccination`
