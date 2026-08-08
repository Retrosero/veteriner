/**
 * @file Stitch petshop ve POS route'u.
 * @module @vetniva/web/app/[locale]/petshop
 * @description Ürün listesi ve satış sepeti tasarımını sunar.
 * @security Stok bakiyesi doğrudan yazılmaz; gerçek satış stok hareketi üretir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function PetshopPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "petshop" });
}
