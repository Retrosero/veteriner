/**
 * @file Locale (dil) sözleşmesi.
 * @module @vetniva/contracts/locale
 *
 * @description Desteklenen diller ve BCP-47 format etiketleri. Türkiye için
 * `tr-TR`, İngiltere için `en-GB` zorunludur. GOAL-000 yalnızca tr-TR
 * anahtarlarını zorunlu kılar; en-GB iskelet olarak bırakılır ve Faz 14'te
 * doldurulur.
 */
import { z } from "zod";
/**
 * Desteklenen locale etiketleri. BCP-47 formatı. Yeni locale eklemek için
 * `SUPPORTED_LOCALES` env değişkenine eklenmeli, i18n dosyaları
 * oluşturulmalı ve bu enum güncellenmelidir.
 */
export declare const localeSchema: z.ZodEnum<["tr-TR", "en-GB"]>;
export type Locale = z.infer<typeof localeSchema>;
export declare const SUPPORTED_LOCALES: ["tr-TR", "en-GB"];
/**
 * Varsayılan locale. Tenant ayarı olmadığında bu değer kullanılır.
 */
export declare const DEFAULT_LOCALE: Locale;
//# sourceMappingURL=locale.d.ts.map
