# Kullanıcı Eğitimi — İndeks

Bu klasör, VetNiva'nın tüm kullanıcı kitleleri için Türkçe eğitim
içeriğini barındırır. Her rol için ayrı bir rehber bulunur.

## Hedef kitleler

- **İşletme sahibi (OWNER)** — `OWNER.md`
- **Veteriner hekim (VETERINARIAN)** — `VETERINARIAN.md`
- **Klinik personeli (STAFF)** — `STAFF.md`
- **Süper admin (SUPERADMIN)** — `SUPERADMIN.md`
- **Hasta sahibi (Portal)** — `PATIENT_OWNER.md`

## GOAL-000 kapsamı

Bu aşamada henüz kullanıcıya açık bir ekran yok. Yalnızca teknik
altyapı kurulmuştur. Kullanıcı eğitimi, Faz 1 (GOAL-001+) ile birlikte
doldurulmaya başlanacaktır.

## GOAL-001 — Domain sözlüğü ve pilot iş akışları (Faz 0 devamı)

GOAL-001 ile birlikte **kullanıcı eğitim içeriğinin temeli** atıldı:

- [`docs/domain/DOMAIN_GLOSSARY.md`](../domain/DOMAIN_GLOSSARY.md) —
  18 varlık/kavram (hasta sahibi, hayvan, randevu, muayene, SOAP,
  aşı, reçete, ameliyat, anestezi, yatış, lab, görüntüleme, petshop,
  stok, satış, tahsilat, portal). Her birinin tanımı, ilişkileri,
  zorunlu alanları, yaşam döngüsü ve silme/düzeltme kuralları var.
  Bu sözlük, rol bazlı kullanıcı eğitimlerinin **kavramsal temelini**
  oluşturur.
- [`docs/domain/CLINICAL_FLOWS.md`](../domain/CLINICAL_FLOWS.md) —
  pilot kapsamdaki 16 uçtan uca iş akışı. Bunlar, rol bazlı
  eğitimlerdeki "görev" tanımlarının kaynağı olur.

GOAL-001 sonunda henüz rol-bazlı rehberler
(`OWNER.md`, `VETERINARIAN.md` vb.) doldurulmadı; bu rehberler
Faz 2+ sırasında, ilgili UI sayfaları uygulandıkça doldurulacaktır.

## GOAL-002 — Rol/yetki matrisi (Faz 0 devamı)

GOAL-002 ile birlikte **kullanıcı eğitiminin yetki temeli** atıldı:

- [`docs/permissions/PERMISSION_CATALOG.yaml`](../permissions/PERMISSION_CATALOG.yaml) —
  **makinece okunabilir** yetki kataloğu. 113 permission, 5 rol, 28
  modül. CI kapısı `pnpm docs:check` bunu referans alır.
- [`docs/permissions/PERMISSION_MATRIX.md`](../permissions/PERMISSION_MATRIX.md) —
  **insan okunabilir** modül bazlı tablolar. "Bu işlemi kim
  yapabilir?" sorularının kaynağı.
- [`docs/permissions/ROLE_DESCRIPTIONS.md`](../permissions/ROLE_DESCRIPTIONS.md) —
  5 rol için detaylı sorumluluk açıklamaları, kapsam dışı
  durumlar, tipik senaryolar. Rol bazlı kullanıcı eğitimlerinin
  **yetki temelini** oluşturur.

GOAL-002 sonunda henüz rol-bazlı rehberler doldurulmadı, ancak
her rolün sorumluluk haritası bu dokümanla kesinleşti. Rehberler
Faz 2+ sırasında, ilgili UI sayfaları uygulandıkça
`{ROL}.md` dosyaları olarak eklenecek.

## GOAL-003 — Çoklu dil + ülke adaptörü sözleşmesi (Faz 0 devamı)

GOAL-003 ile birlikte **kullanıcı eğitiminin i18n temeli** atıldı:

- [`docs/i18n/I18N_CONTRACT.md`](../i18n/I18N_CONTRACT.md) —
  çoklu dil sözleşmesi. Locale yapısı, çeviri anahtarı formatı,
  formatlama (tarih/saat/para/sayı), pluralization, yeni
  çeviri ekleme süreci.
- [`docs/i18n/COUNTRY_ADAPTER_CONTRACT.md`](../i18n/COUNTRY_ADAPTER_CONTRACT.md) —
  ülke adaptörü sözleşmesi. TR için tam, GB için iskelet
  implementasyon. Para, telefon, vergi (VKN/TCKN), KDV,
  fiş/reçete formatı, bildirim kuralları (KVKK).
- `apps/api/src/common/adapters/` — adapter kodu (interface +
  TR tam + GB iskelet + registry + testler).
- `packages/i18n/src/locales/{tr-TR,en-GB}.json` — genişletilmiş
  çeviri dosyaları (yeni: role, permission, error, country,
  currency, a11y).

