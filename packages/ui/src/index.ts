"use client";

/**
 * @file @vetniva/ui kök modülü.
 * @module @vetniva/ui
 * @description Paylaşılan UI bileşenlerinin dışa aktarım noktası.
 * Tüketen taraf (apps/web) yalnızca `@vetniva/ui` üzerinden bileşenlere erişir ve iç dosya yolları dışa aktarılmaz.
 * Next.js App Router uyumu için bu modül 'use client' ile işaretlenir ve tüm UI primitive'leri client component olarak çalışır.
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
