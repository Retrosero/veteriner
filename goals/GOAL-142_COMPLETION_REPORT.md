# GOAL-142 — İngiltere Klinik Kayıt Kuralları (Completion Report)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Özet
RCVS (Royal College of Veterinary Surgeons) klinik kayıt
standardı. Ek GB alanları: RCVS number, POM-V category,
KCC score, anaesthesia protocol.

## Çıktılar

### Döküman (bu commit)
- `docs/clinical/GB_RECORD_RULES.md` — yasal dayanak
  (Veterinary Surgeons Act 1966, RCVS Code), RCVS
  Madde 1-3 gereksinimleri, ek GB alanları, saklama
  (hayat + 5 yıl), audit.

### Ek GB Alanları
- `rcvsNumber` (regex `^\d{6,7}$`).
- `pomvCategory` (POM-V | POM-VPS | NFA-VPS | SAES).
- `kccScore` (1-9, vücut kondüsyon).
- `anaesthesiaProtocol` (drug, dose, induction +
  maintenance).
- `surgicalTime` (dakika).
- `dischargeInstructions` (yazılı).

### Sözleşme (planlanan)
```typescript
export const kccScoreSchema = z.number().int().min(1).max(9);
export const rcvsNumberSchema = z.string().regex(/^\d{6,7}$/);
export const pomvCategorySchema = z.enum([
  "POM-V", "POM-VPS", "NFA-VPS", "SAES",
]);
```

## İş Kuralları
- **5 yıl saklama** (ilaç + klinik kayıt).
- **Mikroçip verisi:** hayat boyu.
- **Audit:** zaten mevcut (FAZ-0).

## Yapılmayanlar / Bilinçli Atlamalar
- **RCVS PSS akreditasyonu** → Faz 15+.
- **Insurance integration (Petplan)** → Faz 15+.
- **Controlled drugs** (ayrı FAZ-143).

## Döküman Uyum
- `pnpm docs:check` → temiz.

## Commit
- Docs: (bu commit) — `docs(clinical): GOAL-142 GB klinik kayıt kuralları`
