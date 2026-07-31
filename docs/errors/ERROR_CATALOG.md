# Hata Kodu Kataloğu

Bu katalog, VetNiva'nın tüm API ve UI hata kodlarını listeler. Her kod
sabit formatta ve benzersizdir: `VET-<MODULE>-<NNN>`
(ör. `VET-CLINIC-0001`). Tam format ve kurallar için
[`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) belgesine bakın.

`pnpm docs:check` CI kapısı, kod tabanında kullanılan hata kodlarının
bu katalogda yer almasını zorunlu kılar.

> **Göç (migration):** Eski `TR_<DOMAIN>_<NNN>` formatındaki kodlar
> bu listeye geçirilmiştir. Mapping tablosu için
> [ERROR_CODE_STANDARD.md §7](./ERROR_CODE_STANDARD.md#7-geçiş-migration--eski-formatlar)
> bölümüne bakın. Eski kodlar koddaki alias'lar olarak 6 ay boyunca
> desteklenir, ardından kaldırılır.

---

## Genel (COMMON)

| Kod                  | Ad                        | HTTP | Severity | Kaynak | Çözüm                                                                      |
| -------------------- | ------------------------- | ---- | -------- | ------ | -------------------------------------------------------------------------- |
| `VET-COMMON-0001`    | Beklenmeyen sunucu hatası | 500  | critical | server | Yeniden deneyin. Sorun sürerse correlation_id ile destek ekibine bildirin. |
| `VET-COMMON-0002`    | Bakım modu                | 503  | warning  | server | Bakım tamamlandığında tekrar deneyin.                                      |
| `VET-COMMON-0003`    | İstek zaman aşımı         | 504  | error    | server | Yeniden deneyin.                                                           |
| `VET-COMMON-0004`    | Rate limit aşıldı         | 429  | warning  | server | Bir süre bekleyip tekrar deneyin.                                          |
| `VET-COMMON-0005`    | Servis geçici kapalı      | 503  | error    | server | Birkaç dakika sonra tekrar deneyin.                                        |

## Doğrulama (VALIDATION)

| Kod                     | Ad                                | HTTP | Severity | Kaynak | Çözüm                                 |
| ----------------------- | --------------------------------- | ---- | -------- | ------ | ------------------------------------- |
| `VET-VALIDATION-0001`   | Form doğrulaması başarısız        | 422  | warning  | server | Alanları kontrol edip tekrar deneyin. |
| `VET-VALIDATION-0002`   | Zorunlu alan eksik                | 422  | warning  | server | Eksik alanı doldurun.                 |
| `VET-VALIDATION-0003`   | Geçersiz format                   | 422  | warning  | server | Alan biçimini kontrol edin.           |
| `VET-VALIDATION-0004`   | Geçersiz telefon numarası         | 422  | warning  | server | E.164 formatında girin.               |
| `VET-VALIDATION-0005`   | Geçersiz VKN                      | 422  | warning  | server | 10 haneli VKN girin.                  |
| `VET-VALIDATION-0006`   | Geçersiz TCKN                     | 422  | warning  | server | 11 haneli TCKN girin.                 |
| `VET-VALIDATION-0007`   | Geçersiz posta kodu               | 422  | warning  | server | Ülkeye uygun posta kodu girin.        |
| `VET-VALIDATION-0008`   | Geçersiz IBAN                     | 422  | warning  | server | IBAN formatını kontrol edin.          |
| `VET-VALIDATION-0009`   | Geçersiz tarih                    | 422  | warning  | server | Geçerli bir tarih girin.              |
| `VET-VALIDATION-0010`   | Geçersiz tutar                    | 422  | warning  | server | Pozitif ve 2 ondalık girin.           |

## Kimlik Doğrulama (AUTH)

| Kod                  | Ad                                    | HTTP | Severity | Kaynak | Çözüm                                            |
| -------------------- | ------------------------------------- | ---- | -------- | ------ | ------------------------------------------------ |
| `VET-AUTH-0001`      | Oturum geçersiz / kimlik doğrulama gerekli | 401  | warning  | server | Yeniden giriş yapın.                             |
| `VET-AUTH-0002`      | E-posta veya parola hatalı (genel)    | 401  | warning  | server | Bilgileri kontrol edip tekrar deneyin.           |
| `VET-AUTH-0003`      | Hesap geçici olarak kilitlendi        | 423  | error    | server | 15 dakika bekleyip tekrar deneyin.               |
| `VET-AUTH-0004`      | Sıfırlama token'ı geçersiz / süresi dolmuş | 400  | warning  | server | Yeni sıfırlama talebi gönderin.                  |
| `VET-AUTH-0005`      | Davet geçersiz / süresi dolmuş / çakışma | 400/409 | warning  | server | Davet bağlantısını yeniden talep edin.           |
| `VET-AUTH-0006`      | Şifre süresi dolmuş                   | 401  | info     | server | Şifre yenileme talebi gönderin (GOAL-012+).      |
| `VET-AUTH-0007`      | Parola politikasına uyumsuz           | 422  | warning  | server | En az 12 karakter; büyük/küçük harf ve rakam içermeli. |
| `VET-AUTH-0008`      | Yeni parola eskisiyle aynı            | 400  | warning  | server | Farklı bir parola seçin.                         |

## Yetkilendirme (AUTHZ)

| Kod                  | Ad                                | HTTP | Severity | Kaynak | Çözüm                                              |
| -------------------- | --------------------------------- | ---- | -------- | ------ | -------------------------------------------------- |
| `VET-AUTHZ-0001`     | Bu işlem için yetkiniz yok        | 403  | warning  | server | Yönetici ile iletişime geçin.                      |
| `VET-AUTHZ-0002`     | Cross-tenant erişim denemesi      | 404  | info     | server | (Sessizce 404 döner; bilgi sızdırmaz.)             |
| `VET-AUTHZ-0003`     | Bu kaynağa erişim yetkiniz yok    | 403  | warning  | server | İlgili modüle erişim yetkisi talep edin.           |
| `VET-AUTHZ-0004`     | Branches arası erişim reddedildi  | 403  | warning  | server | Yalnızca kendi şubenizdeki kayıtlara erişebilirsiniz. |
| `VET-AUTHZ-0005`     | Belirli rol gerekli               | 403  | warning  | server | Bu işlem için SUPERADMIN veya OWNER rolü gerekli.   |
| `VET-AUTHZ-0006`     | Tenant bağlamı zorunlu            | 403  | warning  | server | Bu işlem için aktif bir tenant üyeliği gerekli.   |

## RBAC (RBAC)

| Kod                  | Ad                                | HTTP | Severity | Kaynak | Çözüm                                              |
| -------------------- | --------------------------------- | ---- | -------- | ------ | -------------------------------------------------- |
| `VET-RBAC-0001`      | Tenant bulunamadı / kapalı        | 404  | warning  | server | Tenant kodunuzu kontrol edin.                      |
| `VET-RBAC-0002`      | Kullanıcı bulunamadı / arşivlenmiş | 404 | warning  | server | Kullanıcıyı yönetici üzerinden kontrol edin.       |
| `VET-RBAC-0003`      | Kendi rolünüze/üyeliğinize işlem yapamazsınız | 409 | warning | server | Başka bir yönetici bu işlemi yapmalı. |
| `VET-RBAC-0004`      | Son aktif OWNER iptal edilemez    | 409  | warning  | server | Önce başka bir aktif OWNER atayın.                |
| `VET-RBAC-0005`      | Branch hedef tenant'a ait değil   | 409  | warning  | server | Doğru branch seçin.                                |

## Modül / Feature Flag (MODULE)

| Kod                  | Ad                                | HTTP | Severity | Kaynak | Çözüm                                              |
| -------------------- | --------------------------------- | ---- | -------- | ------ | -------------------------------------------------- |
| `VET-MODULE-0001`    | Bu modül tenant için devre dışı   | 403  | warning  | server | Yönetici ile iletişime geçin veya SUPERADMIN'den modülü açmasını isteyin. |

## Tenant (TENANT)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                            |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------------------ |
| `VET-TENANT-0001`    | Tenant bulunamadı           | 404  | warning  | server | Tenant kodunuzu kontrol edin.                    |
| `VET-TENANT-0002`    | Tenant kapatılmış           | 403  | error    | server | Destek ekibi ile iletişime geçin.                |
| `VET-TENANT-0003`    | Aktif tenant seçilmemiş     | 401  | warning  | server | Aktif tenant seçin veya destek ekibine bildirin. |
| `VET-TENANT-0004`    | Tenant slug zaten kayıtlı   | 409  | warning  | server | Farklı bir slug seçin.                           |
| `VET-TENANT-0005`    | Tenant zaten kapatılmış     | 409  | warning  | server | Zaten kapalı; tekrar kapatılamaz.                 |

## Şube (BRANCH)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-BRANCH-0001`    | Şube bulunamadı             | 404  | warning  | server | Şube kodunuzu kontrol edin.          |
| `VET-BRANCH-0002`    | Şube pasif                  | 403  | warning  | server | Aktif şube seçin.                    |
| `VET-BRANCH-0003`    | Şube kodu zaten kayıtlı     | 409  | warning  | server | Farklı bir şube kodu seçin.          |
| `VET-BRANCH-0004`    | Şube zaten kapatılmış       | 409  | warning  | server | Zaten kapalı; tekrar arşivlenemez.   |

## Kullanıcı (USER)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-USER-0001`      | Kullanıcı bulunamadı        | 404  | warning  | server | Kullanıcı ID'sini kontrol edin.      |
| `VET-USER-0002`      | E-posta zaten kayıtlı       | 409  | warning  | server | Başka bir e-posta kullanın.          |
| `VET-USER-0003`      | Davet zaten gönderilmiş     | 409  | warning  | server | Mevcut daveti iptal edin.            |

## Rol (ROLE)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-ROLE-0001`      | Rol bulunamadı              | 404  | warning  | server | Rol adını kontrol edin.              |
| `VET-ROLE-0002`      | Sistem rolü silinemez       | 409  | error    | server | Sistem rollerini kaldıramazsınız.    |
| `VET-ROLE-0003`      | Yetki atanamaz (uyumsuz)    | 422  | warning  | server | Tenant'a uygun bir rol seçin.        |

## Ülke (COUNTRY)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                  |
| -------------------- | --------------------------- | ---- | -------- | ------ | -------------------------------------- |
| `VET-COUNTRY-0001`   | Desteklenmeyen ülke         | 422  | warning  | server | TR veya GB seçin.                      |
| `VET-COUNTRY-0002`   | Ülke adaptörü bulunamadı    | 500  | critical | server | Tenant ülke ayarını kontrol edin.      |

## Klinik (CLINIC) — Owner / Patient

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-CLINIC-0001`    | Hayvan bulunamadı           | 404  | warning  | server | Hayvan kaydını kontrol edin.         |
| `VET-CLINIC-0002`    | Sahip zaten kayıtlı         | 409  | warning  | server | Aynı telefonla kayıt var.            |
| `VET-CLINIC-0003`    | Mikroçip zaten kullanımda   | 409  | warning  | server | Mikroçip numarasını kontrol edin.    |
| `VET-CLINIC-0004`    | Tür izin verilmiyor         | 422  | warning  | server | Yalnızca kedi, köpek ve kuş desteklenir. |
| `VET-CLINIC-0005`    | Sahiplik devri başarısız    | 422  | warning  | server | Yeni sahip bilgilerini kontrol edin. |
| `VET-CLINIC-0006`    | Varlık durum çakışması / state geçişi | 409/422 | warning | server | (1) **Ownership:** aktif sahiplik zaten var (409). (2) **Waitlist:** `scheduled/cancelled/expired` kayıt üzerinde `notify/schedule/cancel` deneniyor (422). |
| `VET-CLINIC-0007`    | Aynı sahibe transfer no-op  | 422  | warning  | server | Yeni sahip mevcut sahiple aynı; farklı bir sahip seçin. |
| `VET-CLINIC-0008`    | Arşivli hayvana transfer    | 422  | warning  | server | Hasta arşivli; transfer kabul edilmez. |
| `VET-CLINIC-0009`    | reason=initial transfer red | 422  | warning  | server | reason=initial yalnızca ilk kayıtta kullanılır. |
| `VET-CLINIC-0010`    | Uyarı bulunamadı            | 404  | info     | server | Uyarı ID'sini kontrol edin veya arşivli olabilir. |
| `VET-CLINIC-0011`    | Aktif sahiplik bulunamadı   | 404  | warning  | server | Hastanın aktif sahiplik kaydı yok. |
| `VET-CLINIC-0099`    | Klinik genel hata           | 500  | critical | server | Yeniden deneyin.                     |

## Randevu (APPT)

| Kod                  | Ad                              | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | ------------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-APPT-0001`      | Geçersiz zaman aralığı          | 422  | warning  | server | Bitiş zamanı başlangıçtan sonra olmalı. |
| `VET-APPT-0002`      | Engellenen slot bulunamadı      | 404  | warning  | server | Block ID'yi kontrol edin (cross-tenant dahil). |
| `VET-APPT-0003`      | Geçersiz çalışma saati tanımı   | 422  | warning  | server | Aynı gün için tek saat bloğu ve endTime > startTime olmalı. |
| `VET-APPT-0004`      | Geçersiz tarih                  | 422  | warning  | server | Tarih `YYYY-MM-DD` formatında olmalı. |
| `VET-APPT-0005`      | Randevu slot çakışması          | 409  | warning  | server | Slot zaten rezerve edilmiş (booked) veya bloklu (blocked/mola/izin). Başka bir saat seçin. |
| `VET-APPT-0006`      | Geçersiz randevu durum geçişi   | 422  | warning  | server | İptal edilmiş veya tamamlanmış randevu güncellenemez / iptal edilemez / tamamlanamaz. |

## Muayene (EXAM)

| Kod                  | Ad                              | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | ------------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-EXAM-0001`      | Muayene bulunamadı              | 404  | warning  | server | Muayene ID'sini kontrol edin.        |
| `VET-EXAM-0002`      | Muayene imzalanmış, değiştirilemez | 409  | warning | server | Düzeltme için amendment açın.        |
| `VET-EXAM-0003`      | Muayene zaten tamamlanmış        | 409  | warning  | server | Tamamlanmış muayene yeniden açılamaz. |

## SOAP

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                              |
| -------------------- | --------------------------- | ---- | -------- | ------ | ---------------------------------- |
| `VET-SOAP-0001`      | SOAP notu bulunamadı        | 404  | warning  | server | SOAP notu ID'sini kontrol edin.    |
| `VET-SOAP-0002`      | SOAP notu imzalanmış        | 409  | warning  | server | Düzeltme için amendment açın.      |

## Teşhis (DIAG)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-DIAG-0001`      | Teşhis durumu geçersiz      | 409  | warning  | server | Teşhis durumu geçersiz. Önce aktif olmalı. |

## Klinik Order (ORDER)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-ORDER-0001`     | Order durumu geçersiz       | 409  | warning  | server | Order durumu geçersiz. Geçerli durumdan başka bir duruma geçilemez. |

## Aşı (VACC)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-VACC-0001`      | Aşı kaydı oluşturulamadı    | 500  | critical | server | Stok ve lot bilgilerini kontrol edin. |
| `VET-VACC-0002`      | Lot süresi dolmuş           | 422  | warning  | server | Yeni lotlu aşı seçin.                 |
| `VET-VACC-0003`      | Yetersiz stok               | 422  | warning  | server | Stok ekleme veya farklı lot kullanın. |
| `VET-VACC-0004`      | Aşı protokolü bulunamadı   | 404  | warning  | server | Protokol kataloğunu kontrol edin.    |
| `VET-VACC-0008`      | Aşı kaydı zaten iptal       | 409  | warning  | server | İptal edilmiş kayıt yeniden iptal edilemez. |

## Reçete (PRESC)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-PRESC-0001`     | Reçete bulunamadı           | 404  | warning  | server | Reçete ID'sini kontrol edin.         |
| `VET-PRESC-0002`     | Reçete süresi dolmuş        | 422  | warning  | server | Yeniden muayene yapın.               |
| `VET-PRESC-0003`     | Reçete dağıtılamaz          | 422  | warning  | server | Stok veya yetki sorunu olabilir.     |
| `VET-PRESC-0004`     | Reçete zaten iptal edilmiş  | 409  | warning  | server | İptal işlemi tekrar yapılamaz.       |

## Ameliyat (SURG)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-SURG-0001`      | Ameliyat bulunamadı         | 404  | warning  | server | Ameliyat ID'sini kontrol edin.       |
| `VET-SURG-0002`      | Onam formu eksik            | 422  | error    | server | Ameliyat öncesi onam alın.           |
| `VET-SURG-0003`      | Ameliyat başlatılamaz       | 422  | warning  | server | Anestezi onayı ve oda durumunu kontrol edin. |

## Anestezi (ANESTH)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-ANESTH-0001`    | Anestezi kaydı bulunamadı   | 404  | warning  | server | Anestezi ID'sini kontrol edin.       |
| `VET-ANESTH-0002`    | Anestezi riski çok yüksek   | 422  | error    | server | Ek değerlendirme gerekir.            |

## Yatış (HOSP)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-HOSP-0001`      | Yatış kaydı bulunamadı     | 404  | warning  | server | Yatış ID'sini kontrol edin.          |
| `VET-HOSP-0002`      | Kafes dolu                  | 409  | warning  | server | Başka bir kafes seçin.               |
| `VET-HOSP-0003`      | Taburcu edilemez            | 422  | warning  | server | Aktif order'ları kapatın.            |

## Laboratuvar (LAB)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-LAB-0001`       | Lab istemi bulunamadı       | 404  | warning  | server | İstem ID'sini kontrol edin.          |
| `VET-LAB-0002`       | Numune alınmamış            | 422  | warning  | server | Önce numune alın.                    |
| `VET-LAB-0003`       | Cihaz bağlantısı yok        | 502  | error    | server | Cihaz bağlantısını kontrol edin.     |
| `VET-LAB-0004`       | Sonuç referans aralık dışı  | 200  | warning  | server | (Uyarı; işlem başarılı.)            |

## Görüntüleme (IMAG)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-IMAG-0001`      | Görüntüleme istemi bulunamadı | 404 | warning | server | İstem ID'sini kontrol edin.          |
| `VET-IMAG-0002`      | DICOM yüklenemedi           | 500  | error    | server | Dosya bütünlüğünü kontrol edin.      |

## Stok (STOCK)

| Kod                  | Ad                              | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | ------------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-STOCK-0001`     | Stok hareketi bulunamadı        | 404  | warning  | server | Hareket ID'sini kontrol edin.        |
| `VET-STOCK-0002`     | Yetersiz stok (bakiye)          | 422  | warning  | server | Tedarik yapın veya farklı lot seçin. |
| `VET-STOCK-0003`     | Ürün bulunamadı                 | 404  | warning  | server | Ürün ID'sini kontrol edin.           |
| `VET-STOCK-0004`     | Stok hareketi tutarsız          | 500  | critical | server | Sayım düzeltmesi gerekir; destekle iletişime geçin. |
| `VET-STOCK-0005`     | Lot bulunamadı                  | 404  | warning  | server | Lot ID'sini kontrol edin.            |
| `VET-STOCK-0006`     | Arşivlenmiş lot                 | 409  | warning  | server | Farklı bir lot seçin veya arşivlemeyi kaldırın. |
| `VET-STOCK-0007`     | Neden (reason) zorunlu          | 422  | warning  | server | Sayım düzeltmesi/waste/reversal için neden girin. |
| `VET-STOCK-0008`     | Service ürünü için stok hareketi olamaz | 422 | warning | server | Hizmet türünde ürünler stoklanmaz. |
| `VET-STOCK-0009`     | Arşivlenmiş ürün                | 409  | warning  | server | Arşivli ürün için hareket oluşturulamaz. |
| `VET-STOCK-0010`     | Ters kayıt zaten var            | 409  | warning  | server | Orijinal hareket yalnızca bir kez tersine çevrilebilir. |
| `VET-STOCK-0011`     | Lot ile ürün eşleşmiyor         | 422  | warning  | server | Lot, doğru ürüne ait olmalı.        |
| `VET-STOCK-0012`     | Sistem hareketi source eksik    | 422  | warning  | server | sourceType ve sourceId zorunlu.      |

## Klinik Tüketim (CLINICAL_CONSUMPTION) — GOAL-066

| Kod                            | Ad                              | HTTP | Severity | Kaynak | Çözüm                                |
| ------------------------------ | ------------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-CLINICAL_CONSUMPTION-0001`| Tüketim kaydı bulunamadı        | 404  | warning  | server | Tüketim kaydı ID'sini kontrol edin.  |
| `VET-CLINICAL_CONSUMPTION-0002`| Geçersiz/sıfır tüketim miktarı  | 422  | warning  | server | Pozitif bir miktar girin.             |
| `VET-CLINICAL_CONSUMPTION-0003`| Vaccination için lot zorunlu    | 422  | warning  | server | Aşı uygulamasında her satır için lot girin. |
| `VET-CLINICAL_CONSUMPTION-0004`| Ürün/lot bulunamadı veya eşleşmiyor | 404/422 | warning | server | Ürün/lot ID'sini kontrol edin.     |
| `VET-CLINICAL_CONSUMPTION-0005`| İptal nedeni zorunlu            | 422  | warning  | server | cancelReason girin.                  |
| `VET-CLINICAL_CONSUMPTION-0006`| Tüketim zaten iptal edilmiş      | 409  | warning  | server | Yalnız aktif kayıtlar iptal edilebilir. |
| `VET-CLINICAL_CONSUMPTION-0007`| Arşivli/hizmet ürünü için tüketim olamaz | 409 | warning | server | Aktif ve stock türünde ürün kullanın. |

## Envanter (INVENTORY) — Depo, Raf, Lot

| Kod                  | Ad                              | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | ------------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-INV-0001`       | Depo bulunamadı                 | 404  | warning  | server | Depo ID'sini kontrol edin.           |
| `VET-INV-0002`       | Raf bulunamadı                  | 404  | warning  | server | Raf ID'sini kontrol edin.            |
| `VET-INV-0003`       | Lot bulunamadı                  | 404  | warning  | server | Lot ID'sini kontrol edin.            |
| `VET-INV-0004`       | Depo kodu zaten kayıtlı         | 409  | warning  | server | Farklı bir depo kodu kullanın.       |
| `VET-INV-0005`       | Raf kodu depoda zaten mevcut    | 409  | warning  | server | Farklı bir raf kodu kullanın.        |
| `VET-INV-0006`       | Lot numarası zaten mevcut       | 409  | warning  | server | Farklı bir lot numarası kullanın.    |
| `VET-INV-0007`       | Zaten arşivlenmiş               | 409  | warning  | server | Kayıt zaten arşivde.                 |
| `VET-INV-0008`       | Arşivli kayıt üzerinde işlem engellendi | 409 | warning | server | Önce arşivlemeyi kaldırın veya farklı bir kayıt kullanın. |
| `VET-INV-0009`       | Son kullanma tarihi geçmiş      | 422  | warning  | server | Gelecekte bir SKT girin.             |
| `VET-INV-0010`       | Aktif bağımlı kayıt var         | 409  | warning  | server | Önce bağımlı kayıtları arşivleyin.  |

## Petshop (PETSHOP) — Satış (SALE)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-SALE-0001`      | Satış bulunamadı            | 404  | warning  | server | Fiş numarasını kontrol edin.         |
| `VET-SALE-0002`      | Satış iade edilemez         | 422  | warning  | server | İade süresi geçmiş.                  |
| `VET-SALE-0003`      | Kasa açık değil             | 409  | warning  | server | Satış için kasa açın.                |

## Petshop — Ürün (PRODUCT)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-PRODUCT-0001`   | Ürün bulunamadı             | 404  | warning  | server | Barkod/ürün adını kontrol edin.      |
| `VET-PRODUCT-0002`   | Barkod zaten kayıtlı        | 409  | warning  | server | Farklı bir barkod kullanın.          |

## Petshop — Satış (PETSHOP)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-PETSHOP-0001`   | Petshop konfigürasyonu eksik | 500 | critical | server | Petshop ayarlarını kontrol edin.     |

## Ödeme (PAYMENT)

| Kod                  | Ad                              | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | ------------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-PAYMENT-0001`   | Ödeme bulunamadı                | 404  | warning  | server | Ödeme ID'sini kontrol edin.          |
| `VET-PAYMENT-0002`   | Ödeme sağlayıcı hatası          | 502  | error    | server | Birkaç dakika sonra tekrar deneyin.  |
| `VET-PAYMENT-0003`   | 3D Secure doğrulaması başarısız | 402  | warning  | server | Banka doğrulamasını tekrar yapın.    |
| `VET-PAYMENT-0004`   | Ödeme ters kayıt yapılamaz      | 422  | warning  | server | Ters kayıt süresi geçmiş olabilir.   |
| `VET-PAYMENT-0005`   | Tutar uyuşmuyor                 | 422  | warning  | server | Sepet tutarı ile ödeme tutarı eşit olmalı. |

## Kasa (CASH)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-CASH-0001`      | Kasa oturumu açık değil     | 409  | warning  | server | Önce kasa oturumu açın.              |
| `VET-CASH-0002`      | Kasa kapanmış                | 409  | warning  | server | Kasa zaten kapatılmış.               |
| `VET-CASH-0003`      | Kasa farkı eşleşmiyor        | 422  | error    | server | Sayım ve tahsilat tutarlarını kontrol edin. |

## Onam (CONSENT)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-CONSENT-0001`   | Onam formu bulunamadı       | 404  | warning  | server | Onam şablonunu kontrol edin.         |
| `VET-CONSENT-0002`   | Onam iptal edilemez         | 422  | warning  | server | İmzalı onam iptal edilemez.          |

## KVKK

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-KVKK-0001`      | KVKK silme talebi bulunamadı | 404 | warning | server | Talep ID'sini kontrol edin.          |
| `VET-KVKK-0002`      | KVKK talebi zaten işlenmiş  | 409  | warning  | server | Talep tekrar gönderilemez.           |
| `VET-KVKK-0003`      | Anonimleştirme başarısız    | 500  | critical | server | Manuel müdahale gerekir.             |

## Rapor (REPORT)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-REPORT-0001`    | Rapor oluşturulamadı        | 500  | error    | server | Parametreleri kontrol edin.          |
| `VET-REPORT-0002`    | Rapor verisi boş            | 422  | warning  | server | Tarih/aralık parametrelerini genişletin. |

## Audit (AUDIT)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-AUDIT-0001`     | Audit log yazılamadı        | 500  | critical | server | İşlem kritik; manuel müdahale gerekebilir. |
| `VET-AUDIT-0002`     | Audit sorgu hatası          | 500  | error    | server | Filtreleri kontrol edin.             |

## Dosya (FILE)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-FILE-0001`      | Dosya yüklenemedi           | 413  | warning  | server | Boyut sınırını kontrol edin.          |
| `VET-FILE-0002`      | Dosya tipi desteklenmiyor   | 415  | warning  | server | JPG, PNG, PDF desteklenir.           |
| `VET-FILE-0003`      | Dosya bulunamadı            | 404  | warning  | server | Dosya silinmiş olabilir.             |
| `VET-FILE-0004`      | Virüs tarama başarısız     | 422  | error    | server | Farklı bir dosya deneyin.            |
| `VET-FILE-0005`      | Dosya zaten arşivlenmiş     | 409  | warning  | server | Zaten arşivli; tekrar arşivlenemez.   |
| `VET-FILE-0006`      | Storage backend hatası      | 502  | error    | server | Storage sağlık kontrolü yapın.        |
| `VET-FILE-0007`      | Scan engine hatası          | 502  | error    | server | Scan servisinin sağlık durumunu kontrol edin. |
| `VET-FILE-0008`      | Signed URL üretilemedi      | 502  | error    | server | Birkaç dakika sonra tekrar deneyin.   |

## Bildirim (NOTIF)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-NOTIF-0001`     | Bildirim gönderilemedi      | 502  | error    | server | SMS/sağlayıcı durumunu kontrol edin. |
| `VET-NOTIF-0002`     | Şablon bulunamadı           | 404  | warning  | server | Bildirim şablonunu kontrol edin.     |

## Portal (PORTAL)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-PORTAL-0001`    | Portal daveti geçersiz      | 400  | warning  | server | Davet bağlantısını yenileyin.        |
| `VET-PORTAL-0002`    | Portal hesabı kilitli       | 423  | error    | server | Yönetici ile iletişime geçin.        |
| `VET-PORTAL-0006`    | Portal talebi geçersiz state | 422  | warning  | server | (1) **Appointment request**: `pending` dışı statüden `cancel/approve/reject` denemesi. (2) **Davet**: zaten `accepted | revoked` davet üzerinde işlem denemesi. |

## Entegrasyon (INTEGRATION)

| Kod                       | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| ------------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-INTEGRATION-0001`    | Dış servis yanıt vermedi   | 502  | error    | server | Birkaç dakika sonra tekrar deneyin.  |
| `VET-INTEGRATION-0002`    | Dış servis hatası           | 502  | error    | server | correlation_id ile destek ekibine bildirin. |
| `VET-INTEGRATION-0003`    | e-Fatura gönderilemedi      | 502  | error    | server | GİB entegrasyonunu kontrol edin.     |
| `VET-INTEGRATION-0004`    | SMS gönderilemedi           | 502  | error    | server | Sağlayıcı bakiyesini kontrol edin.  |
| `VET-INTEGRATION-0005`    | Ödeme sağlayıcı timeout     | 504  | error    | server | Tekrar deneyin; siparişi kontrol edin. |
| `VET-INTEGRATION-0006`    | Dış servis auth hatası      | 502  | critical | server | API anahtarını yenileyin.            |

## Background Job (JOB)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-JOB-0001`       | Job başlatılamadı           | 500  | critical | server | Redis bağlantısını kontrol edin.     |
| `VET-JOB-0002`       | Job tekrar limiti aşıldı    | 500  | error    | server | Manuel müdahale gerekir.             |
| `VET-JOB-0003`       | Job payload geçersiz        | 422  | error    | server | Job'u yeniden kuyruğa alın.          |

## Worker (WORKER)

| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |
| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |
| `VET-WORKER-0001`    | Worker process çöktü        | 500  | critical | server | Process yeniden başlatılır.          |
| `VET-WORKER-0002`    | Worker timeout              | 504  | error    | server | Job timeout artırılabilir.           |

---

## Ekleme kuralı

Yeni hata kodu eklemek için:

1. [`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) belgesinde
   modülün tanımlı olduğunu doğrula (yoksa ekle).
2. `ERROR_CATALOG.md`'ye yeni satır ekle (kod, ad, HTTP, severity, kaynak, çözüm).
3. `packages/contracts/src/error.ts` Zod şemasına ekle
   (regex `^VET-[A-Z]{2,12}-[0-9]{4}$`).
4. `packages/i18n/src/locales/tr-TR.json` (`error.<kod>`) ve
   `en-GB.json` aynı anahtarla çeviri ekle.
5. Backend'de `DomainError` veya response factory üzerinden kullan.
6. `pnpm docs:check` ve `pnpm i18n:check` çalıştır.

## İlgili dokümanlar

- [`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) — format,
  modül listesi, HTTP eşlemesi, geçiş planı.
- [`AUDIT_LOG_STANDARD.md`](./AUDIT_LOG_STANDARD.md) — audit event.
- [`LOG_STANDARD.md`](./LOG_STANDARD.md) — log türleri.
- [`CORRELATION_ID.md`](./CORRELATION_ID.md) — request ID.
- [`PII_MASKING.md`](./PII_MASKING.md) — PII maskeleme.
- [`AUDIT_EVENTS.yaml`](./AUDIT_EVENTS.yaml) — tüm audit event'leri.
