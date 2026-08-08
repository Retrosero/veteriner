/**
 * @file Stitch hasta listesi route'u.
 * @module @vetniva/web/app/[locale]/patients
 * @description Hasta arama ve liste tasarımını uygulama kabuğunda sunar.
 * @security Gerçek hasta verisi, doğrulanmış oturumun tenant bağlamından gelir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function PatientsPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "patients" });
}
