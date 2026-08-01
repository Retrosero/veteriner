# VetNiva Uygulama Yol Haritası

> 1 Agustos 2026 re-baseline tamamlandi: Node 20 ile kok kalite kapilari
> `lint`, `type-check`, `test`, `build`, `docs:check`, `i18n:check` ve
> `format:check` basarili. `pnpm test`, Turbo eszamanlilik siniriyle tekrar
> calistirilabilir hale getirildi (API: 1.499 passed, 7 bilincli skip).
> GOAL-017 runtime RLS sertlestirmesi tamamlandi: migrator ile uygulama
> rolleri ayrildi, uygulama rolu superuser/BYPASSRLS degil ve non-superuser
> iki-tenant PostgreSQL E2E kapsami 10/10 gecti. Controlled Drugs kayitlarinda
> correction stok bakiyesine yansir; ayni kayda ikinci correction DB unique
> indexi ve trigger ile engellenir. Temiz izole veritabaninda tum root smoke
> kapsami 19/19 basarili.
>
> 1 Agustos 2026 CI kaniti: `main` uzerindeki GitHub Actions run
> `30709275922`, temiz Linux runner'da install/cache, lint, type-check, unit,
> build, docs/i18n ve PostgreSQL runtime-role/migration/HTTP smoke E2E
> kapilarinin tamamini basariyla gecmistir. Pilot kabul, performans,
> guvenlik, backup/restore ve harici saglayici/kurum entegrasyonlari yine de
> gercek ortam erisimi olmadan tamamlanmis sayilmaz.

> 1 Agustos 2026 RBAC katalog temizligi: runtime permission sozlesmesinde
> olmayan 19 eski FAZ-11 stub katalogdan kaldirildi. YAML katalog ve
> TypeScript `PERMISSIONS` listesi 192 anahtarda bire bir eslesir; bunu
> zorunlu kilan unit test eklendi. API lint/type-check, docs:check ve format
> denetimi basarili.

> 1 Agustos 2026 hata standardi temizligi: istemci ag hatasi ve hata olaylari
> varsayimlari `TR_COMMON_0001` / `TR_FE_0001` yerine katalogdaki
> `VET-COMMON-0001` koduna tasindi. API hata olaylari (111) ve web hata
> entegrasyonu/saglik testleri (14) basarili; docs denetiminde eski kod referansi
> sifirlandi ve i18n parity korundu.

> 1 Agustos 2026 dosya guvenligi sertlestirmesi: S3 adapteri gercek SDK ile
> upload/checksum/SSE, metadata, presigned URL, health check ve archive prefix
> tasimasini yapar. ClamAV adapteri `clamd` INSTREAM ve PING/PONG protokolunu
> TCP veya Unix socket uzerinden uygular. Production, S3 ve ClamAV olmadan
> fail-fast baslamaz; scan `error` durumundaki dosyaya signed URL verilmez.
> Dort modul/adapter dosyasi uzerinde 34 test, API lint/type-check ve
> docs:check (0 hata) basarili.

> 1 Agustos 2026 aktif dosya modulu birlestirmesi: AppModule ve Timeline
> artik eski fail-open `FilesModule` yerine sertlestirilmis `FileModule`
> kullanir. Timeline dosya olaylari in-memory snapshot yerine tenant-scoped
> `FileService.list` ile okunur. Timeline, dosya ve modul testleri (34), API
> lint/type-check basarili.

