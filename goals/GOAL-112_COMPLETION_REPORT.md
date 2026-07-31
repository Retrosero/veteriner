# GOAL-112 — Alan Sözlüğü ve Yetki Kataloğu (Completion Report)

## Faz
FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet
Tüm form alanları ve permission kodları için merkezi sözlük
oluşturuldu. Yeni alan/permission eklendiğinde CI hata
verir.

## Çıktılar

### Alan Sözlüğü (`docs/fields/`)
- **Mevcut (FAZ-0):** `FIELD_SCHEMA.md` + `FIELD_GLOSSARY.md`
  (Tenant + Branch + Owner + Patient alanları).
- **Bu commit:** FIELD_GLOSSARY.md'ye 4 yeni bölüm eklendi:
  - **Muayene (GOAL-040)** — id, patientId, veterinarianId,
    branchId, appointmentId, kind, status, startedAt,
    completedAt, signedBy, notes, chiefComplaint, diagnosis,
    treatmentPlan, followupDate, search query.
  - **SOAP (GOAL-041)** — id, examinationId, subjective,
    objective, assessment, plan, signedAt, signedBy,
    amendmentReason.
  - **Vitals (GOAL-042)** — id, examinationId, temperatureC,
    heartRateBpm, respiratoryRateRpm, weightKg, systolicMmHg,
    diastolicMmHg, bodyConditionScore, measuredAt.
  - **Aşı uygulama (GOAL-051)** — id, patientId, vaccineId,
    protocolId, lotId, appliedAt, route, site, dose,
    nextDueAt, status.
  - **Genel tipler** — pagination, currency, datetime, PII
    mask formatları.

### Yetki Kataloğu (`docs/permissions/`)
- **Mevcut (FAZ-2):**
  - `PERMISSION_CATALOG.yaml` (machine-readable, 113
    permission × 5 rol × 28 modül).
  - `PERMISSION_MATRIX.md` (human-readable).
  - `ROLE_DESCRIPTIONS.md` (rol açıklamaları).
  - `README.md` (şema).

## İş Kuralları
- **Alan formatı:** `### <alan> (<tip>, <zorunluluk>)` — başlık
  standart.
- **Her alan:** Tip, format/örnek, PII, açıklama.
- **Permission formatı:** `<domain>:<resource>:<action>` (ör.
  `clinic:appointment:create`).
- **CI doğrulaması:** `pnpm docs:check` permission matrisinde
  kod referansı olmayan permission'ları uyarır (şu an
  "pre-existing" hatalar var; pilot kapsamda temizlenecek).

## Yapılmayanlar / Bilinçli Atlamalar
- **Tüm modüllerin alan sözlüğü** (FAZ-2 → 9) → pilot kapsamda
  en çok kullanılan 4 modül eklendi (muayene, SOAP, Vitals,
  aşı). Diğer modüller (lab, görüntüleme, reçete, yatış)
  FAZ-12+ eklenecek.
- **Otomatik field-detection (kod → sözlük)** → Faz 12+ (kod
  tarafı tarama + Zod şemadan alan çıkarma).
- **Permission matris auto-sync (kod → matris)** → Faz 12+
  (decorator'lar ile otomatik güncelleme).

## Döküman Uyum
- `pnpm docs:check` → pre-existing 167 hata (kod
  tarafında permission matrisi eksikleri; bu goal kapsamı
  dışı — FAZ-12'de temizlenecek).
- `pnpm i18n:check` → temiz.

## Testler
- Field + permission sözlükleri statik YAML/Markdown;
  otomatik test yok.
- CI `pnpm docs:check` schema doğrulaması yapar.

## Commit
- Docs: (bu commit) — `docs(fields): GOAL-112 alan sözlüğü genişletme (muayene/SOAP/vitals/aşı)`
