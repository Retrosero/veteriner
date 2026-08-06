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
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      tone: {
        success: "bg-[#EAF6EC] text-[#248A3D]",
        warning: "bg-[#FFF4E5] text-[#B86B00]",
        danger: "bg-[#FCEBEA] text-[#C3362C]",
        info: "bg-[#EAF3FB] text-[#2775B6]",
        neutral: "bg-[#F1F5F1] text-[#5F6368]",
      },
      size: {
        sm: "px-2 text-[11px]",
        md: "px-2.5 text-xs",
        lg: "px-3 py-1 text-sm",
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
