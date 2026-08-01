# Controlled Drug Register (GOAL-143)

## Faz

FAZ-14 (İngiltere ülke paketi)

## Amaç

İngiltere'de kontrollü ilaçların (Schedule 1-5) yasal
kayıt sistemi. Misuse of Drugs Regulations 2001 + RCVS
gereksinimleri.

## Yasal Dayanak

- **Misuse of Drugs Act 1971.**
- **Misuse of Drugs Regulations 2001.**
- **Veterinary Medicines Regulations 2013.**
- **RCVS Controlled Drugs Guidance.**

## Schedule Sınıflandırması

| Schedule       | Örnekler                             | Saklama                   | Reçete    |
| -------------- | ------------------------------------ | ------------------------- | --------- |
| **Schedule 1** | LSD, ecstasy                         | yok (araştırma)           | —         |
| **Schedule 2** | Morfin, petidin, fentanil, oksikodon | çelik dolap + double lock | özel form |
| **Schedule 3** | Buprenorfin, pentobarbital           | çelik dolap               | özel form |
| **Schedule 4** | Diazepam, midazolam, androjenler     | kilitli dolap             | normal    |
| **Schedule 5** | Düşük doz morfin (≤0.2%), kodein     | kilitli dolap             | normal    |

## Register Format (Misuse of Drugs Reg. 19)

| Tarih | İlaç + form | Miktar (alınan) | Miktar (kullanılan) | Miktar (kalan) | Hasta sahibi | Hayvan adı + tür | Reçete eden vet | Veren kişi | Notlar |
| ----- | ----------- | --------------- | ------------------- | -------------- | ------------ | ---------------- | --------------- | ---------- | ------ |

### Defter Özellikleri

- **Ciltli (bound):** yapıştırma yasak; sayfa koparma
  yasak.
- **Mürekkepli:** kurşun kalem kullanılamaz.
- **Sıralı:** son kayıt en altta; araya ekleme yok.
- **Düzeltme:** mevcut kayıt üzeri çizilir, tarih + imza;
  silme yok.

## API Endpoint'leri

| #   | Method | Path                     | Yetki                        |
| --- | ------ | ------------------------ | ---------------------------- |
| 1   | POST   | `/api/v1/cd/register`    | `clinic:prescription:create` |
| 2   | GET    | `/api/v1/cd/register`    | `clinic:prescription:read`   |
| 3   | GET    | `/api/v1/cd/stock`       | `clinic:prescription:read`   |
| 4   | POST   | `/api/v1/cd/receipts`    | `clinic:prescription:create` |
| 5   | POST   | `/api/v1/cd/dispensings` | `clinic:prescription:create` |
| 6   | POST   | `/api/v1/cd/wastages`    | `clinic:prescription:create` |
| 7   | POST   | `/api/v1/cd/stock-count` | `clinic:stock:adjust`        |

## Uygulama Durumu

- API controller, sözleşme doğrulaması, yetki kontrolü ve append-only iş
  kuralları uygulanmıştır.
- `controlled_drug_entries` Prisma modeli ve migration'ı tenant RLS, branch
  tenant tutarlılığı, numeric miktarlar ve DB seviyesinde UPDATE/DELETE
  engeli içerir.
- Repository Prisma ile asenkron çalışır; RLS bağlamı her sorgu transaction'ında
  kurulur. Transfer out/in satırları tek transaction içinde yazılır.
- Correction satırı stok toplamında ters hareket olarak sayılır. Bir orijinal
  satır için yalnız bir correction oluşturulabilir; bu kural servis ön kontrolü
  yanında PostgreSQL kısmi unique index ve trigger ile zorunludur.
- Bellek içi adapter yalnızca PrismaService verilmeyen izole unit testler içindir.

## İş Kuralları

### Kayıt (Register)

- Her kullanımda entry oluşturulur.
- Birim: mg veya ml (precise).
- Aynı gün + aynı hasta + aynı ilaç → tek entry.
- **Yasak:** silme, düzeltme (sadece çizme + imza).

### Stok (Stock)

- `incoming`: dışarıdan alınan (üretici, toptancı).
- `outgoing`: kullanılan veya imha edilen.
- `current`: in - out + adjustments.
- `adjustments`: fire, kayıp (2 kişi imza zorunlu).

### Saklama

- **Schedule 2-3:** çelik dolap + double lock (anahtar
  2 ayrı kişide).
- **Schedule 4-5:** kilitli dolap.
- **Stok kaydı:** her alım + kullanım + imha için
  audit eventi.
- **2 yıl saklama** (register); stok kayıtları 5 yıl.

### Audit

- `audit:cd.register_entry_created` (info).
- `audit:cd.stock_received` (info).
- `audit:cd.dispensed` (info).
- `audit:cd.wasted` (warning; 2 imza).
- `audit:cd.stock_count` (info; yıllık).

## GB Adapter

```typescript
// packages/contracts/src/clinical/uk-controlled-drugs.ts
export const cdScheduleSchema = z.enum(["S1", "S2", "S3", "S4", "S5"]);
export const cdEntryTypeSchema = z.enum([
  "received",
  "dispensed",
  "wasted",
  "returned",
  "transferred",
]);
```

## Stok Sayımı

- **Yıllık:** 1 Ocak'ta fiziksel sayım.
- 2 kişi imza (veteriner + hemşire).
- `audit:cd.stock_count` event'i.

## İmha (Wastage)

- Bozuk, süresi geçmiş, geri çekilen.
- **Denature:** 2 kişi imza; fotoğraf.
- **İade (S2-S3):** üreticiye veya toptancıya.
- **İmha:** atık firması + sertifika.

## Testler

- `controlled-drugs.spec.ts` — register entries,
  cumulative balance, double signature.
- Audit: her aksiyon audit'lenir.

## Yapılmayanlar / Bilinçli Atlamalar

- **Electronic CD register (Home Office onaylı)** →
  Faz 15+ (UK pilot için 2 yıl kağıt zorunlu; sonra
  elektronik onay).
- **Drug destruction lisansı** → Faz 15+ (çift imza +
  atık firması sözleşmesi).
- **Defter export (PDF)** → Faz 15+ (regülasyon gereği
  imzalı PDF).

## Commit

- Docs: (bu commit) — `docs(clinical): GOAL-143 controlled drug register dokümanı`
- Code: Faz 14+ (TR `clinic-sales` + GB `cd-register` modülü).