> 1 Agustos 2026 guncellemesi: Reports modulundeki kullanilmayan OpenAPI ve
> test sembolleri kaldirildi. CSV exportu bilinmeyen degerleri acik
> primitive/JSON normalizasyonundan geciriyor. Modul lintinde hata kalmadi
> (yalnizca mevcut security eklentisi uyarisi); 8 test ve API tip kontrolu gecti.
>
> 1 Agustos 2026 guncellemesi: Patients modulu mock audit verisini somut
> `AuditEventInput` tipiyle topluyor; controller kontrat tipleri statik import
> olarak duzenlendi. Modul lint hatasiz, 26 test ve API tip kontrolu gecti.
>
> 1 Agustos 2026 guncellemesi: Customer-balances sabit nokta decimal
> yardimcilarinin Turkce JSDoc aciklamalari tamamlandi. Modul lint hatasiz;
> 6 test ve API tip kontrolu gecti. API lint hatasi 96'dan 76'ya indi.
>
> 1 Agustos 2026 guncellemesi: Superadmin Prisma test mocku somut `where.id`
> parametresiyle tiplenerek `any` sizintisindan arindirildi. Vitest asymmetric
> matcher istisnasi yalnizca assertion satirinda gerekcelendirildi. 8 test,
> modul lint ve API tip kontrolu gecti; API lint hatasi 71'e indi.
>
> 1 Agustos 2026 guncellemesi: Diagnoses testindeki kullanilmayan sozlesme
> sembolu kaldirildi; uc Vitest asymmetric matcher `any` siniri test-only ve
> gerekceli olarak daraltildi. 14 test ve API tip kontrolu gecti; modülde hata
> kalmadi (bir mevcut security eklentisi uyarisi var).
>
> 1 Agustos 2026 guncellemesi: Portal-auth genel login hatasi yolunda
> `throw failGeneric()` yerine kontrol akisini dogru ifade eden `return
failGeneric()` kullanildi. Logout/guard cookie siniri `any` yerine `unknown`
> ve string dogrulamasiyla guvenli hale getirildi. Modul lint ve API tip
> kontrolu gecti; ilgili servis paketi 24 testi basariyla calistirdi.
>
> 1 Agustos 2026 guncellemesi: Petshop-sales servisinden kullanilmayan iki
> sozlesme tipi temizlendi; decimal yardimcisi sonraki finansal refactor icin
> ayri olarak izlemeye alindi.
> 14 test ve API tip kontrolu gecti; modülde lint hatasi yok (bir mevcut regex
> security eklentisi uyarisi var). Genel API lint hatasi 60'tan 57'ye indi.
>
> 1 Agustos 2026 guncellemesi: Onboarding testinden kullanilmayan OWNER,
> portal ve superadmin actor fixture'lari kaldirildi. 24 test, hedef lint ve
> API tip kontrolu gecti.
>
> 1 Agustos 2026 guncellemesi: KVKK erisim baglami JSDoc aciklamasi
> tamamlandi; onboarding, vaccine-card, alerts ve discharge-summaries
> dosyalarindaki kullanilmayan tip/importlar kaldirildi. Hedef lint ve API
> tip kontrolu gecti; onboardingde yalnizca mevcut security eklentisi uyarisi
> kaldi.
>
> 1 Agustos 2026 guncellemesi: Harici ve cihaz lab adapterlari ile
> lab-adapters servisinde bilinmeyen payload degerleri kontrollu primitive
> metin donusumune alindi; nesnelerin kazara `[object Object]` olarak
> islenmesi engellendi. 29 test (1 bilincli skip), hedef lint ve API tip
> kontrolu gecti.
>
> 1 Agustos 2026 guncellemesi: Seed CLI dogrudan process sonlandirmak yerine
> exitCode ayarlayacak sekilde duzenlendi; SOAP bos interface'i type alias'a
> cevrildi ve timeline actor tipi statik import edildi. Dosya stream parcasi
> binary/metin olarak dogrulanmadan scan/hash katmanina gecmiyor. 37 dosya
> modulu testi ile hedef lint ve API tip kontrolu gecti.
>
> 1 Agustos 2026 guncellemesi: Petshop sales testlerinde senkron bakiye
> sorgularindaki gereksiz `await` kaldirildi. Security-events testinde maskeli
> e-posta degeri runtime string daraltmasiyla dogrulandi. 50 test, hedef lint
> ve API tip kontrolu gecti.
>
> 1 Agustos 2026 guncellemesi: On bir moduldaki kullanilmayan sozlesme
> importlari temizlendi; test fixture'lari kurallara uygun isimlendirildi.
> Orders audit assertion'i `unknown` sinirinda daraltildi ve timeline testinden
> gereksiz ownership service kurulumu kaldirildi. 60 test, hedef lint ve API
> tip kontrolu gecti.
>
> 1 Agustos 2026 dogrulamasi: API ESLint error sayisi sifirlandi. Kök Node 20
> `type-check` 15/15 gorevle gecti. Buna karsin kök `lint`, security eklentisinin
> 95 uyarisi `--max-warnings=0` kapisina takiliyor. Kalan is, bu uyari gruplarini
> (repository Map erisimleri ve sabit regexler agirlikli) dogru kod degisikligi
> veya dar gerekceli istisna ile ayristirmaktir.
>
> 1 Agustos 2026 guncellemesi: PII masker, dinamik property atamalari yerine
> `Object.fromEntries` ile yeni nesne uretecek sekilde degistirildi. Bu, uc
> object-injection uyarisi icin genel bir lint istisnasi yerine gercek korumali
> kod degisikligidir; ilgili 19 test ve API tip kontrolu gecti.
>
> 1 Agustos 2026 dogrulamasi: Repository dynamic-patch ve denetlenmis decimal
> regex yanlis-pozitifleri API ESLint flat config'inde dar dosya listeleriyle
> kayda alindi; controller/service erisimlerinde kural aktif tutuldu. Kalan
> dogrudan erisimler `Reflect.get`/`Array.at` ve acik tip sinirlariyla duzeltildi.
> Kök Node 20 `lint` 12/12 ve `type-check` 15/15 basariyla gecti.
>
> 1 Agustos 2026 dogrulamasi: Kök `test` ikinci calistirmada 15/15 görevle
> gecti (API: 1.499 passed, 7 bilincli skip). `docs:check` 0 hata/405 uyari,
> `i18n:check` temiz ve üretim `build` 9/9 görevle basarili. Ilk paralel test
> calismasindaki UI paketi basarisizligi tekrarlanmadi; UI tekil ve kök tekrar
> calistirmalarinda basarili oldu.
>
> 1 Agustos 2026 E2E arastirmasi: Temiz `vetniva-postgres` veritabaninda bes
> SQL migration dosyasinin tamami PostgreSQL tarafindan basariyla uygulandi.
> Buna karsin Windows Prisma 5.22 motoru, ayni veritabanina `P1010` ile
> baglanmayi reddediyor; PostgreSQL gunlugunde motorun gonderdigi sorgu veya
> baglanti gorunmuyor. CI'da tanimsiz `DATABASE_SHADOW_URL` kaldirildi.
> Otomatik HTTP smoke sonucu bu yerel motor sorunu giderilene veya Linux CI
> calistirmasiyla kanitlanana kadar acik risk olarak kalir.
>
> 1 Agustos 2026 E2E sonucu: P1010'un nedeni kod veya Prisma degil, makinede
> 5432 portunu kullanan farkli PostgreSQL instance'iymis. Izole PostgreSQL
> 55432'de tum migrationlar `prisma migrate deploy` ile kayda alinarak gecti;
> derlenmis API'ye karsi kök `pnpm e2e:smoke` 7/7 testle basarili oldu.
> `turbo.json` e2e gorevine `E2E_BASE_URL` aktarimi eklenerek alternatif test
> portunun alt pakete iletilmesi de guvenceye alindi.
>
> Faz 1 cikis denetimi: Mevcut local/CI `vetniva` PostgreSQL kullanicisi
> superuser oldugu icin FORCE RLS politikalarini bypass eder; bu nedenle mevcut
> testler gercek DB RLS izolasyonunun kaniti degildir. Sonraki acil platform
> goal'u, ayri migrator/uygulama rolleri, merkezi transaction tenant baglami ve
> non-superuser iki-tenant integration testleriyle bu savunmayi gercekten
> enforce etmektir. Bu tamamlanmadan production-ready iddiasi yapilamaz.
>
> GOAL-010 RLS hardening ilerlemesi: `controlled-drugs.rls.e2e-spec.ts`,
> gecici non-superuser PostgreSQL rolunde baglamsiz read/write reddini, dogru
> tenant baglamini, cross-tenant gorunmezligini ve append-only UPDATE reddini
> 3/3 testle kanitladi. Birlesik root smoke paketi 10/10 gecti. Uygulamanin
> runtime'da superuser yerine bu sinirli rolu kullanmasi ve ayni savunmanin
> diger RLS tablolarina yayilmasi sonraki uygulama adimidir.
>
> GOAL-010 RLS hardening duzeltmesi: Branch repository'nin onceki
> `set_config(..., true)` cagrisi transaction disindaydi ve sonraki Prisma
> sorgusuna tasinmiyordu. Repository artik parametreli `set_config` ile ayni
> transaction client'ini kullanir ve konfigurasyon hatasinda fail-closed kalir.
> Non-superuser PostgreSQL E2E kapsami 4/4 testle bu branch RLS yolunu da
> kanitladi; API lint ve type-check temizdir.
>
> GOAL-012 RLS hardening duzeltmesi: RBAC `listMemberships` sorgusu da artik
> ayni transaction client'i uzerinde parametreli GUC baglami kurar. Non-superuser
> PostgreSQL E2E kapsami besinci senaryo olarak iki tenantin membership
> listelerinin birbirine karismadigini kanitladi (5/5). Lint, type-check,
> Prettier ve diff denetimi temizdir.
>
> GOAL-014 RLS hardening duzeltmesi: File metadata repository'sinin tum
> tenant-scoped read/create/update/list yollari transaction-yerel ve
> parametreli GUC baglamina tasindi. Non-superuser PostgreSQL E2E kapsami,
> tenant A dosyasinin A'da gorunup B'de gorunmedigini kanitladi (6/6).
> API lint/type-check, Prettier ve diff denetimi temizdir.
>
> Sonraki zorunlu parca GOAL-017 olarak kayda alindi:
> `goals/GOAL-017_postgresql_rls_runtime_hardening.md`. Bu goal, runtime
> superuser ayrimini, auth/session RLS tasarimini ve non-superuser API E2E
> kanitini tek kapsamda tamamlayacaktir.

