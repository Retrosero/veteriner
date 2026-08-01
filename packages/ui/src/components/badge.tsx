/**
 * @file Badge / status pill primitive.
 * @module @vetniva/ui/components/badge
 * @description Küçük durum rozeti. Renk semantiği:
 * - `success`: yeşil ton (olumlu, çalışıyor, onaylandı)
 * - `warning`: sarı ton (beklemede, uyarı, dikkat)
 * - `danger`: kırmızı ton (hata, çalışmıyor, kritik)
 * - `info`: mavi ton (bilgi, nötr)
 * - `neutral`: gri ton (ikincil bilgi).
 *
 * Hem dolu (`solid`) hem de yumuşak (`soft`) varyant destekler.
 * @security Hassas durum etiketleri (hata kodu, PII) gövdeye
 * yerleştirilmez; yalnızca semantik kategori.
 */

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      tone: {
        success:
          "bg-success-50 text-success-700 ring-1 ring-inset ring-success-500/20",
        warning: "bg-warn-50 text-warn-700 ring-1 ring-inset ring-warn-500/20",
        danger:
          "bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-500/20",
        info: "bg-clinic-50 text-clinic-800 ring-1 ring-inset ring-clinic-500/20",
        neutral: "bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-300/30",
      },
      size: {
        sm: "px-1.5 text-[10px]",
        md: "px-2 text-xs",
        lg: "px-2.5 py-0.5 text-sm",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /**
     * Başlıkta gösterilecek küçük ikon (opsiyonel). Boyut tone ile
     * otomatik ölçeklenir.
     */
    icon?: React.ReactNode;
  };

/**
 * Renk ve boyut varyantına göre stilize edilmiş rozet. Klavye
 * etkileşimi yok; sadece görsel etiket.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone, size, icon, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone, size }), className)}
      {...rest}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
});
