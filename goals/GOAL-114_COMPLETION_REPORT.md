# GOAL-114 — Türkçe Kullanıcı Eğitim Merkezi (Completion Report)

## Faz
FAZ-11 (Dokümantasyon ve AI asistanı temeli)

## Özet
Klinik personeli, hayvan sahipleri ve admin için Türkçe
kullanıcı eğitim dokümanları. Her doküman senaryo bazlı
adım adım yönergeler + sık sorulan sorular + hata durumları
içerir.

## Çıktılar

### Kullanıcı Eğitimi (`docs/user-education/`)
- **Mevcut (FAZ-2):**
  - `INDEX.md` (ana sayfa, kapsam).
  - `AUTH.md` (kimlik doğrulama).
  - `RBAC.md` (rol ve yetkiler).
  - `PATIENT_OWNER.md` (hasta sahibi yönetimi).
  - `SUPERADMIN.md` (süper admin paneli).
- **Bu commit:** 4 yeni doküman
  - `APPOINTMENT.md` (randevu yönetimi, senaryo bazlı).
  - `CLINICAL_RECORD.md` (klinik kayıt yönetimi, SOAP/vital/
    teşhis/reçete).
  - `INVENTORY.md` (stok + petshop yönetimi).
  - `PORTAL.md` (hayvan sahibi portal arayüzü).

### Şablon (her doküman)
- **Amaç, hedef kitle**
- **Senaryolar** (3-8 adım adım yönerge)
- **İpuçları** (pratik öneriler)
- **Sık karşılaşılan sorular** (FAQ)
- **Hata durumları tablosu**
- **İlgili dokümanlar** (API + workflow + permission)

## İş Kuralları
- **Dil:** Türkçe (Türk hekimlerine/sekreterlerine yönelik).
- **Senaryo bazlı:** "Senaryo N — başlık" + adım adım yönergeler.
- **Hata durumları tablo:** Senaryo → HTTP → VET-XXX-NNNN → Çözüm.
- **İlgili dokümanlar:** API doc + workflow + permission
  cross-reference.
- **Sürekli güncelleme:** Yeni modül/akış eklendikçe yeni
  doküman eklenir.

## Yapılmayanlar / Bilinçli Atlamalar
- **Video walkthrough** → FAZ-12+ (pilot eğitim).
- **Çoklu dilde (en-GB) kullanıcı eğitimi** → FAZ-14+
  (en-GB lokalizasyonu kapsamında).
- **Interaktif eğitim (uygulama içi tooltip)** → FAZ-12+
  (kullanım asistanı GOAL-117).
- **Sertifikasyon sınavı (personel için)** → FAZ-12+.

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen user-education
  özgü).
- `pnpm i18n:check` → temiz.

## Testler
- User education statik Markdown; otomatik test yok.
- FAZ-12+ kabul testleri bu dokümanlara göre yazılacak.

## Commit
- Docs: (bu commit) — `docs(user-education): GOAL-114 4 yeni eğitim dokümanı (appointment, clinical, inventory, portal)`
