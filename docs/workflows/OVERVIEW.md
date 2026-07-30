# İş Akışı Kataloğu — Genel Bakış

Bu klasör, VetNiva'nın tüm anahtar iş akışlarını içerir. Her akış;
adımlar, roller, tenant bağlamı, audit event'leri ve uç durum senaryoları
ile birlikte tanımlanır.

**Uçtan uca iş akışları** (pilot kapsamda gerçek çalışan akışlar)
`docs/domain/CLINICAL_FLOWS.md` dosyasında tanımlıdır. Bu dosya
yalnızca üst düzey katalog görevi görür.

## Faz 0 (GOAL-000) — Altyapı

Yalnızca **sistem sağlık kontrolü** akışı tanımlıdır (aşağıda).

### Sistem sağlık kontrolü (Liveness/Readiness)

**Amaç:** API'nin ve bağımlılıklarının çalışır durumda olduğunu
doğrulamak.

**Aktör:** Sistem (orchestrator, monitor, CI).

**Akış:**

1. İstemci `GET /api/v1/health` (liveness) çağırır.
2. API süreç durumunu kontrol eder; `LivenessResponse` döner.
3. İstemci `GET /api/v1/ready` (readiness) çağırır.
4. API veritabanı bağlantısını test eder (`SELECT 1`).
5. Sonuç: `ok` (200), `degraded` (200, latency yüksek) veya `down` (503).

**Tenant bağlamı:** Yok (sistem akışı).

**Yetki:** Public.

**Audit:** Akış audit üretmez; hata durumunda `ERROR` log.

**Hata senaryoları:**

- DB erişilemez: `down` (503), `correlation_id` döner.
- Process yüklü ama thread starved: liveness `ok`, readiness `degraded`.

## Faz 0 (GOAL-001) — Domain sözlüğü ve iş akışları

**Bu fazda kod yazılmadı.** Sadece doküman üretildi:

- `docs/domain/DOMAIN_GLOSSARY.md` — 18 varlık/kavram için
  tanım, ilişkiler, zorunlu alanlar, yaşam döngüsü, silme/düzeltme
  kuralları.
- `docs/domain/CLINICAL_FLOWS.md` — pilot kapsamdaki 16 uçtan
  uca iş akışı (randevu, muayene, aşı, reçete, ameliyat, yatış,
  lab, görüntüleme, transfer, petshop satış, stok giriş, tahsilat,
  KVKK, amendment).
- `docs/domain/PILOT_SCOPE.md` — pilot kapsamı, MVP dışı
  bırakılan konular, karar kriterleri.

Bu dokümanlar sonraki tüm goal'ların (GOAL-002+) ortak ürün
sözleşmesi görevi görür.

## Faz 1 (GOAL-010+) — Tenant, şube, kullanıcı, RBAC

Aşağıdaki akışlar Faz 1'de kodlanacak ve `docs/domain/CLINICAL_FLOWS.md`'ye
eklenecek:

- Tenant oluşturma
- Şube oluşturma
- Kullanıcı davet etme
- Rol ve izin atama
- Oturum açma (login)
- Tenant değiştirme (çoklu tenant'lı kullanıcılar için)
- KVKK silme talebi (GOAL-001'de tanımlı, Faz 1'de implemente)
- Cross-tenant erişim engelleme (Faz 1 RLS + Guard)

## Faz 2 (GOAL-020+) — Hasta sahibi ve hayvan

`docs/domain/CLINICAL_FLOWS.md`'de detaylı:

- Yeni hasta sahibi ve hayvan kaydı (Akış 1)
- Portal üzerinden randevu talebi (Akış 2)
- Sahiplik devri (Akış 11)
- Hayvan zaman çizelgesi

## Faz 3 (GOAL-030+) — Randevu ve portal

- Klinik randevusu / resepsiyon (Akış 3)
- Bekleme listesi
- Portal kayıt/giriş
- Portal hayvan listesi
- Randevu hatırlatma (Faz 8 ile birlikte)

## Faz 4 (GOAL-040+) — Muayene ve klinik kayıt

`docs/domain/CLINICAL_FLOWS.md`'de detaylı:

- Muayene akışı (Akış 4) — SOAP, teşhis, tedavi
- Reçete yazımı (Akış 6)
- Ameliyat (Akış 7)
- Yatış (Akış 8)
- Laboratuvar (Akış 9)
- Görüntüleme (Akış 10)
- Klinik kayıt versiyonlama + amendment (Akış 16)

## Faz 5 (GOAL-050+) — Aşı

- Aşı ürün/protokol tanımı
- Hayvana aşı uygulaması ve stok düşümü (Akış 5)
- Lot/SKT/doz takibi
- Aşı kartı
- Tekrar tarihi hatırlatma job'u
- Portal aşı görünümü
- Hatalı kaydı amendment (Akış 16)

## Faz 6 (GOAL-060+) — Stok ve petshop

- Ürün ve hizmet kartları
- Barkod
- Depo/raf/lot/SKT
- Stok giriş (tedarik) (Akış 13)
- Petshop POS satış (Akış 12)
- Müşteri sadakati ve kampanya (MVP dışı)

## Faz 7 (GOAL-070+) — Finans

- Satış taslağı, kesinleştirme, iade
- Tahsilat ve kasa kapanışı (Akış 14)
- Temel finans raporları
- Müşteri borç/alacak görünümü

## Faz 8 (GOAL-080+) — Ameliyat, anestezi, yatış

- Ameliyat planlama (Akış 7)
- Anestezi takibi
- Yatış kabul ve taburcu (Akış 8)
- Gözlem ve taburcu özeti

## Faz 9-13 (GOAL-090+)

Lab, görüntüleme, superadmin, notification, dosya servisi, vb.

## Akış şablonu

Yeni bir akış eklemek için `docs/domain/CLINICAL_FLOWS.md` dosyasındaki
şablonu kullanın. Tüm akışlar orada toplanır; bu dosya yalnızca
fazlara göre üst düzey gruplama sağlar.

```markdown
# {Akış adı}

**Amaç:** ...

**Aktör:** ...

**Ön koşullar:** ...

**Adımlar:**

1. ...
2. ...

**Tenant bağlamı:** ...

**Yetki:** ...

**Audit event'leri:**

- `audit:{action}` — açıklama

**Hata senaryoları:**

- {kod} — {senaryo} → {çözüm}

**İlgili sayfalar:** ...

**İlgili API'ler:** ...
```
