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
