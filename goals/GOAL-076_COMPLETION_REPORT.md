# GOAL-076 — Temel Finans Raporları (Completion Report)

## Faz

FAZ-7 (Finans)

## Özet

Temel finans raporları: günlük satış, ödeme yöntemi dağılımı,
açık bakiyeler. Async PDF/CSV export. Tenant-scoped + tarih
aralığı filtreli.

## Çıktılar

### Core (GOAL-076 core commit `d0a58f1`)

- `apps/api/src/modules/reports/reports.controller.ts` — 4
  endpoint (3 read + 1 export).
- `apps/api/src/modules/reports/reports.service.ts` —
  sorgu + export.
- `apps/api/src/modules/reports/reports.repository.ts` —
  tenant-scoped veri erişimi.
- `packages/contracts/src/report.ts` — Zod şemaları:
  DailySalesReport, PaymentMethodsReport,
  OpenBalancesReport, ReportExport.

### Endpoint'ler (4)

| #   | Method | Path                              | Yetki                          |
| --- | ------ | --------------------------------- | ------------------------------ |
| 1   | GET    | `/api/v1/reports/daily-sales`     | `clinic:report:financial:read` |
| 2   | GET    | `/api/v1/reports/payment-methods` | `clinic:report:financial:read` |
| 3   | GET    | `/api/v1/reports/open-balances`   | `clinic:report:financial:read` |
| 4   | POST   | `/api/v1/reports/export`          | `clinic:report:export`         |

### Döküman (bu commit)

- 4 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-report` chunk v1.0.0.

## İş Kuralları

- **Günlük satış:** tarih aralığı + currency + sourceType +
  branchId. Gün × toplam + source dağılımı.
- **Ödeme yöntemi:** method × toplam + işlem adedi.
- **Açık bakiyeler:** owner × tahsil edilmemiş tutar;
  default `totalDebit DESC`.
- **Export:** async job (FAZ-7 in-process, Faz 10 BullMQ);
  pdf/csv; `downloadUrl` signed.

## Audit

- `audit:report.export` (info). Rapor okuma audit YOK.

## Tenant İzolasyonu

- Tüm sorgular tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **BullMQ + cron export temizleme** → Faz 10.
- **Custom report builder** → ayrı goal (Faz 9+).
- **KVKK-safe export (PII redaction)** → Faz 12+
  (güvenlik denetimi).

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-076 özgü
  hata yok.**

## Testler

- `reports.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-077 (e-SMM adapter) docs.
- FAZ-7 kapanışı.

## Commit

- Core: `d0a58f1` — `GOAL-076 temel finans raporları core`
- Docs/i18n: (bu commit) — `docs(reports): GOAL-076 temel
finans raporları doküman ve i18n tamamla`