Bu kayıt, mevcut completion report'larını teslim kanıtı olarak değil,
doğrulanacak çalışma varsayımı olarak ele alır. Bir goal ancak `GOAL_WORKFLOW.md`
bitirme koşullarının tamamı için güncel ve tekrarlanabilir kanıt ürettiğinde
Completed olur.

## Ortak goal şablonu

Her aşağıdaki goal için sıralama aynıdır: context ve bağımlılık kontrolü,
tasarım/risk, implementasyon, unit+integration+yetki+tenant testi, migration ve
append-only doğrulaması (varsa), dokümantasyon, completion report ve bağımsız
review. Kabul kriterleri goal brief'inde somutlaştırılmadan implementasyona
başlanmaz.

## Re-baseline — aktif kalite borcu

| Goal                                                           | Durum      | Çıkış kriteri                                                                                      |
| -------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| GOAL-QA-001: kalite envanteri ve kontrollü ilaç stabilizasyonu | Tamamlandı | Tip, test, format, docs ve i18n kapıları; kontrollü ilaç migration/RLS/append-only kanıtı.         |
| GOAL-QA-002: lint borcunu kapatma                              | Tamamlandı | `pnpm lint` temiz Linux CI runner'ında sıfır hata ile geçti; üretim kuralları gevşetilmedi.        |
| GOAL-QA-003: AI chunk UTF-8/YAML bütünlüğü                     | Tamamlandı | Chunk üretimi ve doğrulama tekrarlanabilir.                                                        |
| GOAL-QA-004: CI smoke doğruluğu                                | Tamamlandı | Migration başarısızlıkları gizlenmez; servis readiness zorunludur; CI üzerinde yeşil kanıt alındı. |