GOAL-003 sonunda çeviriler yeni kavramları (role, permission,
error) içeriyor. Rol bazlı rehberler (`{ROL}.md`) Faz 2+
sırasında, çevirilerden yararlanarak yazılacak. Ülke adaptörü
sayesinde rehberler TR ve GB için aynı yapıda, farklı
iş kurallarıyla oluşturulabilir.

## GOAL-004 — Audit, log ve hata kodu standardı (Faz 0 devamı)

GOAL-004 ile birlikte **kullanıcı eğitiminin hata ve audit temeli**
atıldı. Bu dokümanlar kullanıcıya dönük "hata mesajlarının
anlamı" ve "audit trail'in ne olduğu" sorularını yanıtlar:

- [`docs/errors/ERROR_CODE_STANDARD.md`](../errors/ERROR_CODE_STANDARD.md) —
  `VET-<MODULE>-<NNN>` formatındaki hata kodu standardı. Tüm
  hata kodları bu kataloğa uygun yazılır; format, modül listesi,
  HTTP eşlemesi ve severity seviyeleri.
- [`docs/errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md) —
  hata kodlarının tam listesi (kod → mesaj → çözüm). Tüm
  kullanıcı-odaklı hata mesajları için tek kaynak.
- [`docs/errors/AUDIT_LOG_STANDARD.md`](../errors/AUDIT_LOG_STANDARD.md) —
  audit log sözleşmesi. "Bu kaydı kim, ne zaman değiştirdi?"
  sorusunu yanıtlar. 7 yıl retention, append-only.
- [`docs/errors/AUDIT_EVENTS.yaml`](../errors/AUDIT_EVENTS.yaml) —
  audit event kataloğu. UI'daki her kritik aksiyon bir
  audit event oluşturur (örn. `audit:owner.erase`, `audit:vaccination.create`).
- [`docs/errors/LOG_STANDARD.md`](../errors/LOG_STANDARD.md) —
  sistem log formatı (geliştirici odaklı; kullanıcı eğitiminde
  doğrudan yer almaz, ancak destek ekibinin "log nasıl okunur?"
  sorusuna temel oluşturur).
- [`docs/errors/CORRELATION_ID.md`](../errors/CORRELATION_ID.md) —
  destek ekibinin "Hata kodu: req-7c9e..." üzerinden kullanıcının
  talebini izleyebilmesi için temel. **Kullanıcı eğitimlerinde
  mutlaka yer almalı**: "Hata aldığınızda bize bu kodu verin".
- [`docs/errors/PII_MASKING.md`](../errors/PII_MASKING.md) —
  KVKK / UK GDPR uyumu. Kullanıcılara "kişisel verileriniz
  loglarda nasıl korunuyor" sorusuna cevap.

GOAL-004 sonunda rol-bazlı rehberlerin "Hata Durumunda" bölümleri,
ERROR_CATALOG'dan doğrudan referans alabilir. Her hata kodu
`{kod} → {mesaj} → {çözüm}` üçlüsü ile eğitim içeriğine
eklenebilir. Audit trail'in varlığı, OWNER ve SUPERADMIN
rehberlerinde "Güvenlik ve Uyum" bölümlerine temel olur.

## Eğitim doldurma zamanlaması

- **Faz 2 (GOAL-020+):** Hasta sahibi ve hayvan kaydı → `STAFF.md`,
  `VETERINARIAN.md` ve `PATIENT_OWNER.md` ilk bölümleri.
- **Faz 3 (GOAL-030+):** Randevu ve portal → `STAFF.md` (kabul),
  `PATIENT_OWNER.md` (portal kullanımı).
- **Faz 4 (GOAL-040+):** Muayene, aşı, reçete, ameliyat, yatış
  → `VETERINARIAN.md` detaylı anlatımı.
- **Faz 5-7 (GOAL-050+):** Aşı, stok, petshop, finans → `OWNER.md`
  ve `STAFF.md` genişletilmesi.
- **Faz 11:** AI asistanı + self-serve help → tüm rehberler AI
  chunk'ları olarak RAG'a yüklenir.

## İçerik formatı

Her rehber aşağıdaki yapıyı takip eder:

```markdown
# {Rol adı} — VetNiva Kullanım Kılavuzu

## Hoş geldiniz

...

## Görevler

### {Görev adı}

**Amaç:** ...
**Ön koşul:** ...
**Adımlar:**

1. ...
2. ...
   **Beklenen sonuç:** ...
   **Hata durumunda:** ...

## Sık sorulan sorular

- ...

## Destek

- E-posta: destek@vetniva.local
- Telefon: ...
```

## Erişilebilirlik

- Tüm yönlendirmeler klavye kısayolları ile yapılabilir olmalı.
- Renk körü modu için ek kontrast seçenekleri Faz 11'de eklenecektir.
- Ekran okuyucu desteği: aria-label, semantic HTML.

## Yerelleştirme

- Varsayılan dil: Türkçe (`tr-TR`).
- İngilizce (`en-GB`) iskelet: `packages/i18n/src/locales/en-GB.json`.
- Faz 14'te İngiltere pazarına açılırken İngilizce içerik doldurulacak.
