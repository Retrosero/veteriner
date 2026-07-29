/**
 * @file `cn` yardımcı fonksiyonu.
 * @module @vetniva/ui/lib/cn
 *
 * @description clsx + tailwind-merge birleştiricisi. Çakışan Tailwind
 * sınıflarını doğru biçimde çözer (ör. `p-2 p-4` → `p-4`).
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
