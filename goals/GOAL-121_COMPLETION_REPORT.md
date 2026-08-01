# GOAL-121 — Pilot Kabul Testleri (Completion Report)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet

Pilot veterinerle uygulanacak uçtan uca kabul testleri
planlandı. 10 senaryo; her biri için adımlar, kabul
kriterleri, süre hedefleri ve test kullanıcısı tanımlandı.

## Çıktılar

### Döküman (bu commit)

- `docs/operations/PILOT_ACCEPTANCE.md` — 10 senaryo +
  test şablonu + genel kabul kriterleri.

### Senaryolar (10)

1. Yeni müşteri/hayvan (staff, 90s, skor 3.5+)
2. Randevu (staff, 30s)
3. Muayene (vet, 15dk)
4. Aşı (vet, 60s)
5. Petshop satışı (staff, 90s)
6. Tahsilat (staff, 30s)
7. Ameliyat (vet, 30dk)
8. Yatış (vet, 20dk)
9. Laboratuvar (vet, 20dk)
10. Portal (owner, 5dk)

## Kabul Kriterleri (Genel)

- Tüm 10 senaryo ≥ 3.5/5 skor.
- Kritik hata (veri kaybı, tenant izolasyonu ihlali,
  audit eksikliği) **yok**.
- Tüm akışlar ≤ hedef süreler.

## Yapılmayanlar / Bilinçli Atlamalar

- **Gerçek pilot ortamı** → Faz 12+ (FAZ-12 kapsamında
  pilot tenant kurulumu + acceptance runbook).
- **Pilot veri şifreleme** → Faz 12+ (production data
  encryption at-rest).
- **Otomatik acceptance test (Cypress/Playwright)** →
  Faz 13+ (full e2e).

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- Manuel test (kabul testi çalıştırma); FAZ-12+ gerçek
  pilot ile.
- Otomatik e2e (Playwright) Faz 13+.

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-121 pilot kabul testleri`
