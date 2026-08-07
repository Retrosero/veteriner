# GOAL-128 — Orphan Field Fix Planı

**Tarih:** 2026-08-07
**Durum:** Plan (uygulama FAZ-12+ backlog)
**Kapsam:** `docs:check` orphan field uyarılarını 1127 → 0'a indirmek

## 1) Sorun

`pnpm docs:check` `docs/fields/fields.yaml` içindeki 1127 alanın
kodda referansı olmadığını raporluyor. `c3845ab` ile severity `error`
→ `warning` yapıldı (CI gate'i düşürmemek için). Production release
öncesi bu uyarıların temizlenmesi gerekiyor (c3845ab follow-up).

**Root cause:** Alanlar yanlış entity altında tanımlanmış.
`tools/docs-check/src/scanners/fields.ts` `extractEntityFromSchemaName`
zaten düzeltilmişti (`fileEntity` always preferred) ama bu alanlar
başlangıçta zaten yanlış entity'ye yazılmış.

## 2) Envanter (entity bazında, top 30)

| Entity               | Orphan Count | Olası gerçek entity                                    |
| -------------------- | ------------ | ------------------------------------------------------ |
| `order`              | **92**       | `audit_event` veya `error_event`                       |
| `event`              | **72**       | `audit_event` (eventName, eventType, eventData)        |
| `stock`              | **69**       | `stock_movement` veya `inventory`                      |
| `note`               | **54**       | `operation_note` (note'lar ayrı entity)                |
| `entry`              | **50**       | `journal_entry` veya `stock_movement_entry`            |
| `job`                | **48**       | `job_run` (zaten `job_run` var, duplicate)             |
| `sale`               | **44**       | `petshop_sale` veya `clinic_sale` (büyük ihtimalle)    |
| `cash_register`      | **41**       | `kasa` (zaten `kasa` var)                              |
| `cash`               | **41**       | `kasa` (alias?)                                        |
| `vaccine`            | **39**       | `vaccine_application` veya `vaccine_card`              |
| `result`             | **38**       | `lab_result` veya `error_event.result`                 |
| `adapter`            | **36**       | `adapter_log` (storage adapter'leri)                  |
| `ownership_history`  | **35**       | Doğru entity, sadece kodda kullanılmıyor                |
| `job_run`            | **33**       | Doğru entity, dynamic access                           |
| `kvkk`               | **32**       | `kvkk_erasure_request`                                 |
| `log_retention`      | **31**       | Doğru entity                                           |
| `product`            | **31**       | `product` (büyük ihtimalle doğru)                      |
| `stock_alert`        | **31**       | Doğru entity                                           |
| `owner`              | **30**       | Doğru entity                                           |
| `appointment`        | **29**       | Doğru entity                                           |
| `branch`             | **28**       | `audit_event` (audit alanları)                         |
| `plan`               | **26**       | `surgery_plan` veya `treatment_plan`                   |
| `stock_movement`     | **26**       | Doğru entity                                           |
| `security_event`     | **25**       | Doğru entity                                           |
| `payment_reversal`   | **25**       | Doğru entity                                           |
| `prescription`       | **24**       | Doğru entity                                           |
| `error_event`        | **24**       | Doğru entity                                           |
| `file`               | **24**       | Doğru entity                                           |
| `operation_note`     | **24**       | Doğru entity                                           |
| `pricing`            | **21**       | Doğru entity                                           |

**Top 30 = ~1050 orphan (%93)**. Geri kalan 30 entity ~77 alan
tutar.

## 3) Kategorize

### Kategori A: Yanlış entity (yüksek güvenli taşıma, ~400 alan)

`order.*`, `event.*`, `branch.actor*`, `branch.auditEventId` gibi
alanlar **audit event alanları**. Bunlar yeni `audit_event` entity'si
altında toplanmalı.

```
order.actor, order.actorId, order.actorType, order.targetType,
order.targetId, order.action, order.correlationId, order.ipAddress,
order.userAgentHash, order.args, order.eventName, order.errorCode,
order.message, order.httpStatus, order.severity, order.i18nKey,
order.input, order.details, order.sessionId, order.auditEventId
→ audit_event.*
```

Aynı şekilde:
- `branch.actor*` ve `branch.auditEventId` → `audit_event.*`
- `note.*` (54) → `operation_note.*` (zaten `operation_note` var, alias)
- `entry.*` (50) → `stock_movement.*` veya `journal_entry`
- `job.*` (48) → `job_run.*` (alias)
- `cash_register.*` (41) → `kasa.*`
- `cash.*` (41) → `kasa.*`
- `vaccine.*` (39) → `vaccine_application.*` veya `vaccine_card.*`
- `result.*` (38) → `lab_result.*`
- `adapter.*` (36) → `storage_adapter.*`
- `kvkk.*` (32) → `kvkk_erasure_request.*`
- `plan.*` (26) → `surgery_plan.*` veya `treatment_plan.*`

### Kategori B: Dynamic reflection (kodda referansı yok ama çalışıyor, ~200 alan)

Bazı alanlar **dinamik reflection** ile erişiliyor:
- Audit log alanları (security_event, error_event, log_retention) —
  `prisma.${entity}.findMany({ select: { ... } })` pattern'i
- Storage adapter alanları — runtime type checking
- JSON serialization (örn. `JSON.stringify(tenant.modules)`) — `enabledModules`

Bunlar scanner tarafından yakalanamıyor çünkü string literal
olarak kodda yoklar. **Scanner'ı geliştirmek** gerek:
- `Prisma.${entity}.*` pattern'lerini tarama
- `JSON.stringify(obj)` içindeki property'leri heuristic çıkarma
- `Object.keys(obj)` veya `for ... in obj` pattern'lerini tarama

### Kategori C: Doğru entity ama orphan (kullanılmıyor, ~100 alan)

- `ownership_history.*` (35) — schema'da var ama service'te kullanılmıyor
  (audit trail için pasif)
- `log_retention.*` (31) — scheduler var ama sweep logic tam değil
- `stock_alert.*` (31) — alarm sistemi pasif
- `appointment.*` (29) — `medical_record` üzerinden erişim olabilir

Bu alanlar **gerçekten kullanılmıyor**. İki seçenek:
1. **Schema'dan kaldır** (migration ile)
2. **fields.yaml'dan kaldır** (orphan check amacı dışı)

FAZ-12+ için: schema'dan kaldırmak güvenli (henüz production'da
yaygın kullanılmıyor).

### Kategori D: Tenant istatistikleri (dynamic, ~50 alan)

`tenant.branchCount`, `tenant.userCount`, `tenant.lastLoginAt`,
`tenant.errorCountLast24h`, `tenant.storageUsedMb` gibi alanlar
**computed/runtime** — DB kolonu değil, hesaplanan değerler.

Çözüm: `tenant_stats` veya `tenant_metrics` ayrı entity oluştur,
alanları oraya taşı. Veya bu alanlar `tenant_audit` veya
`tenant_metrics` aggregate tabloda tutulur.

## 4) Çözüm stratejisi

### Faz 1: Otomatik düzeltme (1-2 gün)

1. **Audit event extractor** — yeni scanner pattern'i:
   - `prisma.${entity}.*` select'leri
   - `JSON.stringify(obj)` içindeki property access
2. **Category A otomatik taşıma script** — `tools/docs-check/scripts/`
   altında yeni script:
   - `migrate-orphan-fields.mjs` — fields.yaml'ı oku, Kategori A
     alanlarını yeni entity'lere taşı
   - Manuel review için dry-run mode
3. **Category C temizleme** — `ownership_history`, `stock_alert`,
   `log_retention` orphan alanlarını audit et, gerçekten
   kullanılmayanları fields.yaml'dan çıkar

### Faz 2: Manuel düzeltme (1 hafta)

4. **Category D** — `tenant_stats` entity'si oluştur, alanları
   taşı (Prisma migration + repository update)
5. **Category B** — scanner güncellemesi (dynamic reflection)
6. **Final audit** — `pnpm docs:check` çıktısını 0 uyarı hedefi

### Faz 3: CI gate geri yükle (1 gün)

7. **Severity geri `error`'a** — runner.ts'te field check
   `severity: 'warning'` → `'error'`
8. **CI gate doğrulama** — push sonrası GitHub Actions'da
   `pnpm docs:check` 0 hata, 0 uyarı
9. **Production release ready** — c3845ab follow-up kapatıldı

## 5) Tahmini etki

| Adım | Orphan sayısı | Kümülatif |
| ---- | ------------- | --------- |
| Başlangıç | 1127 | 1127 |
| Faz 1.3 (Category C temizleme) | -100 | 1027 |
| Faz 1.2 (Category A taşıma) | -400 | 627 |
| Faz 2.4 (Category D taşıma) | -50 | 577 |
| Faz 2.5 (Category B scanner) | -200 | 377 |
| Faz 2.6 (final audit) | -377 | **0** |

**Hedef:** 3 hafta içinde 1127 → 0, CI gate `error` seviyesine geri.

## 6) Doğrulama ölçütleri

- `pnpm docs:check` → "0 hata, 0 uyarı" (current: 0 hata, 1670 uyarı)
- `tools/docs-check/tests/runner.test.ts` → 8/8 yeşil (severity 'error' test'i geri eklenmeli)
- GitHub Actions docs job → ✅ success
- `pnpm test` (docs-check) → tüm orphan senaryoları yeşil

## 7) Sprint planı (3 hafta)

### Hafta 1: Faz 1 (otomatik düzeltme)

- Gün 1-2: Category A extract script + dry-run
- Gün 3-4: Category C temizleme (ownership_history, stock_alert, log_retention)
- Gün 5: CI gate validation (severity warning kalsın)

### Hafta 2: Faz 2 (manuel düzeltme)

- Gün 1-2: Category B scanner (Prisma + JSON.stringify patterns)
- Gün 3-4: Category D tenant_stats entity (Prisma migration + repo)
- Gün 5: Final audit, manuel cleanup

### Hafta 3: Faz 3 (CI gate restore)

- Gün 1: runner.ts severity 'warning' → 'error'
- Gün 2: test güncelleme (severity expectation)
- Gün 3: CI doğrulama, runbook güncelleme
- Gün 4-5: Buffer + documentation

## 8) Risk'ler

- **Kategori A yanlış taşıma**: migration sırasında kod hâlâ eski
  entity ismini kullanıyor olabilir → TypeScript compile fail. Çözüm:
  global find+replace + ts-prune doğrulama.
- **Kategori B scanner false positive**: dynamic pattern'ler yanlış
  eşleşebilir → manuel whitelist gerekli.
- **Kategori D Prisma migration**: tenant_stats yeni tablo, JOIN
  performans kontrolü.
- **CI gate restore**: orphan check 'error' olunca mevcut kod blok
  olabilir → önce fix, sonra gate upgrade.

## 9) İlgili dokümanlar

- `docs/fields/FIELDS_SCHEMA.md` — alan kataloğu şeması
- `tools/docs-check/src/scanners/fields.ts` — scanner implementasyonu
- `tools/docs-check/scripts/generate-missing-fields.mjs` — mevcut generator
- `goals/GOAL-127-archive/production-release-readiness-2026-08-06.md` — production release gate
- `c3845ab` — orijinal warning downgrade commit

## 10) Definition of Done

- [ ] `pnpm docs:check` → 0 hata, 0 uyarı
- [ ] tools/docs-check/tests/runner.test.ts → severity 'error' test
      geri eklendi ve yeşil
- [ ] GitHub Actions docs job → success
- [ ] Production release gate (GOAL-127) checklist güncellendi
- [ ] docs/operations/PRODUCTION_README.md'de "orphan field = 0" notu
