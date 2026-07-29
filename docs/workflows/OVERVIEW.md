# İş Akışı Kataloğu — Genel Bakış

Bu klasör, VetNiva'nın tüm anahtar iş akışlarını içerir. Her akış;
adımlar, roller, tenant bağlamı, audit event'leri ve uç durum senaryoları
ile birlikte tanımlanır.

## Faz 0 (GOAL-000) — Altyapı

Henüz kullanıcıya açık akış yok. Yalnızca **sistem sağlık kontrolü**
akışı tanımlıdır (aşağıda).

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

## Faz 1 (GOAL-001) — Tenant, şube, kullanıcı, RBAC

Aşağıdaki akışlar GOAL-001'de eklenecek:

- Tenant oluşturma
- Şube oluşturma
- Kullanıcı davet etme
- Rol ve izin atama
- Oturum açma (login)
- Tenant değiştirme (çoklu tenant'lı kullanıcılar için)

## Faz 2 (GOAL-002) — Hasta sahibi ve hayvan

- Hasta sahibi kaydı oluşturma
- Hayvan kaydı oluşturma (kedi/köpek/kuş)
- Sahiplik geçişi
- Mikroçip doğrulama
- Hayvan zaman çizelgesi görüntüleme

## Faz 3 (GOAL-003) — Aşı

- Aşı kaydı oluşturma
- Stok düşümü (transaction)
- Tekrar tarihi hatırlatma planlama
- Hatalı kaydı amendment ile düzeltme
- Portal aşı kartı görüntüleme

## Akış şablonu

Yeni bir akış eklemek için aşağıdaki yapı kullanılır:

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

**İlgili sayfalar:**

- `docs/pages/...`

**İlgili API'ler:**

- `METHOD /api/v1/...`
```
