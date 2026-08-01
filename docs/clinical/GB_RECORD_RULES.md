# İngiltere Klinik Kayıt Kuralları (GOAL-142)

## Faz

FAZ-14 (İngiltere ülke paketi)

## Amaç

İngiltere'deki klinik kayıt kuralları (RCVS — Royal College
of Veterinary Surgeons).

## Yasal Dayanak

- **Veterinary Surgeons Act 1966:** Kayıt tutma
  yükümlülüğü.
- **RCVS Code of Professional Conduct:** Detaylı klinik
  kayıt standardı.
- **RCVS Practice Standards Scheme (PSS):** Akreditasyon
  için kayıt gereksinimleri.
- **Animals (Scientific Procedures) Act 1986:** Tedavi
  kayıtları.
- **Veterinary Medicines Regulations 2013:** İlaç
  uygulama kayıtları.

## Kayıt Standardı

### RCVS Madde 1 — Tanımlama

- **Owner (Client):** ad, adres, telefon, email.
- **Patient (Animal):** ad, tür, ırk, yaş, cinsiyet,
  mikroçip (varsa), **KCC (Kennedy Class Code)**
  conditioning score.
- **Veterinary surgeon:** RCVS kayıt numarası.

### RCVS Madde 2 — Klinik Kayıt

- **Initial presentation:** Şikâyet, öykü, klinik
  muayene bulguları.
- **Investigations:** Lab, görüntüleme, biyopsi sonuçları.
- **Diagnosis:** Liste + differential diagnoses.
- **Treatment plan:** İlaç, prosedür, yaşam tarzı
  değişiklikleri.
- **Informed consent:** Yazılı (yazılı form) veya sözlü
  (kayıt edilen).
- **Anaesthesia/sedation:** İlaç, doz, vital monitor.
- **Surgery:** Prosedür, komplikasyonlar.
- **Outcome / discharge:** Taburcu durumu, takip.

### RCVS Madde 3 — İlaç Kayıtları

- **Prescription:** İlaç adı, doz, sıklık, süre, yazılı
  tarih.
- **Dispensing:** Verilen miktar, batch number, expiry.
- **POM-V (Prescription Only Medicine — Veterinarian):**
  Yalnızca veteriner hekim yazabilir.
- **POM-VPS (Veterinarian, Pharmacist, Suitably
  Qualified Person):** 3'lü yetki.
- **NFA-VPS (Non-Food Animal):** Daha geniş erişim.
- **SAES (Small Animal Exemption Scheme):** Yalnızca
  küçük hayvan, bazı muafiyetler.

### POM-V Yönetimi

- Controlled drugs register (FAZ-143).
- Yazılı reçete zorunlu.
- Stok kaydı: batch + expiry + miktar.
- 5 yıl saklama (Veterinary Medicines Regulations
  2013).

## Veterinary Record Standards

### Zorunlu Alanlar (TR + GB)

- **Patient:** name, species, breed, sex, birthDate.
- **Owner:** fullName, phone (E.164).
- **Examination:** startedAt, veterinarianId, branchId.
- **SOAP:** subjective, objective, assessment, plan
  (tüm zorunlu, RCVS).
- **Vitals:** temperatureC, heartRateBpm, respiratoryRateRpm.
- **Diagnosis:** ICD-10 code + description.
- **Prescription:** ilaç adı, dose, frequency, duration.
- **Vaccination:** vaccineId, lotNumber, expirationDate,
  appliedAt.
- **Lab results:** analyte + value + abnormalFlag +
  referenceRange.

### Ek GB Alanları

- **RCVS number** (veteriner hekim kayıt no).
- **POM-V category** (ilaç için).
- **KCC score** (vücut kondüsyon; 1-9).
- **Anaesthesia protocol** (drug, dose, induction +
  maintenance).
- **Surgical time** (kesi-kapama süresi).
- **Discharge instructions** (yazılı).

## Country Adapter (GB) Klinik Alanları

```typescript
// packages/contracts/src/clinical/uk.ts
export const kccScoreSchema = z.number().int().min(1).max(9);
export const rcvsNumberSchema = z.string().regex(/^\d{6,7}$/);
export const pomvCategorySchema = z.enum([
  "POM-V",
  "POM-VPS",
  "NFA-VPS",
  "SAES",
]);
```

## Saklama

- **Klinik kayıtlar:** hasta hayatı boyunca + en az 5
  yıl (RCVS önerisi).
- **İlaç kayıtları:** 5 yıl.
- **Mikroçip verisi:** hayat boyu.

## Audit (zaten var)

- `audit:examination.create`, `audit:examination.sign`.
- `audit:prescription.create` (yeni FAZ-15+).
- `audit:vaccination.create`.

## Testler

- `clinical-record.spec.ts` — SOAP + vital zorunluluk.
- `country-adapter-gb.spec.ts` — KCC + RCVS + POM-V
  doğrulama.

## Yapılmayanlar / Bilinçli Atlamalar

- **RCVS PSS akreditasyonu** → Faz 15+ (resmi başvuru).
- **Insurance integration (Petplan, Direct Line)** →
  Faz 15+ (UK pet insurance).
- **Controlled drugs register (FAZ-143 ayrı).**

## Commit

- Docs: (bu commit) — `docs(clinical): GOAL-142 GB klinik kayıt kuralları`
- Code: GB adapter Faz 14+.
