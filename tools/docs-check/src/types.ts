/**
 * @file Denetleyici tipleri.
 * @module @vetniva/docs-check/types
 *
 * @description Route, hata kodu, permission, AI chunk ve
 * issue tipleri. GOAL-004 ile VET- formatı, GOAL-005 ile
 * AI chunks desteği eklendi.
 */

export type RouteInfo = {
  path: string;
  docKey: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined;
};

export type Issue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type DocInventory = {
  pageFiles: Set<string>;
  apiFiles: Set<string>;
  errorCodes: Set<string>;
  permissions: Set<string>;
  aiChunks: Set<string>;
};
