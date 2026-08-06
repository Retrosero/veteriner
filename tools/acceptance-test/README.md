# @vetniva/acceptance-test (GOAL-121, FAZ-12)

Pilot kabul (UAT) test altyapısı. 10 uçtan uca pilot senaryosu için
sıralı API çalıştırıcı, süre/hata/yorum kayıt motoru ve Markdown/JSON
rapor üreticisi. Pilot kliniğin gerçek ortamda koşması, hata ve
"gereksiz adım" geri bildirimi toplaması ve yayın öncesi kabul
sözlüğünün işletilmesi için tasarlanmıştır.

Bu doküman **operatör** ve **pilot kullanıcı** için pratik bir
kılavuzdur; geliştirici/API sözleşmesi için `src/` altındaki
Türkçe JSDoc bloklarına bakın.

## 1) Hızlı başlangıç

```powershell
# 1) API ayağa kalkmış olmalı (FAZ-10/11 kapsamında)
Set-Location C:\Users\retro\Documents\GitHub\veteriner
pnpm dev
#   API: http://localhost:3001
#   Swagger: http://localhost:3001/api/docs

# 2) Pilot seed (catalog kimlikleri icin tenant, branch, vet, owner, patient,
#    product, lab test, vaccine protocol, vaccine stock product, cage)
#    tools/seed paketinden uretilir; onceki goal'larda (GOAL-119 vb.)
#    olusturulan bir tenant icin env degerlerini asagidaki gibi set et.

# 3) Kabul testini calistir
Set-Location C:\Users\retro\Documents\GitHub\veteriner\tools\acceptance-test
$env:UAT_BASE_URL = "http://localhost:3001"
$env:UAT_TENANT_ID = "<pilot-tenant-uuid>"
$env:UAT_BRANCH_ID = "<pilot-branch-uuid>"
$env:UAT_TOKEN = "<staff-bearer-token>"
$env:UAT_VETERINARIAN_TOKEN = "<veterinarian-bearer-token>"
$env:UAT_VACCINE_PROTOCOL_ID = "vacp-<...>"
$env:UAT_VACCINE_STOCK_PRODUCT_ID = "prd-<...>"
$env:UAT_PRODUCT_ID = "prd-<...>"
$env:UAT_CAGE_ID = "cag-<...>"
$env:UAT_LAB_TEST_ID = "<lab-test-uuid>"
pnpm run -- --out=./uat-result.json

# 4) Markdown/JSON rapor uret
pnpm report -- --in=./uat-result.json --md=./uat-report.md --json=./uat-report.json
```

`uat-report.md` pilot ekibin ve ürün sahibinin okuyacağı insani
rapordur; `uat-report.json` CI/makine-okur karşılaştırma içindir.

## 2) Ortam değişkenleri

