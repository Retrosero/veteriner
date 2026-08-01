# GOAL-090 — Laboratuvar Test Kataloğu (Completion Report)

## Faz

FAZ-9 (Laboratuvar)

## Özet

Laboratuvar test kataloğu (LabTest). 8 kategori
(hematology/biochemistry/microbiology/parasitology/
urinalysis/cytology/imaging/other) + 6 specimenType.
Referans aralıkları + turnaround time + fiyat.

## Çıktılar

### Core (GOAL-090 core commit `6e92831`)

- `apps/api/src/modules/lab-tests/lab-tests.controller.ts` — 4
  endpoint.
- `apps/api/src/modules/lab-tests/lab-tests.service.ts` — iş
  kuralları (unique code, snapshot).
- `apps/api/src/modules/lab-tests/lab-tests.repository.ts` —
  tenant-scoped CRUD.
- `packages/contracts/src/lab-test.ts` — Zod şemaları.

### Endpoint'ler (4)

| #   | Method | Path                            | Yetki              |
| --- | ------ | ------------------------------- | ------------------ |
| 1   | POST   | `/api/v1/clinic/lab-tests`      | `clinic:lab:order` |
| 2   | GET    | `/api/v1/clinic/lab-tests`      | `clinic:lab:read`  |
| 3   | GET    | `/api/v1/clinic/lab-tests/{id}` | `clinic:lab:read`  |
| 4   | PATCH  | `/api/v1/clinic/lab-tests/{id}` | `clinic:lab:order` |

### Döküman (bu commit)

- 4 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-lab-test` chunk
  v1.0.0.

## İş Kuralları

- **Category:** 8 enum.
- **SpecimenType:** 6 enum.
- **Reference ranges:** analyte + unit + low + high.
- **Update snapshot:** aktif order'lar etkilenmez.
- **Audit:** `audit:lab_test.{create,update}` (info).

## Tenant İzolasyonu

- `code` unique tenant-içi; tüm CRUD tenant-scoped;
  SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **Cihaz adapter (GOAL-094)** → ayrı goal.
- **Analyte auto-fill** → Faz 14+ AI integration.
- **Reference range percentile (yaş/cins/ırk)** → Faz 9+.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-090 özgü
  hata yok.**

## Testler

- `lab-tests.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-091 (lab order/numune) docs.
- GOAL-092 (lab sonuçlar) docs.

## Commit

- Core: `6e92831` — `GOAL-090 laboratuvar test kataloğu core`
- Docs/i18n: (bu commit) — `docs(lab-tests): GOAL-090 lab
test kataloğu doküman ve i18n tamamla`
