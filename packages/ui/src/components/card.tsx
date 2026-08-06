/**
 * @file Card bileşeni.
 * @module @vetniva/ui/components/card
 * @description Klinik listeleri ve form konteynerleri için standart kart.
 * Bölümler: Header, Title, Description, Body, Footer. Tüm bölümler
 * opsiyoneldir; minimal kullanım yalnızca `<Card>{...}</Card>`.
 *
 * Not: MVP-1'de yalnızca light tema. Faz 11'de tema varyantları
 * (dark / yüksek kontrast) eklenecek; bu aşamada `dark:` prefix'leri
 * kullanılmaz.
 */

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[14px] border border-[#E1E5E2] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
      {...rest}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, CardProps>(
  function CardHeader({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn("border-b border-[#ECEFED] px-5 py-4", className)}
        {...rest}
      />
    );
  },
);

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...rest }, ref) {
  return (
    <h3
      ref={ref}
      className={cn("text-[17px] font-semibold text-[#1D1D1F]", className)}
      {...rest}
    />
  );
});

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...rest }, ref) {
  return (
    <p
      ref={ref}
      className={cn("mt-1 text-sm text-[#5F6368]", className)}
      {...rest}
    />
  );
});

export const CardBody = forwardRef<HTMLDivElement, CardProps>(function CardBody(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn("px-5 py-5", className)} {...rest} />;
});

export const CardFooter = forwardRef<HTMLDivElement, CardProps>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-end gap-2 border-t border-[#ECEFED] px-5 py-4",
          className,
        )}
        {...rest}
      />
    );
  },
);
