# Kullanıcı Eğitimi — Stok ve Petshop Yönetimi

## Amaç
Ürün kataloğu, depo/raf/lot, tedarikçi, satın alma, stok
hareketleri, petshop satış/iade, klinik tüketimi ve düşük
stok/SKT uyarılarının nasıl yönetileceğini açıklar.

## Hedef kitle
- STAFF (petshop kasiyer + depo sorumlusu)
- VETERINARIAN (klinik tüketimi)
- OWNER (genel yönetim)

## Senaryolar

### Senaryo 1 — Yeni ürün ekle

1. `/clinic/inventory/products/new` sayfasına git.
2. Ürün bilgilerini gir: name, sku, barcode, category, unit,
   price list.
3. "Kaydet" butonuna tıkla.
4. Ürün kataloğa eklenir; pasif durumda (stok hareketi
   yapılamaz).

### Senaryo 2 — Depo ve raf oluştur

1. `/clinic/inventory/warehouses/new` sayfasına git.
2. Depo adı + branch gir.
3. "Kaydet" butonuna tıkla.
4. Depo ID'si alındıktan sonra `/clinic/inventory/shelves/new`
   ile raf ekle.
5. Raf: name, warehouse, category (medication | food |
   accessory | other).

### Senaryo 3 — Tedarikçi ve satın alma siparişi

1. `/clinic/inventory/suppliers/new` ile tedarikçi ekle.
2. `/clinic/inventory/purchase-orders/new` ile PO oluştur.
3. Tedarikçi + lines (ürün + miktar + unitPrice) gir.
4. "Onaya Gönder" butonuna tıkla.
5. **OWNER** PO'yu `approved` durumuna getirir.
6. "Teslim Al" butonuna tıkla → lot'lar otomatik oluşturulur,
   stok `+` hareketi yapılır.

### Senaryo 4 — Stok düşük uyarısı

1. `/clinic/inventory/stock-alerts/low-stock` sayfasına git.
2. Eşik altındaki ürünler listelenir.
3. "Onayla" ile acknowledge; veya "Sipariş Ver" ile hızlı PO
   oluştur.

### Senaryo 5 — SKT yaklaşan lot uyarısı

1. `/clinic/inventory/stock-alerts/expiring-lots` sayfasına
   git.
2. 30 gün içinde SKT'si geçecek lot'lar listelenir.
3. "Onayla" ile acknowledge.

### Senaryo 6 — Petshop satışı

1. `/petshop/sales/new` sayfasına git.
2. Müşteri seç (mevcut veya walk-in).
3. Ürünleri barkod veya arama ile ekle.
4. Ödeme yöntemi seç.
5. "Satışı Tamamla" butonuna tıkla.
6. Stok otomatik düşer, fiş yazdırılabilir.

### Senaryo 7 — Petshop iade

1. Satış detayına git.
2. "İade Oluştur" butonuna tıkla.
3. İade edilecek ürün + miktar + neden gir.
4. "Onayla" butonuna tıkla.
5. Stok otomatik geri döner (lot bazında).

### Senaryo 8 — Klinik tüketimi (muayene sırasında)

1. Muayene çalışma ekranında "Orders" sekmesi.
2. Order türü `medication` seç.
3. Ürünü seç + miktar gir.
4. "Kaydet" butonuna tıkla.
5. Sistem otomatik `stock_movement: out` oluşturur (lot bazında,
   FIFO).

## İpuçları

- **Lot takibi:** Tüm ilaç ve gıda ürünleri lot bazında takip
  edilir. SKT kontrolü otomatik yapılır.
- **FIFO:** Stok çıkışında ilk giren lot önce kullanılır
  (First-In, First-Out).
- **Eşik:** Ürün bazında minStokLevel tanımlanabilir; altına
  düşünce otomatik uyarı oluşur.
- **PII:** Kullanıcı bilgisi PII mask'lı saklanır.

## Sık karşılaşılan sorular

**S: Pasif ürün satılabilir mi?**
C: Hayır, yalnızca aktif ürünler satılabilir. Arşivlenen
ürünler için yeni kayıt açın.

**S: Stok negatife düşebilir mi?**
C: Hayır, stok yetersizse 409 `VET-INVENTORY-0001` döner.
Düzeltme için stok sayımı yapın.

**S: Lot'lar nasıl yönetilir?**
C: Satın alma teslim alındığında otomatik oluşturulur.
Elle de eklenebilir. SKT'si geçmiş lot pasifleşir.

**S: Klinik tüketimi ile petshop satışı arasındaki fark?**
C: Klinik tüketimi muayene order'ından otomatik; petshop satışı
müşteriye yapılan ticari satış. Audit farklı (klinik:patient
order; petshop:sale).

## Hata durumları

| Hata | Çözüm |
|------|-------|
| Pasif ürün | Ürünü aktifleştirin veya yeni kayıt açın. |
| Stok yetersiz | Stok sayımı yapın; PO oluşturun. |
| Lot SKT geçmiş | Lot pasifleşir; yenisi alın. |
| Yetkisiz | OWNER veya depo sorumlusu yetkisi gerekli. |

## İlgili dokümanlar
- `docs/workflows/petshop_sale.md`
- `goals/GOAL-060 → 067_COMPLETION_REPORT.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#inventory:*`
- `docs/permissions/PERMISSION_CATALOG.yaml#petshop:*`