### Güncel doğrulama fotoğrafı — 1 Ağustos 2026

- Derlenmiş API, izole PostgreSQL üzerinde başlatıldı; /api/v1/health
  200 döndü.
- Black-box API smoke E2E 7/7 geçti: health, readiness, 404 sınırı,
  Controlled Drugs yazma endpoint'inin oturumsuz isteği 401
  VET-AUTH-0001 ile reddetmesi ve public forgot-password endpoint'inin
  geçersiz gövdeyi 422 VET-VALIDATION-0001 ile reddetmesi. Yeni gerçek
  PostgreSQL oturum senaryoları, STAFF kullanıcısının sahte `x-actor-role:
SUPERADMIN` başlığıyla branch oluşturamadığını ve Controlled Drugs kaydı
  yazamadığını 403 ile doğruladı.
- Controlled Drugs modül testleri 11/11 geçti; izole PostgreSQL'de
  controlled_drug_entries için RLS + FORCE RLS, tenant policy ve
  branch-tenant / UPDATE / DELETE engelleyici üç trigger doğrulandı.
- RBAC katalog/guard birim testleri 35/35 geçti. Production
  `modules/rbac/RbacService`, izin kapsamını `docs/permissions/catalog.yaml`
  tanımlarından yükleyecek şekilde düzeltildi; önceki "tüm rollere tüm izinler"
  davranışı kaldırıldı. Gerçek oturum E2E kanıtı mevcut olsa da Faz 1'in tüm
  goal'ları yeniden doğrulanmadan faz tamamlanmış sayılmaz.
- Kök `pnpm test` paralel koşusu, tek iş parçacıklı Turbo koşusu, type-check,
  build, docs:check (0 hata) ve i18n:check geçti. Paralel koşu 15/15 görevde
  başarılı; API paketi 1.499 geçen ve 7 bilinçli atlanan test raporladı.
- Lint yalnızca kısmi olarak kapandı: Worker, UI, i18n, i18n-check ve Web
  temiz; ortak JSDoc kuralı proje standardıyla hizalandıktan sonra API'de
  1.520 hata / 150 uyarı sürüyor; docs-check sıfır hata ve sıfır uyarıyla
  temizlendi.
  Bu nedenle hiçbir faz completion report'u güncel üretim kabul kanıtı
  sayılmaz.

Global staff `AuthGuard` kaydı eklendi. Health ve ayrı portal-session
controller'ları açık metadata ile staff oturumundan muaf tutulur; Controlled
Drugs için oturumsuz isteğin 401 dönmesini doğrulayan E2E senaryosu eklendi.
Bu güvenlik değişikliğinin nihai kanıtı, izole PostgreSQL kullanan CI E2E
koşusunun yeşil sonucudur.

## Faz 1 — platform çekirdeği

Sıra: GOAL-010 → 011 → 012 → 013 → 014 → 015 → 016. Her goal'da gerçek
PostgreSQL/RLS entegrasyon testi zorunludur. Faz kapısı: oturumdan türetilmiş
tenant bağlamı, backend izin enforcement, append-only audit ve tenantlar arası
erişim engeli. Ek güvenlik kanıtı: production route'ları actor bilgisini
`x-actor-*` header fallback'inden değil yalnızca doğrulanmış session'dan almalı;
public route'lar ise açıkça işaretlenmelidir.

## Faz 2 — hasta sahibi ve hayvan

Sıra: GOAL-020 → 021 → 022 → 023 → 024 → 025. Faz kapısı: sahip-hayvan
ilişkisi, geçmiş/uyarılar, dosya erişimi ve portal daveti için API+UI+audit+
tenant izolasyonu kanıtı.

## Faz 3 — randevu ve portal

Sıra: GOAL-030 → 031 → 032 → 033 → 034 → 035 → 036. Faz kapısı: takvim
çakışma kuralları, iptal/değişiklik audit'i, portal izolasyonu ve bildirim
joblarının idempotency kanıtı.

## Faz 4 — muayene ve klinik kayıt

Sıra: GOAL-040 → 041 → 042 → 043 → 044 → 045 → 046 → 047. Faz kapısı:
klinik kayıtların version/amendment modeli, reçete ve PDF paylaşımının yetki ve
audit testleriyle doğrulanması.

## Faz 5 — aşı ve koruyucu sağlık

Sıra: GOAL-050 → 051 → 052 → 053 → 054. Faz kapısı: lot/SKT/doz takibi,
stok tüketimi, tekrar hatırlatmaları ve hatalı kayıt için amendment akışı.

## Faz 6 — stok, satın alma ve petshop

Sıra: GOAL-060 → 061 → 062 → 063 → 064 → 065 → 066 → 067. Faz kapısı:
stok miktarının yalnızca hareketlerden türemesi, sayım/iadelerin ters kayıt
izleri ve düşük stok/SKT joblarının tekrarlanabilirliği.

