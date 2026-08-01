/**
 * @file Avatar primitive.
 * @module @vetniva/ui/components/avatar
 * @description Kullanıcı veya hayvan görseli için yuvarlak avatar.
 * Görsel URL yoksa baş harfler (initials) gösterilir. Üç boyut ve
 * iki ton (renkli / gri) destekler.
 * @security Avatar görseli kullanıcı tarafından yüklenebilir; bu
 * durumda CDN üzerinden getirilmesi ve virus tarama gerekir. GOAL-001+
 * ile birlikte bu akış devreye girer.
 */

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

const sizeClasses = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

const toneClasses = {
  clinic: "bg-clinic-100 text-clinic-800",
  neutral: "bg-gray-100 text-gray-700",
} as const;

export type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  src?: string;
  alt?: string;
  initials?: string;
  size?: keyof typeof sizeClasses;
  tone?: keyof typeof toneClasses;
};

/**
 * İki harflik (veya tek harflik) baş harfleri üretir. Ad ve
 * soyadın baş harfleri; yalnız ad varsa adın baş harfi.
 * @param {string | undefined} name Baş harfleri üretilecek ad.
 * @returns {string} Gösterime uygun bir veya iki harfli metin.
 */
function deriveInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const first = parts[0];
    if (!first) return "?";
    return first.slice(0, 1).toUpperCase();
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last) return "?";
  return (first[0] ?? "").toUpperCase() + (last[0] ?? "").toUpperCase();
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { className, src, alt, initials, size = "md", tone = "clinic", ...rest },
  ref,
) {
  if (src) {
    return (
      <img
        ref={ref as unknown as React.Ref<HTMLImageElement>}
        src={src}
        alt={alt ?? ""}
        className={cn(
          "inline-block rounded-full object-cover",
          // size kapalı union olduğu için dış girdiden property injection
          // yapılamaz; değer statik Tailwind sınıf haritasından seçilir.
          // eslint-disable-next-line security/detect-object-injection
          sizeClasses[size],
          className,
        )}
        {...rest}
      />
    );
  }

  return (
    <span
      ref={ref}
      role="img"
      aria-label={alt}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        // size ve tone kapalı union'lardır; haritalar sabittir.
        // eslint-disable-next-line security/detect-object-injection
        sizeClasses[size],
        // eslint-disable-next-line security/detect-object-injection
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {deriveInitials(initials ?? alt)}
    </span>
  );
});
