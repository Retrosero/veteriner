# GOAL-081 — Onam Formları (Completion Report)

## Faz

FAZ-8 (Klinik operasyonlar)

## Özet

Onam formu (Consent) akışı. Şablon + versiyon + hasta +
sahip + source. 3 imza yöntemi (wet/e_signature/
verbal_witness). Ameliyat planı (GOAL-080) ile entegre.

## Çıktılar

### Core (GOAL-081 core commit `3b4c187`)

- `apps/api/src/modules/consents/consents.controller.ts` — 5
  endpoint.
- `apps/api/src/modules/consents/consents.service.ts` —
  state machine + imza kanıtı.
- `apps/api/src/modules/consents/consents.repository.ts` —
  tenant-scoped CRUD.
- `packages/contracts/src/consent.ts` — Zod şemaları.

### Endpoint'ler (5)

| #   | Method | Path                                  | Yetki                   |
| --- | ------ | ------------------------------------- | ----------------------- |
| 1   | POST   | `/api/v1/clinic/consents`             | `clinic:consent:sign`   |
| 2   | GET    | `/api/v1/clinic/consents`             | `clinic:consent:read`   |
| 3   | GET    | `/api/v1/clinic/consents/{id}`        | `clinic:consent:read`   |
| 4   | POST   | `/api/v1/clinic/consents/{id}/sign`   | `clinic:consent:sign`   |
| 5   | POST   | `/api/v1/clinic/consents/{id}/revoke` | `clinic:consent:revoke` |

### Döküman (bu commit)

- 5 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-consent` chunk v1.0.0.

## İş Kuralları

- **State machine:** draft → signed | revoked.
- **İmza yöntemi:** `wet` | `e_signature` | `verbal_witness`.
- **İmza kanıtı:** IP, UA hash, timestamp + opsiyonel
  geo (KVKK uyumlu).
- **Ameliyat planı:** `sourceType='surgery_plan'` zorunlu;
  imza sonrası plan başlatılabilir.
- **Revoke:** signed → revoked; ameliyat planı iptal
  tetiklenir.

## Audit

- `audit:consent.{create,sign,revoke}` (info/warning).
- Sign: `signatureMethod` + `signatureEvidence` payload.
- Revoke: `reason` + `previousStatus` payload.

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **E-imza provider (e-imza, NETCDS)** → Faz 12+ (KVKK
  denetimi).
- **Şablon editörü (UI)** → Faz 8+ React.
- **Expire otomatik** → sonraki refactor.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-081 özgü
  hata yok.**

## Testler

- `consents.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-082 (anestezi takibi) docs.
- GOAL-083 (operasyon notu) docs.

## Commit

- Core: `3b4c187` — `GOAL-081 onam formları core`
- Docs/i18n: (bu commit) — `docs(consents): GOAL-081 onam
formları doküman ve i18n tamamla`
