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
altyapı kurulmuştur. Kullanıcı eğitimi, Faz 1 (GOAL-001) ile birlikte
doldurulmaya başlanacaktır.

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