## Faz 7 — satış ve finans

Sıra: GOAL-070 → 071 → 072 → 073 → 074 → 075 → 076 → 077. Faz kapısı:
Decimal tabanlı finansal kayıtlar, tahsilat/iptal için ters kayıt, gün sonu
mutabakatı ve e-SMM için provider-bağımsız sözleşme.

## Faz 8–9 — pilot ihtiyacına göre kontrollü paralellik

- Faz 8: GOAL-080 → 081 → 082 → 083 → 084 → 085 → 086
- Faz 9: GOAL-090 → 091 → 092 → 093 → 094

Bu iki faz yalnızca Faz 1–7 platform ve kayıt kurallarını yeniden kullanır;
ayrı tenant/audit/append-only çözümleri üretmez. Pilot kapsamına alınan akışlar
için ilgili faz kapısı zorunludur.

## Faz 10–12 — satışa çıkış kapısı

- Faz 10: GOAL-100 → 101 → 102 → 103 → 104 → 105 → 106
- Faz 11: GOAL-110 → 111 → 112 → 113 → 114 → 115 → 116 → 117 → 118
- Faz 12: GOAL-120 → 121 → 122 → 123 → 124 → 125 → 126 → 127

Üretim kapısı: merkezi hata/PII yönetimi, güncel dokümantasyon-RAG doğrulaması,
pilot kabul/performance/security/backup-restore kanıtı, tenant export/KVKK ve
geri dönüşü test edilmiş release prosedürü. İlk satış için Faz 0–7 ile Faz
10–12 bu kapıdan geçmelidir.

## Sonraki ürün paketleri

- Faz 13 (Türkiye entegrasyonları): GOAL-130 → 131 → 132 → 133 → 134.
  Gerçek sağlayıcı veya resmî sistem erişimi olmadan Completed değildir.
- Faz 14 (İngiltere): GOAL-140 → 141 → 142 → 143 → 144 → 145 → 146.
  Controlled Drug Register altyapısı GOAL-143 kapsamında doğrulandı; ülke
  paketinin tamamlanması için diğer UK goal'ları ve saha/uyumluluk doğrulaması
  hâlâ gerekir.

## Bir sonraki çalışma dilimi

1. Faz 1, gerçek çalışır durumunun yeniden doğrulanmasıyla GOAL-010'dan
   başlayarak sırayla yeniden kapatılır.
2. Faz 2 ve sonraki klinik/finansal akışlar, ilgili goal kabul kriterleri,
   tenant izolasyonu ve append-only kanıtlarıyla denetlenir.
3. Faz 12 için pilot kabul, performans, güvenlik, backup/restore ve gerçek
   sağlayıcı doğrulamaları planlanır; CI başarısı bu dış ortam kanıtlarının
   yerine geçmez.

### GOAL-QA-002 ilerleme kaydı

- 1 Ağustos 2026: `apps/api/src/modules/notifications` lint borcu 42'den
  sıfıra indirildi. Düzeltmeler yalnızca import sırası ve kullanılmayan tip/
  decorator importlarının kaldırılmasıyla sınırlı tutuldu. Modülün 16 birim
  testi ve API tip kontrolü geçti.
- 1 Ağustos 2026: `apps/api/src/modules/portal-appointments` lint borcu
  38'den sıfıra indirildi. Import sırası yanında notification idempotency
  anahtarına giren `requestId` değeri string tip korumasına alındı; 11 birim
  testi ve API tip kontrolü geçti.
- 1 Ağustos 2026: Kullanıcı tarafından değiştirilmemiş iki API dosyası daha
  temizlendi: `vaccines.module.ts` (14 hata; 103 aşı modül testi geçti) ve
  `owners.controller.ts` (12 hata; 33 ilgili test geçti). İkinci dosyada
  dinamik `import()` tipleri, normal type import'lara dönüştürüldü.
- 1 Ağustos 2026: Kök lint ilk kez güncel çalışma ağacında çalıştırıldı.
  API'ye geçmeden `@vetniva/contracts` kapısında 12 hata/53 uyarı bulundu.
  Derleme artefaktları lint kapsamından çıkarıldı ve barrel export çakışmaları
  ile beş gerçek hata giderildi. Kalan 53 uyarı, ankorlu ve uzunluğu sınırlı
  Zod regex'lerinin `security/detect-unsafe-regex` yanlış pozitifidir; kural
  gevşetilmeden ifade bazında kanıt/suppression ile ele alınacaktır. Kök
  `pnpm type-check` bu değişikliklerden sonra 15/15 görevle geçti.
- 1 Ağustos 2026: Contracts'taki 53 regex uyarısı global kural gevşetmesi
  olmadan, her sabit/ankorlu/üst-sınırlı şema ifadesinde gerekçeli yerel
  suppression ile sıfıra indirildi. Contracts lint, type-check ve 7 test
  yeşildir. Tekrar çalıştırılan kök lint artık Contracts'ta durmuyor; API'de
  1.358 hata ve 123 uyarı raporluyor (önceki 1.520 hata / 150 uyarıya göre
  162 hata ve 27 uyarı azalma). Bu sayı QA-002'nin yeni başlangıç ölçümüdür.
