# GOAL-144 — Fiyat Şeffaflığı + Estimate (Completion Report)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Özet
İngiltere'de klinik hizmetleri için ön fiyat (estimate).
CMA (2024) + RCVS şeffaflık kuralları. TR'den farklı: GB'de
estimate **zorunlu** ve müşteri imzası gerekli.

## Çıktılar

### Döküman (bu commit)
- `docs/finance/PRICE_TRANSPARENCY.md` — yasal dayanak
  (Consumer Rights Act 2015, RCVS, CMA), estimate akışı,
  örnek (kedi kısırlaştırma £384.00 gross), endpoint'ler (6),
  GB vs TR farklılıkları, audit.

### Endpoint'ler (planlanan)
- POST/GET `/api/v1/estimates`
- GET `/api/v1/estimates/{id}/pdf`
- POST `/api/v1/estimates/{id}/accept|decline`

### İş Kuralları
- **Geçerlilik:** 30 gün.
- **Currency:** Tenant.country'ye göre (TRY/GBP).
- **VAT:** GB adapter %20.
- **Accept → Sale:** `Sale.estimateId` ile bağlanır.
- **GB zorunlu:** estimate müşteri imzası olmadan satış
  yapılamaz (CMA kuralı).
- **Audit:** `audit:estimate.created/accepted/declined`.

### GB vs TR
| Alan | TR | GB |
|------|----|----|
| Para | TRY | GBP |
| Estimate zorunlu mu? | Hayır | **Evet** |
| Yazılı onay | Hayır | **Evet** |

## Yapılmayanlar / Bilinçli Atlamalar
- **Insurance pre-authorization** → Faz 15+ (Petplan).
- **Treatment plan (multi-visit)** → Faz 15+.
- **Estimate expiry extension** → Faz 15+.

## Döküman Uyum
- `pnpm docs:check` → temiz.

## Commit
- Docs: (bu commit) — `docs(finance): GOAL-144 fiyat şeffaflığı dokümanı`
- Code: Faz 14+ (`estimates` modülü).
