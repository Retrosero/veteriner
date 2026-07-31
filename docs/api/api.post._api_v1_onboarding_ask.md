# POST /api/v1/onboarding/ask

İlk kullanım asistanı (GOAL-117) "X nasıl yapılır?" sorusunu
yanıtlar. Senaryo eşleştirmesi role + modül + anahtar kelime
bazlıdır. **Tıbbi sorular reddedilir** (tanı/teşhis/ilaç
önerisi → 422 VET-ONBOARD-0001).

- **Modül:** onboarding
- **Yetki:** Oturum açmış tüm kullanıcılar.
- **Audit:** `audit:onboarding.ask` (info).

**Body (`OnboardingAskInput`):**

```json
{
  "question": "Yeni hasta nasıl eklenir?",
  "locale": "tr-TR",
  "currentModule": "clinic",
  "contextPage": "/[locale]/clinic/patients/new"
}
```

- `question` (string, 5-500) zorunlu.
- `locale` (tr-TR | en-GB) zorunlu.
- `currentModule` (enum) opsiyonel; daraltılmış senaryo
  araması.
- `contextPage` (string) opsiyonel; UI context bilgisi.

**Response 200 (`OnboardingAskResponse`):**

```json
{
  "matched": true,
  "scenarioId": "patient_create",
  "title": "Hayvan Ekleme (Patient Create)",
  "summary": "Yeni hasta kaydı oluşturma adımları.",
  "steps": [
    {
      "order": 1,
      "title": "Hayvan formunu aç",
      "description": "/[locale]/clinic/owners/{ownerId}/patients/new sayfasına git.",
      "link": "/[locale]/clinic/owners/{ownerId}/patients/new"
    },
    {
      "order": 2,
      "title": "Zorunlu alanları doldur",
      "description": "name, species, sex, birthDate alanları zorunlu.",
      "fields": ["name", "species", "sex", "birthDate"]
    }
  ],
  "relatedScenarios": ["owner_create", "appointment_create"],
  "duration_ms": 12
}
```

**Senaryo eşleşmediğinde:**

```json
{
  "matched": false,
  "title": "Sorunuzla eşleşen bir senaryo bulunamadı",
  "suggestion": "Daha spesifik bir soru sorun veya AI yardım asistanını deneyin.",
  "relatedScenarios": []
}
```

**Tıbbi red:**

```json
{
  "matched": false,
  "title": "Tıbbi sorular yanıtlanamaz",
  "refusal": "Bu asistan uygulama kullanımı içindir; tıbbi tavsiye için veteriner hekiminize danışın.",
  "relatedScenarios": []
}
```

**Hata kodları:**

- 400 `VET-VALIDATION-0001` — Geçersiz payload.
- 422 `VET-ONBOARD-0001` — Tıbbi soru reddedildi.

## Güvenlik

- **PII taşımaz:** Yalnızca public sayfa yolu + buton adı
  döner; asla hasta adı, TCKN, telefon vb. içermez.
- **Tıbbi red:** Tanı/teşhis/ilaç/doz soruları tespit edilir
  ve 422 ile reddedilir; kullanıcıya "veteriner hekiminize
  danışın" mesajı gösterilir.
- **Tenant bağlamı:** `actor.tenantId` log'a yazılır
  (PII mask'lı).

## İlgili dokümanlar

- `apps/api/src/modules/onboarding/onboarding.controller.ts`
- `apps/api/src/common/onboarding/onboarding.service.ts`
- `docs/workflows/` (workflow kataloğu)
- `docs/pages/` (sayfa kataloğu)
- `goals/GOAL-117_COMPLETION_REPORT.md`