- 1 Ağustos 2026: API'de kullanıcı değişikliği olmayan controller dilimleri
  temizlendi: `waitlist` (11 hata; 14 test), `followups` (10 hata; 11 test),
  `pricing` (10 hata; 35 test) ve `vaccines` (10 hata; 103 test). Her dilimin
  lint'i ve API tip kontrolü ayrıca geçti; bu turda 41 API lint hatası daha
  kapatıldı.
- 1 Ağustos 2026: Aynı yöntemle `feature-flag.controller.ts` (10 hata; 7
  test) ve `orders.controller.ts` (10 hata; 15 test) temizlendi. API lint
  borcu bu iki güvenli dilimde 20 hata daha azaltıldı.
- 1 Ağustos 2026: Temiz controller dilimleri sürdürüldü: `products` (9 hata;
  26 test), `suppliers` (9 hata; 19 test), `log-retention` (9 hata; 27 test)
  ve `stock-movements` (9 hata; 38 test). Bu dört dosyada lint ve API tip
  kontrolü yeşil; ek 36 hata kapatıldı.
- 1 Ağustos 2026: `timeline.controller.ts` (9 hata; 6 test) ve
  `job-runs.controller.ts` (8 hata; 40 test) temizlendi. İki modülde dosya
  lint'i ve API tip kontrolü geçti; ek 17 hata kapatıldı.
- 1 Ağustos 2026: Kök paralel `pnpm test` koşusunda, Node 24/Windows altında
  UI Vitest worker'ı (`Tinypool`) beklenmedik kapandı; UI testi tek başına
  3/3 geçti. `turbo run test --concurrency=1` tekrarı 15/15 görevle yeşildi;
  API 1.499 başarılı ve 7 bilinçli atlama raporladı. Bu nedenle test mantığı
  başarısız sayılmaz; PR/CI'da pinli Node 20 üzerinde paralel tekrar ile
  bağımsız kanıt alınması QA-004'ün açık maddesidir.
- 1 Ağustos 2026: `pnpm docs:check` 327 route, 240 VET hata kodu ve 209
  permission referansı üzerinde 0 hatayla geçti; 78 uyarı legacy kodlar,
  henüz eşleşmeyen page kayıtları ve orphan alan sözlüğü girdileridir. `pnpm
i18n:check` parity temiz geçti. Dokümantasyon uyarıları Faz 10–12 yayın
  kapısında ayrı bir temizlik goal'u olarak ele alınacaktır.
- 1 Ağustos 2026: Küçük modül dilimleriyle `prescriptions.module.ts` (4 hata;
  17 test) ve `portal-auth.module.ts` (4 hata; 24 test) temizlendi. Her iki
  dosyada lint ve API tip kontrolü geçti; ek 8 hata kapatıldı.
- 1 Ağustos 2026: `stock-alerts.module.ts` (4 hata; 29 test) ve
  `timeline.module.ts` (4 hata; 6 test) temizlendi. Lint ve API tip kontrolü
  her iki modülde geçti; ek 8 hata kapatıldı.
- 1 Ağustos 2026: Tekrar çalıştırılan kök lint API'de 1.228 hata / 123 uyarı
  raporladı. Önceki 1.358 hata / 123 uyarı ölçümüne göre bu dilimlerde 130
  hata azaltıldı; bu QA-002 için güncel ölçümdür.
- 1 Ağustos 2026: `owners.service.ts` (6 hata; 33 test) ve
  `job-runs.service.ts` (8 hata, 2 güvenlik uyarısı; 40 test) temizlendi.
  Job-runs payload kırpmasında dinamik anahtar yazımı `Object.defineProperty`
  ve `Reflect.get` ile prototype enjeksiyon uyarısı üretmeyecek hale getirildi.
- 1 Ağustos 2026: `feature-flag.service.ts` temizlendi (4 hata; 7 test).
  Public servis girişleri `string` kabul edip `isModuleKey` sonrasında
  `ModuleKey`e daralttı; böylece bilinmeyen runtime anahtarlarında koruma ve
  güvenli hata kaydı korunurken `never` template-literal hataları kaldırıldı.
- 1 Ağustos 2026: `patients.module.ts` ve `vaccinations.module.ts` birlikte
  temizlendi (toplam 8 hata). İlgili 41 test ile API tip kontrolü geçti.
- 1 Ağustos 2026: `reports.module.ts` içindeki 3 import sıralama hatası
  temizlendi; raporlama modülündeki 8 test ve API tip kontrolü geçti.
- 1 Ağustos 2026: Yedi temiz modüldeki import sıralama borcu kapatıldı:
  onboarding, purchase-orders, security-events, identity, operation-notes,
  lab-orders ve lab-results. Dosya lint'i temiz; ilgili 117 test ve API tip
  kontrolü geçti.
- 1 Ağustos 2026: Log-retention hedefleri ile portal repository’sindeki beş
  küçük lint hatası temizlendi. İlgili 82 test ve API tip kontrolü geçti.
- 1 Ağustos 2026: Petshop sales, superadmin, orders, payments, inventory,
  vitals, waitlist, portal, examinations, followups ve stock-movements
  modüllerindeki 29 import-sırası hatası temizlendi. İlgili 227 test ve API
  tip kontrolü geçti.
