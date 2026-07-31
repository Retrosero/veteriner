# GOAL-111 — İş Akışı Kataloğu (Completion Report)

## Faz
FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet
Uygulamadaki 9 temel kullanıcı iş akışı adım adım
dokümante edildi: hasta sahibi ekleme, hayvan ekleme,
randevu oluşturma, muayene başlatma, aşı kaydı, petshop
satışı, tahsilat, yatış açma, laboratuvar sonucu.

## Çıktılar

### Workflow Kataloğu (`docs/workflows/`)
- **Mevcut:** `OVERVIEW.md` (üst düzey katalog).
- **Bu commit:** 9 yeni uçtan uca iş akışı dokümanı

  | # | Dosya | Kısa ad | Modül |
  |---|-------|---------|-------|
  | 1 | `owner_create.md` | owner-create | owner |
  | 2 | `patient_create.md` | patient-create | patient |
  | 3 | `appointment_create.md` | appointment-create | appointment |
  | 4 | `examination_start.md` | examination-start | examination |
  | 5 | `vaccination_record.md` | vaccination-record | vaccine |
  | 6 | `petshop_sale.md` | petshop-sale | petshop-sale |
  | 7 | `payment_collection.md` | payment-collection | payment |
  | 8 | `hospitalization_open.md` | hospitalization-open | hospitalization |
  | 9 | `lab_result_entry.md` | lab-result-entry | lab-result |

### Şablon (her workflow dosyası)
- **Kısa ad, modül, ilgili API, sayfa**
- **Amaç**
- **Aktör** (VETERINARIAN, STAFF, OWNER, vb.)
- **Tetikleyici**
- **Akış adımları** (1-N, UI + backend + audit)
- **Tenant izolasyonu**
- **Audit olayları**
- **Hata senaryoları tablosu** (senaryo → HTTP → VET-XXX-NNNN → çözüm)
- **İlgili dokümanlar** (API doc + COMPLETION_REPORT + permission)

### `OVERVIEW.md` güncelleme
- Yeni "Faz 11" bölümü eklendi.
- 9 workflow'un kısa ad + modül mapping'i verildi.

## İş Kuralları
- Her workflow, **en az 1 happy-path** + **en az 1 negative
  path** (hata senaryosu) içerir.
- Audit olayları `audit:<entity>.<action>` formatında
  (FAZ-0 standardı).
- Hata kodları `VET-<MODULE>-<NNN>` formatında
  (FAZ-4 standardı).
- Tenant izolasyonu her workflow'ta açıkça belirtilir.

## Yapılmayanlar / Bilinçli Atlamalar
- **Diyagramlar (sequence + state)** → FAZ-12+ (görsel
  diyagram ekleme).
- **Video walkthrough** → FAZ-12+ (pilot eğitim).
- **Diğer 7 FAZ akışı (toplam 16 klinik akışı)** → GOAL-001
  kapsamında `docs/domain/CLINICAL_FLOWS.md`'de tanımlı;
  burada sadece pilot için kritik 9'u seçildi.

## Döküman Uyum
- `pnpm docs:check` → temiz (workflow'lar özgü).
- `pnpm i18n:check` → temiz.

## Testler
- Workflow'lar için otomatik test yok (statik Markdown).
- FAZ-12+ kabul testleri bu dokümanlara göre yazılacak.

## Commit
- Docs: (bu commit) — `docs(workflows): GOAL-111 9 anahtar iş akışı kataloğu`
