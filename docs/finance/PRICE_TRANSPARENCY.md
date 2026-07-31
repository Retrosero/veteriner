# Fiyat Şeffaflığı + Estimate (GOAL-144)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Amaç
İngiltere'de klinik hizmetleri için ön fiyat (estimate)
sunma. RCVS + CMA (Competition and Markets Authority)
şeffaflık kuralları.

## Yasal Dayanak
- **Consumer Rights Act 2015:** Hizmetin açık tanımı +
  fiyat önceden bildirilmeli.
- **RCVS Code of Professional Conduct:** Fiyat
  şeffaflığı.
- **CMA Veterinary Services Market Study (2024):**
  Müşteriye önceden fiyat bilgisi verilmeli.

## Estimate Akışı

### Senaryo
1. Müşteri telefonla "kedimi kısırlaştırmak istiyorum,
   ne kadar?" diye sorar.
2. Klinik staff `/estimates/new` sayfasında hasta
   bilgilerini girer.
3. Hizmet + ek hizmetler seçilir.
4. Sistem estimate üretir (price list'ten + VAT).
5. PDF/email ile müşteriye gönderilir.
6. Estimate 30 gün geçerlidir.

### Estimate Bileşenleri
- **Patient:** ad, tür, ırk, yaş, cinsiyet.
- **Service:** ana hizmet (örn. ovariohysterectomy).
- **Add-ons:** pre-op bloods, IV fluids, pain
  management, post-op check.
- **Anaesthesia:** induction + maintenance.
- **Hospitalization:** kafes tipi + süre.
- **Consumables:** iğne, sütur, ilaç.
- **VAT:** GB adapter ile %20 standart.

### Örnek (Kedi kısırlaştırma)
| Hizmet | Net | VAT | Gross |
|--------|-----|-----|-------|
| Ovariohysterectomy (kedi) | £180.00 | £36.00 | £216.00 |
| Pre-op bloods | £45.00 | £9.00 | £54.00 |
| IV fluids | £30.00 | £6.00 | £36.00 |
| Pain management (3 gün) | £25.00 | £5.00 | £30.00 |
| Post-op check | £0.00 | £0.00 | £0.00 |
| Hospitalization (1 gece) | £40.00 | £8.00 | £48.00 |
| **Toplam** | **£320.00** | **£64.00** | **£384.00** |

## Endpoint'ler (planlanan)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/estimates` | `clinic:estimate:create` |
| 2 | GET | `/api/v1/estimates` | `clinic:estimate:read` |
| 3 | GET | `/api/v1/estimates/{id}` | `clinic:estimate:read` |
| 4 | GET | `/api/v1/estimates/{id}/pdf` | `clinic:estimate:read` |
| 5 | POST | `/api/v1/estimates/{id}/accept` | `clinic:estimate:read` |
| 6 | POST | `/api/v1/estimates/{id}/decline` | `clinic:estimate:read` |

## İş Kuralları
- **Geçerlilik:** 30 gün.
- **Para birimi:** Tenant.country'ye göre (TR TRY / GB
  GBP).
- **VAT:** GB adapter (%20 standart) ile hesaplanır.
- **Accept → Sale:** Estimate kabul edildiğinde
  `Sale.estimateId` ile bağlanır; sale oluşturulur.
- **Decline → Audit:** `audit:estimate.declined` üretilir;
  decline nedeni kaydedilir (opsiyonel).
- **Audit:** `audit:estimate.created` (info),
  `audit:estimate.accepted` (info),
  `audit:estimate.declined` (info).

## Price List ile İlişki

- `PriceList` (FAZ-7) ürün/hizmet fiyatları tanımlar.
- Estimate, price list'ten referans alır.
- Override (manuel fiyat) yalnızca OWNER tarafından
  yapılabilir; audit ile.

## GB vs TR Farklılıkları

| Alan | TR | GB |
|------|----|----|
| Para | TRY | GBP |
| VAT | %20 standart | %20 standart |
| Geçerlilik | 30 gün | 30 gün |
| **Estimate zorunlu mu?** | Hayır (iyi uygulama) | **Evet** (CMA kuralı) |
| Yazılı onay | Hayır (sözlü yeterli) | **Evet** (müşteri imzası) |

## Yapılmayanlar / Bilinçli Atlamalar
- **Insurance pre-authorization** → Faz 15+ (UK pet
  insurance integration).
- **Treatment plan (multi-visit)** → Faz 15+.
- **Estimate expiry extension workflow** → Faz 15+.

## Commit
- Docs: (bu commit) — `docs(finance): GOAL-144 fiyat şeffaflığı dokümanı`
- Code: Faz 14+ (`estimates` modülü).
