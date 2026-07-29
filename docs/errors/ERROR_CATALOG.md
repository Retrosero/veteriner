# Hata Kodu Kataloğu

Bu katalog, VetNiva'nın tüm API ve UI hata kodlarını listeler. Her kod
sabit formatta ve benzersizdir: `<ülke>_<domain>_<sıra>` (ör. `TR_COMMON_0001`).

`pnpm docs:check` CI kapısı, kod tabanında kullanılan hata kodlarının
bu katalogda yer almasını zorunlu kılar.

## Genel (COMMON)

| Kod              | Ad                        | HTTP | Kaynak | Çözüm                                                                      |
| ---------------- | ------------------------- | ---- | ------ | -------------------------------------------------------------------------- |
| `TR_COMMON_0001` | Beklenmeyen sunucu hatası | 500  | server | Yeniden deneyin. Sorun sürerse correlation_id ile destek ekibine bildirin. |
| `TR_COMMON_0002` | Erişim reddedildi         | 403  | server | Oturum açın veya gerekli izni talep edin.                                  |
| `TR_COMMON_0003` | Yetkisiz işlem            | 403  | server | Bu işlem için yetkiniz yok. Yönetici ile iletişime geçin.                  |
| `TR_COMMON_0004` | İstek zaman aşımı         | 504  | server | Yeniden deneyin.                                                           |
| `TR_COMMON_0005` | Bakım modu                | 503  | server | Bakım tamamlandığında tekrar deneyin.                                      |

## Doğrulama (VALIDATION)

| Kod                  | Ad                         | HTTP | Kaynak | Çözüm                                 |
| -------------------- | -------------------------- | ---- | ------ | ------------------------------------- |
| `TR_VALIDATION_0001` | Form doğrulaması başarısız | 422  | server | Alanları kontrol edip tekrar deneyin. |
| `TR_VALIDATION_0002` | Zorunlu alan eksik         | 422  | server | Eksik alanı doldurun.                 |
| `TR_VALIDATION_0003` | Geçersiz format            | 422  | server | Alan biçimini kontrol edin.           |

## Auth (AUTH) — GOAL-001

| Kod            | Ad                                 | HTTP | Kaynak | Çözüm                                            |
| -------------- | ---------------------------------- | ---- | ------ | ------------------------------------------------ |
| `TR_AUTH_0001` | Oturum geçersiz veya süresi dolmuş | 401  | server | Yeniden giriş yapın.                             |
| `TR_AUTH_0002` | Davet kodu geçersiz                | 400  | server | Davet bağlantısını yeniden talep edin.           |
| `TR_AUTH_0003` | Tenant bağlamı yok                 | 401  | server | Aktif tenant seçin veya destek ekibine bildirin. |

## Klinik (CLINIC) — GOAL-002+

| Kod              | Ad                        | HTTP | Kaynak | Çözüm                                                                      |
| ---------------- | ------------------------- | ---- | ------ | -------------------------------------------------------------------------- |
| `TR_CLINIC_0001` | Hayvan bulunamadı         | 404  | server | Hayvan kaydını kontrol edin.                                               |
| `TR_CLINIC_0002` | Sahip zaten kayıtlı       | 409  | server | Aynı telefonla kayıt var.                                                  |
| `TR_CLINIC_0003` | Mikroçip zaten kullanımda | 409  | server | Mikroçip numarasını kontrol edin.                                          |
| `TR_CLINIC_0004` | Tür izin verilmiyor       | 422  | server | Yalnızca kedi, köpek ve kuş desteklenir.                                   |
| `TR_CLINIC_0042` | Klinik genel hata         | 500  | server | Yeniden deneyin. Sorun sürerse correlation_id ile destek ekibine bildirin. |
| `EN_CLINIC_0001` | Patient not found (en-GB) | 404  | server | Verify the patient record.                                                 |

## Aşı (VACCINATION) — GOAL-003

| Kod            | Ad                       | HTTP | Kaynak | Çözüm                                 |
| -------------- | ------------------------ | ---- | ------ | ------------------------------------- |
| `TR_VACC_0001` | Aşı kaydı oluşturulamadı | 500  | server | Stok ve lot bilgilerini kontrol edin. |
| `TR_VACC_0002` | Lot süresi dolmuş        | 422  | server | Yeni lotlu aşı seçin.                 |
| `TR_VACC_0003` | Yetersiz stok            | 422  | server | Stok ekleme veya farklı lot kullanın. |

## Ödeme (PAYMENT) — Faz 7

(İleride doldurulacak.)

## Entegrasyon (INTEGRATION) — Faz 13

(İleride doldurulacak.)

## Ekleme kuralı

Yeni hata kodu eklemek için:

1. `packages/contracts/src/error.ts` içinde sabit enum'a ekle.
2. `packages/i18n/src/locales/tr-TR.json` (`errors.<code>`) ve `en-GB.json`
   aynı anahtarla çeviri ekle.
3. Bu katalogda ilgili domain bölümüne satır ekle.
4. Backend'de `DomainError` veya response factory üzerinden kullan.
5. `pnpm docs:check` ve `pnpm i18n:check` çalıştır.
