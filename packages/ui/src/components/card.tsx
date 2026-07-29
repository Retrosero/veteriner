/**
 * @file Card bileşeni.
 * @module @vetniva/ui/components/card
 *
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
        "rounded-lg border border-gray-200 bg-white shadow-sm",
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
        className={cn("border-b border-gray-200 px-4 py-3", className)}
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
      className={cn("text-base font-semibold text-gray-900", className)}
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
      className={cn("mt-1 text-sm text-gray-600", className)}
      {...rest}
    />
  );
});

export const CardBody = forwardRef<HTMLDivElement, CardProps>(function CardBody(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn("px-4 py-4", className)} {...rest} />;
});

export const CardFooter = forwardRef<HTMLDivElement, CardProps>(
  function CardFooter({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3",
          className,
        )}
        {...rest}
      />
    );
  },
);
