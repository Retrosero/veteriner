"use client";

/**
 * @file @vetniva/ui kök modülü.
 * @module @vetniva/ui
 *
 * @description Paylaşılan UI bileşenlerinin dışa aktarım noktası.
 * Tüketen taraf (apps/web) yalnızca `@vetniva/ui` üzerinden bileşenlere
 * erişir; iç dosya yolları dışa aktarılmaz.
 *
 * Not: Bu modül Next.js App Router ile uyumlu olacak şekilde 'use
 * client' ile işaretlenmiştir. Tüm UI primitive'leri client component
 * olarak çalışır (forwardRef, useState vb. kullanıldığı için).
 */

export { Button, type ButtonProps } from "./components/button.js";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  CardFooter,
  type CardProps,
} from "./components/card.js";
export { Input, type InputProps } from "./components/input.js";
export { Badge, type BadgeProps } from "./components/badge.js";
export { Avatar, type AvatarProps } from "./components/avatar.js";
export { cn } from "./lib/cn.js";
