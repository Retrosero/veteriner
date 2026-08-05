/**
 * @file Retention modülü için paylaşılan etiket tipleri.
 * @module @vetniva/web/components/superadmin/retention-labels
 * @description `apps/web/src/lib/labels.ts` içindeki `retention`
 * namespace'inin tip tanımı. Birden fazla komponentin (tabs, form,
 * modal) aynı labels nesnesini parametre olarak alması gerektiğinden
 * ortak tip burada toplanır. labels.ts'teki gerçek değerlerle
 * senkron tutulur; değer değişirse türetilmiş tip kırılır (TS strict).
 * @security UI string'leri yalnızca public metin; PII içermez.
 */

import type { Labels } from "@/lib/labels";

/**
 * `labels.retention` altındaki tüm çevirilerin tipi. Modal/form
 * komponentleri bu tipi prop olarak kabul eder; tabs komponenti
 * `getLabels(locale).retention` ile bu tipte bir nesne geçirir.
 * `Labels` tipi `typeof tr` olduğu için Türkçe literal'lerine
 * bağlıdır; en-GB sözlüğü `as unknown as Labels` ile zorlandığından
 * yapısal olarak eşleşmesi bu tip üzerinden kontrol edilir.
 */
export type RetentionLabels = Labels["retention"];
