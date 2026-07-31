# GOAL-141 — GBP + VAT + İngiltere Fiyatlandırma (Completion Report)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Özet
İngiltere pilotu için GBP para birimi, VAT
hesaplaması (%20 standart, %0 POM-V, %0 pet food) ve
fiyatlandırma kuralları.

## Çıktılar

### Döküman (bu commit)
- `docs/finance/GB_VAT.md` — yasal dayanak (VAT Act
  1994 + HMRC Notice 709/3), CountryAdapter GB
  implementasyon planı, fiyatlandırma örnekleri, invoice
  formatı, pilot için iyzico/Stripe önerisi.

### VAT Oranları (GB)
| Kategori | Oran |
|----------|------|
| Hizmet (muayene, ameliyat) | %20 |
| POM-V ilaç | %0 (muaf) |
| Pet food (kedi/köpek) | %0 (temel gıda muafiyeti) |
| Diğer (supplies) | %20 |

### Country Adapter (planlanan)
```typescript
interface CountryAdapter {
  readonly country: "TR" | "GB";
  formatCurrency(amount, currency): string;
  formatDate(date): string;
  formatPhone(phone): string;
  validatePostalCode(code): boolean;
  calculateVAT(net, category): { vat, gross, rate };
}
```

## İş Kuralları
- **Currency:** Tenant.country → TR (TRY) veya GB (GBP).
- **VAT:** countryAdapter.calculateVAT ile.
- **Invoice:** `Net | VAT (£X) | Total` + VAT Number
  (GB123456789).
- **Fatura numarası:** `INV-YYYY-NNNNNN`.

## Yapılmayanlar / Bilinçli Atlamalar
- **MTD (Making Tax Digital) entegrasyonu** → Faz 15+
  (HMRC API).
- **Reverse charge** → Faz 15+.
- **Çoklu KDV oranı (mixed basket)** → Faz 15+.

## Döküman Uyum
- `pnpm docs:check` → temiz.
- `pnpm i18n:check` → temiz.

## Commit
- Docs: (bu commit) — `docs(finance): GOAL-141 GBP + VAT dokümanı`
- Code: Faz 14+ (`gb-adapter.ts`).
