# GET /api/v1/cd/stock

İlaç, schedule, birim, şube ve saklama alanına göre güncel controlled-drug
stok bakiyelerini döner.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:prescription:read`
- **Tenant izolasyonu:** stok projeksiyonu actor tenantı ile sınırlandırılır.

Received/returned pozitif; dispensed/wasted/transfer çıkışı negatif; transfer
girişi pozitif hareket olarak hesaplanır. Fiziksel sayım kayıtları bakiyeyi
değiştirmez.

**Hatalar:** `VET-AUTHZ-0001`, `VET-TENANT-0001`.
