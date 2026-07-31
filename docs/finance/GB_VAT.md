# GBP + VAT + İngiltere Fiyatlandırma (GOAL-141)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Amaç
İngiltere'deki pilot klinik için GBP para birimi, VAT
(KDV) hesaplaması ve fiyatlandırma kuralları.

## Yasal Dayanak
- **Value Added Tax Act 1994:** Standart %20, indirilmiş
  %5, sıfır %0.
- **HMRC VAT Notice 709/3:** Veteriner hizmetleri **standart
  %20** (çoğu durumda). Ancak:
  - **İlaç satışı (POM-V):** %0 (ilaçlar KDV'den muaf).
  - **Pet food (kedi/köpek):** %0 (temel gıda muafiyeti).
  - **Tedavi hizmeti:** %20 standart.

## Para Birimi
- **GBP (£):** ISO 4217.
- **Decimal:** 2 (pence).
- **Format:** `£1,234.56` (binlik virgül, ondalık nokta).

## Country Adapter

Mevcut `CountryAdapter` interface'i (FAZ-3) genişletilir:

```typescript
interface CountryAdapter {
  readonly country: "TR" | "GB";
  formatCurrency(amount: Decimal, currency: "TRY" | "GBP"): string;
  formatDate(date: Date): string;
  formatPhone(phone: E164): string;
  validatePostalCode(code: string): boolean;
  calculateVAT(
    netAmount: Decimal,
    category: "service" | "medication" | "pet_food" | "other",
  ): { vat: Decimal; gross: Decimal; rate: number };
}
```

### TR Adapter (mevcut)
- VAT: %20 standart, %10 indirilmiş (temel gıda), %0 (ilaç).
- Currency: TRY.

### GB Adapter (yeni)
- VAT: %20 standart, %5 indirilmiş (evcil hayvan
  gıdası), %0 (POM-V ilaç).
- Currency: GBP.
- Tarih: `DD MMM YYYY` (31 Jul 2026).
- Posta kodu: regex `^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$`.

## Fiyatlandırma

### Price List
- `currency`: TRY | GBP | USD | EUR.
- `category`: service | medication | pet_food | supply.
- `vatRate`: tenant konfigürasyonundan (TR %20, GB %20).

### Sale Calculation
```
net = unitPrice * quantity
vat = countryAdapter.calculateVAT(net, category)
gross = net + vat
```

### Örnekler (GB)
| Ürün/Hizmet | Kategori | Net | VAT | Gross |
|-------------|----------|-----|-----|-------|
| Genel muayene | service | £50.00 | £10.00 | £60.00 |
| Aşı uygulaması | service | £30.00 | £6.00 | £36.00 |
| Amoksisilin (POM-V) | medication | £15.00 | £0.00 | £15.00 |
| Kedi maması 1kg | pet_food | £20.00 | £0.00 | £20.00 |
| Çiftlik ziyareti | service | £200.00 | £40.00 | £240.00 |

## Invoice (Fatura)
- **Fatura numarası:** `INV-YYYY-NNNNNN` (sıralı).
- **VAT breakdown:** `Net | VAT (£X) | Total`.
- **Company details:** klinik adı, address, VAT Number
  (GB123456789).

## Receipt (Makbuz)
- **POS makbuz:** kısa format; net + VAT = gross.
- **TCMB / BoE:** günlük kur (multi-currency için).

## Testler
- `country-adapter.spec.ts` — TR + GB adapter.
- `vat-calculation.spec.ts` — kategori bazlı oran.
- `price-list.spec.ts` — multi-currency.

## Yapılmayanlar / Bilinçli Atlamalar
- **MTD (Making Tax Digital) entegrasyonu** → Faz 15+
  (HMRC API; quarterly VAT return).
- **Reverse charge (yurtdışı müşteri)** → Faz 15+.
- **Çoklu KDV oranı (mixed basket)** → Faz 15+ (FAZ-7
  +%20 zaten var; karmaşık hesap Faz 15).

## Commit
- Docs: (bu commit) — `docs(finance): GOAL-141 GBP + VAT dokümanı`
- Code: `apps/api/src/common/finance/gb-adapter.ts`
  (Faz 14+).
