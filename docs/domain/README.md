# Domain Dokümanları

Bu klasör, VetNiva'nın varlık/kavram tanımlarını, pilot kapsamını
ve uçtan uca iş akışlarını içerir. Sonraki tüm goal'lar
(GOAL-002+) bu dokümanları referans alır.

## Dosyalar

- [`DOMAIN_GLOSSARY.md`](./DOMAIN_GLOSSARY.md) — 18 varlık/kavram
  için tanım, ilişkiler, zorunlu alanlar, yaşam döngüsü ve
  silme/düzeltme kuralları.
- [`CLINICAL_FLOWS.md`](./CLINICAL_FLOWS.md) — pilot kapsamdaki
  16 uçtan uca iş akışı (randevu, muayene, aşı, reçete, ameliyat,
  yatış, lab, görüntüleme, transfer, petshop, stok, tahsilat,
  KVKK, amendment).
- [`PILOT_SCOPE.md`](./PILOT_SCOPE.md) — pilot kapsamı, MVP
  dışında bırakılan konular, kapsam güncelleme süreci.

## İlişkili dokümanlar

- `../fields/FIELD_GLOSSARY.md` — alan düzeyinde sözlük (alan
  adı, tip, kısıt). Bu klasördeki sözlük **varlık** düzeyindedir.
- `../workflows/OVERVIEW.md` — üst düzey akış kataloğu
  (fazlara göre gruplama).
- `../ai/AI_KNOWLEDGE_BASE.md` — AI asistanı için bu klasörün
  RAG chunk yapısı.
- `../../PROJECT_CONTEXT.md` — ürün vizyonu, ilkeler, faz
  durumu.

## Üretim sürümü

- **GOAL-001 (FAZ-0)** ile birlikte üretildi (2026-07-30).
- Sonraki goal'lar (GOAL-002+) bu dokümanları günceller;
  yeni varlık/akış eklenirse buraya eklenir.
