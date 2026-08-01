# GOAL-145 — UK GDPR Şartları (Completion Report)

## Faz

FAZ-14 (İngiltere ülke paketi)

## Özet

UK GDPR + DPA 2018 uyumluluğu. KVKK ile karşılaştırma,
ICO kaydı, veri sahibi hakları.

## Çıktılar

### Döküman (bu commit)

- `docs/security/UK_GDPR.md` — UK GDPR + DPA 2018
  yasal dayanak, KVKK vs UK GDPR farkları, veri sahibi
  hakları (8), ICO kaydı (£40/yıl), KVKK erasure ile
  karşılaştırma (28 vs 30 gün), uyum adımları, audit.

### KVKK vs UK GDPR

| Alan            | KVKK              | UK GDPR            |
| --------------- | ----------------- | ------------------ |
| Otorite         | KVKK Kurulu       | ICO                |
| Yasal dayanak   | Açık rıza (genel) | Meşru menfaat (LI) |
| Kayıt           | VERBİS            | ICO register       |
| Erasure süresi  | 30 gün            | 28 gün             |
| Çapraz transfer | Kurul onayı       | Adequacy           |

### Veri Sahibi Hakları (8)

1. Bilgilendirme.
2. Erişim.
3. Düzeltme.
4. Silme (right to be forgotten).
5. Kısıtlama.
6. Taşınabilirlik (FAZ-125).
7. İtiraz.
8. Otomatik karar.

## İş Kuralları

- **Audit:** `audit:gdpr.data_access/export/erasure/
consent_change`.
- **Privacy notice:** UI + PDF.
- **Cookie banner:** UK PECR uyumlu.
- **ICO register:** pilot başlangıcında self-registration.
- **DPA (Data Processing Agreement):** tenant'larla.

## Yapılmayanlar / Bilinçli Atlamalar

- **ICO register self-registration** → Faz 14+
  (pilot başlangıcında).
- **DPO atama** → Faz 15+.
- **DPIA otomasyonu** → Faz 15+.

## Döküman Uyum

- `pnpm docs:check` → temiz.

## Commit

- Docs: (bu commit) — `docs(security): GOAL-145 UK GDPR şartları dokümanı`
- Code: `gdpr.erasure` modülü (FAZ-126 `kvkk.service.ts` ile
  paylaşımlı).
