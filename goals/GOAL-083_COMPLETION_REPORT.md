# GOAL-083 — Operasyon Notu ve Kullanılan Malzemeler (Completion Report)

## Faz
FAZ-8 (Klinik operasyonlar)

## Özet
Ameliyat operasyon notu. State: draft → finalized →
amended (append-only). 2 alt kayıt tipi (team, materials).
Ameliyat planı (GOAL-080) entegre; malzemeler Faz 8 reaktif
hook ile stok düşümü (GOAL-066).

## Çıktılar

### Core (GOAL-083 core commit `d18d45a`)
- `apps/api/src/modules/operation-notes/operation-notes.controller.ts` — 8
  endpoint.
- `apps/api/src/modules/operation-notes/operation-notes.service.ts` —
  state machine + amendment append-only.
- `apps/api/src/modules/operation-notes/operation-notes.repository.ts` —
  tenant-scoped CRUD.
- `packages/contracts/src/operation-note.ts` — Zod şemaları.

### Endpoint'ler (8)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/operation-notes` | `clinic:surgery:create` |
| 2 | GET | `/api/v1/clinic/operation-notes` | `clinic:surgery:read` |
| 3 | GET | `/api/v1/clinic/operation-notes/{id}` | `clinic:surgery:read` |
| 4 | PATCH | `/api/v1/clinic/operation-notes/{id}` | `clinic:surgery:create` |
| 5 | POST | `/api/v1/clinic/operation-notes/{id}/team` | `clinic:surgery:create` |
| 6 | POST | `/api/v1/clinic/operation-notes/{id}/materials` | `clinic:surgery:create` |
| 7 | POST | `/api/v1/clinic/operation-notes/{id}/finalize` | `clinic:surgery:complete` |
| 8 | POST | `/api/v1/clinic/operation-notes/{id}/amend` | `clinic:surgery:amend` |

### Döküman (bu commit)
- 8 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-operation-note` chunk
  v1.0.0.

## İş Kuralları
- **State machine:** draft → finalized → amended.
- **Plan in_progress zorunlu** (422 VET-OPNOTE-0003);
  ikinci not reddi (409 VET-OPNOTE-0004).
- **Alt kayıtlar:** team + materials (draft'te).
- **Finalize outcome:** successful | complicated | aborted.
- **Amend append-only:** finalized not korunur;
  amendment ayrı kayıt.

## Audit
- `audit:operation_note.{create,update,team.add,
  material.add,finalize,amend}` (info/warning).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Sütür barcode otomatik tüketim** → Faz 9+ (donanım).
- **Fotoğraf ekleme (operasyon sırası görüntü)** → Faz 8+
  React UI.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-083 özgü
  hata yok.**

## Testler
- `operation-notes.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-084 (yatış/kafes) docs.
- GOAL-085 (yatış order) docs.
- GOAL-086 (gözlem/taburcu) docs.

## Commit
- Core: `d18d45a` — `GOAL-074 + GOAL-083 core (partial): kasa/
  gün sonu + operasyon notu`
- Docs/i18n: (bu commit) — `docs(operation-notes): GOAL-083
  operasyon notu doküman ve i18n tamamla`
