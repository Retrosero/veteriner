# POST /api/v1/cd/dispensings

Hayvan için kontrollü ilaç kullanım (`dispensed`) kaydı oluşturur ve stok
etkisini negatif hareket olarak yazar.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:create`
- **Audit:** `audit:cd.dispensed` (info)
- **Tenant izolasyonu:** tenant actor bağlamından türetilir.

`emergencyUse=true` değilse `ownerId` ve `patientId` zorunludur. Reçete eden
veteriner ve reçete numarası kayıtla birlikte saklanır. İşlem append-only'dir.

**Hatalar:** `VET-CD-0001`, `VET-VALIDATION-0001`, `VET-AUTHZ-0001`.
