/**
 * @file Stitch finans yönetimi route'u.
 * @module @vetniva/web/app/[locale]/finance
 * @description Tahsilat ve işlem özeti tasarımını uygulama kabuğunda sunar.
 * @security Para hareketleri tenant bağlamında idempotent ve append-only işlenir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function FinancePage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "finance" });
}
