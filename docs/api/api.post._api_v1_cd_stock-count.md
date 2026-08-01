# POST /api/v1/cd/stock-count

Yıllık fiziksel kontrollü ilaç sayımını (`count`) kaydeder.

- **Modül:** controlled-drugs
- **Yetki:** `clinic:stock:adjust`
- **Audit:** `audit:cd.stock_count` (info)

Fiziksel miktar, defter miktarı, fark ve tanık saklanır. Tanık zorunludur ve
işlemi yapan kullanıcıyla aynı olamaz. Count kaydı stok bakiyesini değiştirmez.

**Hatalar:** `VET-CD-0003`, `VET-CD-0005`, `VET-VALIDATION-0001`.