| Değişken                       | Zorunlu                | Açıklama                                                                                                   |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `UAT_BASE_URL`                 | hayır                  | API kök URL (varsayılan `http://localhost:3001`)                                                           |
| `UAT_TENANT_ID`                | evet                   | Pilot tenant UUID                                                                                          |
| `UAT_BRANCH_ID`                | evet                   | Pilot branch UUID                                                                                          |
| `UAT_TOKEN`                    | evet                   | Staff Bearer token (senaryoların çoğu)                                                                     |
| `UAT_VETERINARIAN_TOKEN`       | önerilir               | Veteriner Bearer token; `examination`/`vaccination`/`surgery`/`hospitalization`/`laboratory` adımları için |
| `UAT_PORTAL_TOKEN`             | hayır                  | Mevcut portal oturumu. Sağlanmazsa `new_owner_patient` sonrası demo portal hesabı otomatik üretilir.       |
| `UAT_PORTAL_PASSWORD`          | hayır                  | Otomatik üretilen portal hesabı için parola (varsayılan `VetnivaUat!2026`)                                 |
| `UAT_VACCINE_PROTOCOL_ID`      | evet (vaccination)     | Katalog kimliği (seed'den)                                                                                 |
| `UAT_VACCINE_STOCK_PRODUCT_ID` | evet (vaccination)     | Katalog kimliği (seed'den)                                                                                 |
| `UAT_PRODUCT_ID`               | evet (petshop_sale)    | Katalog kimliği (seed'den)                                                                                 |
| `UAT_CAGE_ID`                  | evet (hospitalization) | Katalog kimliği (seed'den)                                                                                 |
| `UAT_LAB_TEST_ID`              | evet (laboratory)      | Katalog kimliği (seed'den)                                                                                 |
| `UAT_OPERATOR`                 | hayır                  | Raporu imzalayan operatör adı (varsayılan `pilot-cli`)                                                     |
| `UAT_OUT`                      | hayır                  | JSON çıktı yolu (varsayılan `./uat-result.json`)                                                           |
| `UAT_FEEDBACK_FILE`            | hayır                  | JSON dosya: adım adına pilot geri bildirimi (bkz. bölüm 6)                                                 |
| `UAT_TENANTS_FILE`             | hayır                  | JSON dosya: çoklu-tenant çapraz-pilot listesi (bkz. bölüm 7)                                               |

## 3) 10 senaryo ve PASS kriterleri

| #   | Senaryo             | Modül           | Rol                      | PASS kriteri                                                                                                          |
| --- | ------------------- | --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `new_owner_patient` | owner           | STAFF                    | `create_owner` → 201 + `id` döner; `get_owner` → 200; `create_patient` → 201; `get_patient_timeline` → 200            |
| 2   | `appointment`       | appointment     | STAFF                    | `list_calendar_today` → 200; `create_appointment` → 201 + `id`; `get_appointment` → 200                               |
| 3   | `examination`       | examination     | VETERINARIAN             | `start_examination` → 201 + `id`; `get_examination` → 200; `complete_examination` → 200                               |
| 4   | `vaccination`       | vaccination     | VETERINARIAN             | `create_vaccine_application` → 201 + `id`; `get_vaccine_card` → 200                                                   |
| 5   | `petshop_sale`      | petshop         | STAFF                    | `create_sale` → 201 + `sale.id`; `get_sale` → 200; `complete_sale` → 200                                              |
| 6   | `collection`        | payment         | STAFF                    | `create_payment` → 201 + `id`; `get_payment` → 200                                                                    |
| 7   | `surgery`           | surgery         | VETERINARIAN             | `create_surgery_plan` → 201 + `id`; `start_surgery` → 200; `complete_surgery` → 200                                   |
| 8   | `hospitalization`   | hospitalization | VETERINARIAN             | `create_hospitalization` → 201 + `id`; `admit_hospitalization` → 200; `discharge_hospitalization` → 200               |
| 9   | `laboratory`        | lab             | VETERINARIAN             | `create_lab_order` → 201 + `id`; `collect_lab_sample` → 200; `start_lab_processing` → 200; `complete_lab_order` → 200 |
| 10  | `portal`            | portal          | STAFF + PET_OWNER_PORTAL | `create_portal_request` → 201 + `id`; `approve_portal_request` → 200                                                  |

Tüm adımlar PASS olmadan senaryo PASS sayılmaz; tek bir adımın
HTTP status'ü beklenen listede değilse veya `expectField` truthy
değilse senaryo FAIL olur. Hata durumunda sonraki adımlar
çalıştırılmaz (placeholder çözümü kırılır).

## 4) Sıralı context (initialContext)

Senaryolar sırayla çalışır ve birbirinden kimlik devralır:

1. `new_owner_patient` → `ownerId`, `patientId`, `branchId` üretir.
2. `appointment` → `{patientId}` ve `{branchId}` placeholder'ları
   önceki senaryodan gelir; `appointmentId` üretir.
3. `examination` → `{appointmentId}` ile başlar; `examinationId` üretir.
4. `vaccination` → `{patientId}` ile aşı uygular; ürettiği `vaccineApplicationId` ayrıca raporlanır.
5. `petshop_sale` → `{productId}` (env), `{ownerId}` ve `{patientId}` ile taslak açar; `saleId` üretir.
6. `collection` → `{saleId}` ile tahsilat kaydı açar; `paymentId` üretir.
7. `surgery` → `{patientId}` ile plan açar; `surgeryId` üretir.
8. `hospitalization` → `{patientId}` ile yatış açar; `cageId` (env) ile kafese alır; `hospitalizationId` üretir.
9. `laboratory` → `{patientId}` ve `{labTestId}` (env) ile istek açar; `labOrderId` üretir.
10. `portal` → `new_owner_patient` adımında otomatik üretilen demo portal hesabıyla `{patientId}` için talep oluşturur; klinik `approve_portal_request` ile onaylar.

Sıralama bozulursa (örn. `--scenario=petshop_sale` tek başına) ilk
senaryoda `ownerId`/`patientId` placeholder'ları çözülemediğinden
senaryo `UAT-PLACEHOLDER-0002` hata kodu ile başarısız olur. Tek
senaryo koşmak için en azından o senaryonun ihtiyaç duyduğu tüm
kimlikleri `initialContext` üzerinden sağlamak gerekir; bu
ileride bir `uat-seed` komutu ile otomatikleştirilebilir
(FAZ-12+ backlog).

## 5) Tek senaryo koşmak

```powershell
pnpm run -- --scenario=examination --out=./examination-only.json
pnpm report -- --in=./examination-only.json --md=./examination-only.md
```

Tek senaryo modunda sıralı context kaybedilir; `examination` için
`appointmentId` gerektiğinden senaryo doğrudan FAIL olur (PASS
kriteri olarak kabul edilir — gerçek pilot'ta tek senaryo koşumu
önerilmez).

## 6) Pilot geri bildirimi

### Form tabanlı toplama (önerilir)

`tools/acceptance-test/feedback-form.html` adresindeki statik
formu pilot kullanıcının tarayıcısında açın:

```powershell
Start-Process "tools/acceptance-test/feedback-form.html"
```

Form 10 senaryonun her adımı için:

- 1-5 puan (zorunlu değil)
- Yorum (PII otomatik maskelenir; TCKN/email/telefon regex'i)
- "Gereksiz adım" işareti (checkbox)

doldurulur. Form çıktısı kopyalanıp `feedback.json` adıyla
kaydedilir ve aşağıdaki komutla koşuma dahil edilir:

```powershell
$env:UAT_FEEDBACK_FILE = ".\feedback.json"
pnpm run -- --out=./uat-with-feedback.json
```

`feedback.json` şu formatta olmalıdır:

```json
{
  "scenario_key": {
    "step_name": {
      "reviewer": "Pilot Vet. Dr. X",
      "rating": 4,
      "comment": "Adim acik ve hizli",
      "unnecessary": false
    }
  }
}
```

> JSON dosyasındaki yorum alanlarında PII (TCKN, telefon, email,
> IBAN, kart numarası) otomatik maskelenir; `UAT-FEEDBACK-0001` kodu
> rapor ve log'a yazılır.

### CLI tabanlı toplama (geliştirici)

```typescript
import { buildFeedback } from "@vetniva/acceptance-test";
const fb = buildFeedback({
  reviewer: "Dr. Pilot",
  rating: 5,
  comment: "Hizli ve net",
  unnecessary: false,
});
```

`buildFeedback` PII mask + puan doğrulaması yapar; geçersiz
puan/reviewer hata fırlatır.

## 7) Çapraz-tenant (çoklu-tenant) pilot

Pilot birden fazla tenant üzerinde paralel/ardışık koşulabilir
(tam paralel k6 tarafında `GOAL-122` çoklu-tenant seed ile
planlanmıştır; burada sıralı CLI varyantı sağlanır). JSON
tanım:

```json
[
  {
    "label": "tenant-1",
    "baseUrl": "http://localhost:3001",
    "tenantId": "11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1",
    "branchId": "b203d16a-91e2-49c0-b9d7-9bdc55fdf60d",
    "token": "...",
    "veterinarianToken": "..."
  },
  {
    "label": "tenant-2",
    "baseUrl": "http://localhost:3001",
    "tenantId": "8b16...-...",
    "branchId": "...",
    "token": "...",
    "veterinarianToken": "..."
  }
]
```

Çalıştırma:

```powershell
$env:UAT_TENANTS_FILE = ".\tenants.json"
pnpm run -- --out=./uat-multi-tenant.json
```

CLI her tenant için ayrı bir koşum yapar, sonuçları
`scenarios[].tenantLabel` etiketi ile zenginleştirir ve tek
JSON dosyasında birleştirir. `allPassed` yalnızca tüm
tenant'lardaki senaryolar geçtiğinde `true` olur.

## 8) Çıktı şeması

```typescript
interface UatRunResult {
  runAt: string; // ISO 8601
  operator: string; // env: UAT_OPERATOR
  baseUrl: string; // env: UAT_BASE_URL
  tenantId: string | null; // tekil mod
  tenants?: Array<{ label: string; tenantId: string; branchId: string }>;
  scenarios: UatScenarioResult[];
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
  totalSteps: number;
  totalFailedSteps: number;
  totalUnnecessary: number;
  averageRating: number; // 0..5; 0 = puan yok
}
```

Her senaryo `steps[]` içinde `feedback` alanı taşıyabilir; UI
raporunda "gereksiz adım" işaretli olanlar ayrıca listelenir.

## 9) Rapor örneği

Üretilen Markdown raporun yapısı:

```
# Pilot Kabul Testi Raporu (GOAL-121)
- Çalıştırma zamanı, operatör, base URL, tenant

## Ozet
- Toplam senaryo, geçen, kalan, ortalama süre, gereksiz adım, ortalama puan

## Senaryolar
### ✅/❌ <Senaryo Başlığı> (`scenario_key`)
- Modül, başlangıç, bitiş, süre, geçen adım, gereksiz adım, ortalama puan
- Tablo: sonuç, adım, status, süre, yorum

## Basarisiz Adimlar
- `<scenario>/<step>` formatında hata özeti
```

`reportToJson` aynı veriyi `summary` (özet istatistik) + `scenarios`
(detay) ile döner; CI sınıf kapıları bu JSON'ı tüketir.

## 10) Sınırlamalar ve bilinçli atlamalar

- **Tenant kimliği doğrulaması:** CLI kabul eder ama API tarafında
  `X-Tenant-Id` ile RLS aktif. Token + tenant uyumsuzsa API
  401/403 döner; bu beklenen bir fail modudur.
- **Görsel/UI pilot testleri:** Bu paket yalnızca API düzeyinde
  koşar. Tarayıcı tarafı E2E testleri FAZ-13+ (Playwright) ile
  ayrıca planlanır.
- **Çoklu-tenant paralel:** CLI sıralı koşar; gerçek paralel yük
  testi `tools/load-test` kapsamında FAZ-14+'da.
- **Yapay zeka destekli rapor özetleme:** RAG chunk üreticisi
  `tools/rag-chunk-producer` ile yapılır; burada yalnızca ham
  çıktı üretilir.

## 11) Testler

```powershell
Set-Location C:\Users\retro\Documents\GitHub\veteriner\tools\acceptance-test
pnpm type-check
pnpm test
```

74 vitest + yeni eklenen acceptance/feedback/multi-tenant testleri.

## 12) İlgili dokümanlar

- `docs/operations/PILOT_ACCEPTANCE.md` — kabul kriteri sözlüğü
- `docs/operations/PERFORMANCE_LOAD.md` — performans + yük testi
- `tools/load-test/README.md` — k6 senaryoları ve threshold'lar
- `tools/feedback-form.html` — pilot geri bildirim formu
