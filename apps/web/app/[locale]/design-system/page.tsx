/**
 * @file Stitch tasarım sistemi route'u.
 * @module @vetniva/web/app/[locale]/design-system
 * @description Uygulanan renk ve bileşen referanslarını görünür kılar.
 * @security Bu sayfa yalnızca statik tasarım tokenlarını sunar; klinik verisi işlemez.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function DesignSystemPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "design-system" });
}
