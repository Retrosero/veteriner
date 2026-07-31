# GET /api/v1/clinic/lab-adapters

Tenant-scoped kullanılabilir dış cihaz/laboratuvar adapter
listesi. Sistem tarafından kayıtlı; tenant bunlardan
seçim yapar. Pilot'ta in-memory; Faz 14'te genişler.

- **Modül:** lab-adapters
- **Yetki:** `clinic:lab:read`
- **Audit:** yok (salt okunur)

**Response 200 (`LabAdapterListResponse`):**

```json
GET /api/v1/clinic/lab-adapters
{
  "items": [
    {
      "id": "adapter-uuid",
      "name": "İdexx Catalyst One",
      "modality": "lab",
      "format": "proprietary",
      "endpoint": "lab.vetniva.local:8080",
      "active": true
    },
    {
      "id": "adapter-uuid-2",
      "name": "Vetlab HL7 Bridge",
      "modality": "lab",
      "format": "hl7",
      "endpoint": "hl7.vetlab.example.com",
      "active": true
    }
  ],
  "total": 2
}
```

- `modality`: `lab` | `imaging`.
- `format`: `hl7` | `fhir` | `astm` | `proprietary`.
- `endpoint` (string): cihaz/lab URL veya identifier.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped;
SUPERADMIN bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/lab-adapter.ts`
- AI chunk: `flow-lab-adapter`
