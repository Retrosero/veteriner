/**
 * @file Server-safe `cn` re-export.
 * @module @vetniva/ui/cn
 *
 * @description `packages/ui/src/lib/cn.ts` modülünü doğrudan dışa
 * aktaran kök dosya. `@vetniva/ui` paketinin kök modülü
 * (`@vetniva/ui`) "use client" ile işaretli olduğundan, server
 * component'lerden (RSC, route handler, server action) `cn` çağrısı
 * `undefined` döner. Bu modül "use client" içermediğinden server
 * bundle'ında doğrudan çalışır.
 *
 * Kullanım:
 * ```tsx
 * // Server component
 * import { cn } from "@vetniva/ui/cn";
 * ```
 *
 * `@vetniva/ui` paketinin kök modülü yalnızca client component'ler
 * tarafından (Button, Card, Badge, ...) import edilmelidir.
 */

export { cn } from "./lib/cn.js";
