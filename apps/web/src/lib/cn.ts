/**
 * @file `cn` yardımcı re-export.
 * @module @vetniva/web/lib/cn
 * @description Server component'lerden `cn` fonksiyonuna erişim
 * için `@vetniva/ui/cn` modülünü re-export eder. Kök
 * `@vetniva/ui` modülü "use client" ile işaretli olduğundan
 * server bundle'ında `cn` undefined gelir; bu re-export bu
 * sorunu çözer.
 */

export { cn } from "@vetniva/ui/cn";
