# POST /api/v1/cd/corrections

Mevcut bir controlled-drug kaydını silmeden ters hareketle düzeltir.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:create`
- **Audit:** `audit:cd.corrected` (warning)

`originalEntryId` ve düzeltme gerekçesi zorunludur. Orijinal kayıt immutable
kalır; API ters işaretli yeni bir `correction` kaydı üretir.

**Hatalar:** `VET-CD-0006`, `VET-VALIDATION-0001`, `VET-AUTHZ-0001`.