- 1 Ağustos 2026: Kök lint yeniden ölçüldü. API’de 1.158 hata ve 119 uyarı
  kaldı; önceki 1.228 hata / 123 uyarı ölçümüne göre 70 hata ve 4 uyarı azalma
  sağlandı. Diğer 11 paket lint kapısından geçti; kök komut yalnızca API
  borcu nedeniyle kırmızı kaldı.
- 1 Ağustos 2026: Çakışmasız son üç API dosyasındaki yedi hata (file DTO,
  owners test ve portal-pets service) temizlendi. İlgili 78 test ve API tip
  kontrolü geçti; bu dosyalarda yalnızca iki mevcut güvenlik uyarısı kaldı.
- 1 Ağustos 2026: Node 20.10.0 ile CI-benzeri kök type-check (15/15 görev) ve
  paralel kök test (15/15 görev; API 1.499 başarılı, 7 bilinçli atlama) geçti.
  `docs:check` 0 hata / 100 uyarı ile, `i18n:check` temiz geçti. Node 24’teki
  Vitest worker sorunu CI’nin kullandığı Node 20’de tekrar etmedi.
- 1 Ağustos 2026: Node 20.10.0 ile production `pnpm build` 9/9 görevle geçti;
  Nest API, worker ve Next.js web production çıktıları başarıyla üretildi.
- 1 Ağustos 2026: Node 20 format denetimi güncel çalışma ağacında 132 dosya
  sapması ve customer-balances testinde iki trailing-whitespace kaydı buldu.
  Toplu format uygulanmadı; bulguların önemli kısmı aktif kullanıcı
  değişiklikleriyle çakışıyor. `git diff --check` de bu iki whitespace kaydını
  doğruladı.
- 1 Ağustos 2026: Node 20 izole E2E ilk koşumunda public endpoint'lerin
  `ActorInterceptor` tarafından yeniden 401'e çevrildiği bulundu. Interceptor
  `@Public()` metadata'sını tanıyacak şekilde düzeltildi; dosya lint'i, API tip
  kontrolü ve production build geçti. Geçici PostgreSQL + API ile yeniden
  çalıştırılan smoke suite 7/7 geçti: health/login public erişimi, sahte header
  ile yetki yükseltme engeli ve STAFF Controlled Drugs yazma reddi kanıtlandı.
- 1 Ağustos 2026: API lint borcunun 995 otomatik düzeltilebilir kaydı küçük
  modül gruplarında işlenmeye başlandı. Aşı, vitals ve waitlist grubunda import
  düzeni/otomatik assertion temizliği sonrası ilgili 126 test ve API tip
  kontrolü geçti. Güncel tam ölçüm 1.151 hata / 119 uyarıdır; sonraki grupta
  error-events, e-SMM, kasa, klinik satış/kayıt/tüketim import düzenleri
  temizlendi, kalan 16 hata gerçek type-safety veya kullanılmayan semboldür.
- 1 Ağustos 2026: İkinci grubun 16 hatası kapatıldı; ilgili 181 test ve API tip
  kontrolü geçti. Kök API lint yeniden ölçüldü: 141 hata / 97 uyarı. Bu,
  1.151 hata / 119 uyarı ölçümüne göre 1.010 hata ve 22 uyarı azalma demektir.
  Kalan borç ağırlıkla gerçek type-safety ihlalleri, güvenlik analiz uyarıları
  ve az sayıdaki kullanılmayan semboldür.
- 1 Ağustos 2026: Tüm çalışma ağacına Prettier uygulandı. Node 20 ile
  `format:check` geçti; `git diff --check` boş döndü. Biçim kapısı artık yeşil,
  açık kalite borcu API lintindeki 141 hata / 97 uyarıyla sınırlı.
- 1 Ağustos 2026: Prettier sonrası Node 20 kök `type-check` yeniden çalıştırıldı
  ve 15/15 görev geçti. Biçimleme tüm çalışma ağacında tip güvenliğini bozmadı.
- 1 Ağustos 2026: Customer-balances testindeki payment mock'u `any` yerine
  `Payment`, `PaymentFilters` ve `PaymentListResponse` sözleşme tipleriyle
  güçlendirildi. Dosyadaki 21 lint hatası kapandı; ilgili 6 test ve API tip
  kontrolü geçti.
- 1 Ağustos 2026: Vaccine-applications testinde kullanılmayan repository
  importu kaldırıldı. Vitest asymmetric matcher'larının test-only `any`
  sözleşmesi için dokuz dar kapsamlı ve gerekçeli lint istisnası eklendi; 29
  test ve API tip kontrolü geçti.
- 1 Ağustos 2026: Stock-alerts testindeki 14 hata kapatıldı. Error assertion
  desenleri `toThrowError(expect.objectContaining(...))` yerine aynı hata
  kodu/statü kapsamını koruyan tip güvenli `toMatchObject` kullanımına taşındı;
  kullanılmayan fixture/importlar çıkarıldı. İlgili 29 test ve API tip kontrolü
  geçti.
