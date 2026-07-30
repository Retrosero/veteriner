/**
 * @file VetNiva paylaşılan sözleşmeler kök modülü.
 * @module @vetniva/contracts
 *
 * @description Bu modül API ile frontend arasındaki tek doğruluk kaynağıdır.
 * Yeni bir API endpoint'i eklendiğinde, ilgili Zod şeması ve tipleri burada
 * tanımlanmalıdır. Hem backend (request/response doğrulama) hem de frontend
 * (form/typing) bu tipleri tüketir.
 *
 * @security Sözleşmeler PII içermez; yalnızca alan isimleri ve tipleri.
 * Sözleşme değişikliği geriye dönük uyumluluk gerektirir; aksi halde
 * major version bump yapılmalıdır.
 */

export * from "./health.js";
export * from "./error.js";
export * from "./locale.js";
export * from "./tenant.js";
export * from "./branch.js";
export * from "./auth.js";
export * from "./rbac.js";
export * from "./module.js";
export * from "./file.js";
export * from "./notification.js";
export * from "./superadmin.js";
export * from "./owner.js";
export * from "./patient.js";
export * from "./ownership.js";
export * from "./alert.js";
export * from "./timeline.js";
export * from "./portal.js";
export * from "./calendar.js";
