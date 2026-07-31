# GOAL-143 — Controlled Drug Register (Completion Report)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Özet
Misuse of Drugs Regulations 2001 + RCVS gereği kontrollü
ilaç kayıt sistemi. Schedule 1-5, çelik dolap saklama,
defter (bound) kayıt.

## Çıktılar

### Döküman (bu commit)
- `docs/clinical/CONTROLLED_DRUGS.md` — yasal dayanak,
  Schedule sınıflandırması, register format (reg 19),
  API endpoint'leri (7), iş kuralları, saklama
  gereksinimleri, audit.

### Schedule Sınıflandırması
| Schedule | Saklama |
|----------|---------|
| S2 (morfin, petidin) | çelik dolap + double lock |
| S3 (buprenorfin) | çelik dolap |
| S4 (diazepam) | kilitli dolap |
| S5 (düşük kodein) | kilitli dolap |

### Register Format (Reg 19)
| Tarih | İlaç | Miktar alınan | Miktar kullanılan | Miktar kalan | Hasta | Hayvan | Vet | Veren | Notlar |

### Endpoint'ler (planlanan)
- POST/GET `/api/v1/cd/register`
- GET `/api/v1/cd/stock`
- POST `/api/v1/cd/receipts|dispensings|wastages`
- POST `/api/v1/cd/stock-count`

## İş Kuralları
- **Düzeltme:** mevcut kayıt üzeri çizilir + tarih + imza.
- **Silme:** YASAK.
- **Saklama:** Register 2 yıl; stok kayıtları 5 yıl.
- **Çelik dolap:** S2-S3 için double lock (anahtar 2
  ayrı kişide).
- **Yıllık stok sayımı:** 1 Ocak'ta 2 kişi imza.

## Yapılmayan / Bilinçli Atlamalar
- **Electronic CD register (Home Office onaylı)** →
  Faz 15+ (UK pilot için 2 yıl kağıt zorunlu).
- **Drug destruction lisansı** → Faz 15+.

## Döküman Uyum
- `pnpm docs:check` → temiz.

## Commit
- Docs: (bu commit) — `docs(clinical): GOAL-143 controlled drug register dokümanı`
- Code: Faz 14+ (`cd-register` modülü).
