# Resmî Veteriner Sistemleri Adapter (GOAL-134)

## Faz

FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Amaç

Türkiye'deki resmî veteriner sistemlerine zorunlu veri
aktarımı:

- **Türkvet** (T.C. Tarım ve Orman Bakanlığı): kedi/köpek
  aşı + mikroçip + sahiplik kayıtları.
- **PETVET** (TVHB): muayene + tedavi kayıtları (opsiyonel).
- **İl/İlçe Tarım Müdürlükleri** yerel API'ler.

## Yasal Dayanak

- **5996 sayılı Veteriner Hizmetleri, Bitki Sağlığı, Gıda
  ve Yem Kanunu.**
- **Kedi ve Köpek Kimliklendirme Yönetmeliği**
  (Resmi Gazete, 22.01.2021 tarihli).
- Sahipli kedi/köpekler 4 ay içinde mikroçip + aşı
  kaydı zorunlu.

## Adapter Sözleşmesi

`apps/api/src/common/integrations/veterinary/registry.adapter.ts`'te
tanımlı. `VeterinaryRegistryAdapter` interface'i:

```typescript
interface VeterinaryRegistryAdapter {
  readonly name: VeterinaryRegistry; // "turkveteriner" | "petvet" | "il_tarim"
  submit(
    records: RegistryRecord[],
    actor: ActorContext,
  ): Promise<RegistrySubmitResult[]>;
  query(externalId: string): Promise<RegistrySubmitResult>;
}
```

## Kayıt Türleri

| Tip           | Açıklama                    | Sıklık               |
| ------------- | --------------------------- | -------------------- |
| `vaccination` | Aşı uygulaması kaydı        | her uygulamada       |
| `microchip`   | Mikroçip implantasyonu      | implantasyon sonrası |
| `ownership`   | Sahiplik devri              | transfer sonrası     |
| `examination` | Muayene kaydı (PETVET için) | her muayene          |
| `death`       | Ölüm kaydı                  | ölüm sonrası         |

## İş Akışı

1. **Trigger:** aşı uygulaması / mikroçip / sahiplik
   devri / muayene tamamlanması.
2. **Batch:** Günlük 03:00 UTC'de toplu aktarım
   (BullMQ cron).
3. **Single:** Acil durumda (örn. sahiplik devri) anlık
   aktarım.
4. **API çağrısı:** XML/JSON payload; provider'ın
   authentication'ı (API key veya mTLS).
5. **Response:** `externalId` local'de saklanır; status
   `accepted | rejected | pending_review`.
6. **Retry:** 3 deneme (exponential backoff 1h, 6h, 24h).

## Veri Şeması (ortak)

```typescript
interface RegistryRecord {
  id: string; // local ID
  type: RegistryRecordType;
  patientMicrochip: string; // 15 hane ISO
  patientSpecies: "dog" | "cat" | "bird";
  ownerFullName: string;
  ownerPhone: string;
  ownerIdentityNumber: string; // TCKN
  veterinarianLicenseNumber: string; // Veteriner Hekim Sicil No
  occurredAt: string; // ISO datetime
  payload: Record<string, unknown>;
}
```

## Provider Konfigürasyonu

```env
VETERINARY_REGISTRY_PROVIDER=turkveteriner
TURKVETERINER_API_URL=https://api.tarimorman.gov.tr/v1
TURKVETERINER_API_KEY=xxx
TURKVETERINER_CLIENT_ID=xxx
```

## Audit (zorunlu)

- `audit:veterinary_registry.submitted` (info).
- `audit:veterinary_registry.rejected` (warning).
- Append-only (5 yıl saklama, KVKK gereği).

## Güvenlik

- **TLS 1.3** zorunlu.
- **mTLS** (client certificate) önerilir.
- **API key rotation:** 90 günde bir.
- **Rate limit:** 10 req/saat (provider bazında).

## Testler

- **Mock provider:** development + test.
- **Sandbox (varsa):** staging.
- **Production:** pilot onayından sonra + Gİb/Bakanlık
  onayı.

## Yapılmayanlar / Bilinçli Atlamalar

- **Hayvan sağlığı sertifikaları (aşı pasaportu PDF)** →
  Faz 14+ (mevcut `clinic-record-share.ts` kullanılabilir).
- **Antibiyotik kullanım raporu (resmî)** → Faz 14+.
- **İhracat sertifikası** → Faz 14+ (FAZ-9 lab adapter
  ile birlikte).

## Commit

- Core: (bu commit) — `apps/api/src/common/integrations/veterinary/registry.adapter.ts`
- Real: Faz 14+ (Bakanlık onayı + Gİb entegrasyonu).
