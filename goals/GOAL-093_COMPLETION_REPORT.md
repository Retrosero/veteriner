# GOAL-093 — Görüntüleme İsteği ve Raporu (Completion Report)

## Faz
FAZ-9 (Laboratuvar)

## Özet
Görüntüleme isteği (ImagingOrder). 5 modality (xray/
ultrasound/ct/mri/dental_xray). State: ordered → scheduled
→ performed → reported → completed/cancelled. PACS/DICOM
entegrasyonu + append-only rapor amendment.

## Çıktılar

### Core (GOAL-093 core commit `8cf7ad1`)
- `apps/api/src/modules/imaging-orders/imaging-orders.controller.ts` — 10
  endpoint.
- `apps/api/src/modules/imaging-orders/imaging-orders.service.ts` —
  state machine.
- `apps/api/src/modules/imaging-orders/imaging-orders.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/imaging-order.ts` — Zod şemaları.

### Endpoint'ler (10)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/imaging-orders` | `clinic:imaging:order` |
| 2 | GET | `/api/v1/clinic/imaging-orders` | `clinic:imaging:read` |
| 3 | GET | `/api/v1/clinic/imaging-orders/{id}` | `clinic:imaging:read` |
| 4 | POST | `/api/v1/clinic/imaging-orders/{id}/schedule` | `clinic:imaging:order` |
| 5 | POST | `/api/v1/clinic/imaging-orders/{id}/perform` | `clinic:imaging:perform` |
| 6 | POST | `/api/v1/clinic/imaging-orders/{id}/report` | `clinic:imaging:report` |
| 7 | POST | `/api/v1/clinic/imaging-orders/{id}/approve-report` | `clinic:imaging:report` |
| 8 | POST | `/api/v1/clinic/imaging-orders/{id}/amend-report` | `clinic:imaging:report` |
| 9 | POST | `/api/v1/clinic/imaging-orders/{id}/complete` | `clinic:imaging:order` |
| 10 | POST | `/api/v1/clinic/imaging-orders/{id}/cancel` | `clinic:imaging:order` |

### Döküman (bu commit)
- 10 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-imaging-order` chunk
  v1.0.0.

## İş Kuralları
- **Modality:** xray | ultrasound | ct | mri | dental_xray.
- **State machine:** ordered → scheduled → performed →
  reported → completed | cancelled.
- **Schedule:** scheduledAt + room.
- **Perform:** imageIds[] (PACS/DICOM ref).
- **Report:** findings + impression + recommendations.
- **Approve:** finalize.
- **Amend:** append-only (eski rapor korunur).

## Audit
- `audit:imaging_order.{create,schedule,perform,report,
  approve_report,amend_report,complete,cancel}`
  (info/warning).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **PACS/DICOM gerçek entegrasyonu** → Faz 14+ cihaz adapter.
- **DICOM viewer (UI)** → Faz 8+ React.
- **AI ön-rapor (anomali detection)** → Faz 14+ AI.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-093 özgü
  hata yok.**

## Testler
- `imaging-orders.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-094 (cihaz/dış laboratuvar adapter) docs.
- FAZ-9 kapanışı.

## Commit
- Core: `8cf7ad1` — `GOAL-093 görüntüleme isteği ve raporu
  core (partial)`
- Docs/i18n: (bu commit) — `docs(imaging-orders): GOAL-093
  görüntüleme doküman ve i18n tamamla`