- 1 Ağustos 2026: GOAL-017 kapsamında oturum erişiminin RLS için gerekli ilk
  katmanı uygulandı. `user_sessions` için token hash ile daraltılmış yalnızca
  SELECT politikası eklendi; session oluşturma, token bulma, aktif branch
  güncelleme, dokunma, iptal ve listeleme sorguları transaction-yerel ve
  parametrik kullanıcı/token bağlamına taşındı. Non-superuser PostgreSQL E2E
  kapsamı auth session negatif/pozitif yoluyla birlikte 7 senaryoya çıktı ve
  geçti. Node 20 ile API unit testleri 1.499 başarılı/7 atlama, API lint ve
  tip kontrolü, kök `format:check` ile `git diff --check` geçti. Ayrı
  `NOBYPASSRLS` runtime uygulama rolü, kalan auth akışlarının kapsamı ve tam
  runtime smoke henüz açık olduğundan GOAL-017 tamamlanmış sayılmaz.
- 1 Ağustos 2026: GOAL-017 rol ayrımı için idempotent PostgreSQL bootstrap
  betiği eklendi. `vetniva_app` rolü `NOSUPERUSER`, `NOBYPASSRLS`, rol/DB
  oluşturma yetkisiz olarak kurulur; mevcut ve migrator `vetniva` tarafından
  sonradan oluşturulacak public şema nesneleri için yalnız runtime grant'leri
  alır. `db:migrate` artık zorunlu `DATABASE_MIGRATOR_URL` ile çalışır; local
  örnekler ve CI E2E görevi runtime/migrator URL'lerini ayırır. Temiz PostgreSQL
  üzerinde altı migration migrator ile uygulandı, rol özellikleri DB'den
  doğrulandı ve gerçek runtime URL'si altında 8 non-superuser RLS senaryosu
  geçti. Login'in aktif üyelik ve varsayılan şube çözümü de transaction-yerel
  RLS repository yoluna taşındı. Tam HTTP runtime smoke ile kalan invitation,
  password-reset, `me` ve branch-switch auth yolları hâlâ GOAL-017'nin açık
  kapsamıdır.
- 1 Ağustos 2026: GOAL-017 auth RLS kapsamı invitation ve password-reset
  tokenlarına genişletildi. Her token için yalnız hash eşitliğine izin veren
  SELECT policy'si eklendi; takip eden write işlemleri token sahibinin user
  veya invitation tenant transaction bağlamında kalır. `me`, tenant-switch ve
  branch-switch dahil AuthService'teki tenant/session/auth RLS tablolarına
  doğrudan Prisma erişimi kaldırıldı. Temiz PostgreSQL'de yedi migration
  migrator ile uygulandı; gerçek `vetniva_app` runtime bağlantısı altında 9
  RLS E2E senaryosu, 33 auth unit testi, API lint ve tip kontrolü geçti.
- 1 Ağustos 2026: GOAL-017 için derlenmiş NestJS runtime HTTP E2E eklendi.
  Test, fixture verisini migrator ile yazar ve API'yi gerçek `vetniva_app`
  bağlantısıyla başlatır; health, login, session tenant-switch ve STAFF
  Controlled Drugs yetki reddiyle birlikte login audit kaydının DB'ye
  yazıldığını kanıtlar. Bu sırada ortaya çıkan tenant audit RLS eksikliği
  `AuditService` transaction bağlamı ile kapatıldı. `audit:auth.login.success`
  biçimindeki katalog event'lerinin eski check constraint tarafından
  reddedildiği bulundu; hiyerarşik adları kabul eden migration eklendi. Temiz
  PostgreSQL'de sekiz migration migrator ile uygulandı; HTTP E2E 2/2 geçti.
- 1 Ağustos 2026: CI, API başlamadan önce `db:verify-runtime-role` ile runtime
  `DATABASE_URL` hesabının superuser, `BYPASSRLS` veya public şema `CREATE`
  yetkisi taşımadığını doğrular. Temiz PostgreSQL'de `vetniva_app` doğrulaması
  geçti; migrator hesabı bilinçli olarak reddedildi. Kök `e2e:smoke` görevi
  derlenmiş runtime HTTP testi için güncel build çıktısına bağımlı hale getirildi.
- 1 Ağustos 2026: GOAL-017 tamamlandı. Kök `pnpm e2e:smoke`, temiz PostgreSQL
  ve `vetniva_app` runtime rolüyle 19/19 geçti; lint, type-check, test, build,
  docs, i18n, format ve diff kalite kapılarının tamamı Node 20 altında yeşil.
  Completion kanıtı `goals/GOAL-017_COMPLETION_REPORT.md` dosyasındadır.
  Aynı stabilizasyon parçasında append-only Controlled Drugs correction
  hareketinin stok bakiyesine ters etkisi eklenip gerçek RLS E2E ile kanıtlandı.
- 1 Ağustos 2026: Controlled Drugs correction bütünlüğü güçlendirildi.
  Dokuzuncu migration, aynı orijinal entry için tek correction satırı
  zorunluluğu ile hedef tenant/tür/miktar doğrulamasını DB katmanına taşıdı;
  servis `VET-CD-0007` ile kullanıcıya anlaşılır red verir. Temiz PostgreSQL
  üzerinde tam E2E smoke 19/19 geçti.
