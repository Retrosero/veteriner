# GOAL-094 — Cihaz ve Dış Laboratuvar Adaptör Sözleşmesi (Completion Report)

## Faz
FAZ-9 (Laboratuvar)

## Özet
Dış cihaz/laboratuvar adaptör sözleşmesi (pilot). 4
format (HL7/FHIR/ASTM/proprietary). Export/import async
akış + retry. Faz 14'te gerçek entegrasyon (PACS/DICOM,
IDEXX, Vetlab).

## Çıktılar

### Core (GOAL-094 core commit `6c235bd`)
- `apps/api/src/modules/lab-adapters/lab-adapters.controller.ts` — 9
  endpoint.
- `apps/api/src/modules/lab-adapters/lab-adapters.service.ts` —
  export/import state machine.
- `apps/api/src/modules/lab-adapters/lab-adapters.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/lab-adapter.ts` — Zod şemaları.

### Endpoint'ler (9)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/lab-orders/{labOrderId}/adapter-exports` | `clinic:lab:order` |
| 2 | GET | `/api/v1/clinic/lab-adapter-exports` | `clinic:lab:read` |
| 3 | GET | `/api/v1/clinic/lab-adapter-exports/{id}` | `clinic:lab:read` |
| 4 | POST | `/api/v1/clinic/lab-adapter-exports/{id}/retry` | `clinic:lab:order` |
| 5 | POST | `/api/v1/clinic/lab-adapter-exports/{id}/cancel` | `clinic:lab:order` |
| 6 | POST | `/api/v1/clinic/lab-orders/{labOrderId}/adapter-imports` | `clinic:lab:enter_result` |
| 7 | GET | `/api/v1/clinic/lab-adapter-imports` | `clinic:lab:read` |
| 8 | GET | `/api/v1/clinic/lab-adapter-imports/{id}` | `clinic:lab:read` |
| 9 | GET | `/api/v1/clinic/lab-adapters` | `clinic:lab:read` |

### Döküman (bu commit)
- 9 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-lab-adapter` chunk
  v1.0.0.

## İş Kuralları
- **Format:** hl7 | fhir | astm | proprietary.
- **Modality:** lab | imaging.
- **Export async:** pending → processing → completed |
  failed | cancelled.
- **Import async:** pending → processing → completed | failed.
- **Retry:** 3 deneme sonrası kalıcı failed.
- **Audit:** `audit:lab_adapter_export.*` +
  `audit:lab_adapter_import.create`.

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Gerçek HL7/FHIR parse** → Faz 14+.
- **PACS/DICOM gateway** → Faz 14+.
- **Adapter CRUD (POST/DELETE)** → ayrı admin endpoint
  (sistem yönetimi).
- **Retry backoff exponential** → Faz 10 BullMQ ile.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-094 özgü
  hata yok.**

## Testler
- `lab-adapters.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- **FAZ-9 kapanışı.** Tüm 5 goal (090-094) docs tamam.
- FAZ-10 (BullMQ + Prisma, 100-108) docs sırası.

## Commit
- Core: `6c235bd` — `GOAL-094 cihaz ve dış laboratuvar
  adaptör sözleşmesi core`
- Docs/i18n: (bu commit) — `docs(lab-adapters): GOAL-094
  cihaz adapter doküman ve i18n tamamla + FAZ-9 kapanışı`
