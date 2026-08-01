# GET /api/v1/onboarding/scenarios

Kullanıcının rolüne göre onboarding senaryolarını listeler.
`?modules=clinic,vaccinations` ile modül filtresi uygulanabilir.

- **Modül:** onboarding
- **Yetki:** Oturum açmış tüm kullanıcılar.
- **Audit:** `audit:onboarding.scenarios_list` (info).

**Query parametreleri:**

- `modules` (string) opsiyonel; virgülle ayrılmış modül listesi.
  Ör. `?modules=clinic,vaccinations`. Boş bırakılırsa tüm
  modüller.

**Response 200 (`OnboardingScenarioListResponse`):**

```json
{
  "role": "VETERINARIAN",
  "scenarios": [
    {
      "scenarioId": "patient_create",
      "title": "Hayvan Ekleme (Patient Create)",
      "module": "clinic",
      "summary": "Yeni hasta kaydı oluşturma adımları.",
      "stepCount": 8,
      "estimatedMinutes": 5
    },
    {
      "scenarioId": "examination_start",
      "title": "Muayene Başlatma (Examination Start)",
      "module": "clinic",
      "summary": "Muayene açma + SOAP/vital/teşhis alt akışları.",
      "stepCount": 12,
      "estimatedMinutes": 15
    }
  ],
  "total": 12
}
```

**Hata kodları:**

- 400 `VET-VALIDATION-0001` — Geçersiz `modules` parametresi.

## Davranış

- **Role filtreleme:** Aktörün rolü (`OWNER | VETERINARIAN |
STAFF | PET_OWNER_PORTAL`) ne ise yalnızca o role
  uygun senaryolar döner. SUPERADMIN tüm senaryoları görür.
- **Modül filtreleme:** Belirtilen modüllere sahip
  senaryolar filtrelenir. Geçersiz modül adları yok sayılır.
- **Sıralama:** Senaryolar modül adına + step count'a göre
  sıralanır.

## İlgili dokümanlar

- `apps/api/src/modules/onboarding/onboarding.controller.ts`
- `goals/GOAL-117_COMPLETION_REPORT.md`
