/**
 * @file Stitch imzalanmış muayene route'u.
 * @module @vetniva/web/app/[locale]/consultation/[id]/signed
 * @description İmzalanmış ve salt okunur klinik kayıt görünümünü sunar.
 * @security İmzalanmış kayıtlar doğrudan değiştirilemez; düzeltme amendment ile yapılır.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function SignedConsultationPage(props: {
  params:
    Promise<{ locale: string; id: string }> | { locale: string; id: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({
    params: Promise.resolve(props.params).then(({ locale }) => ({ locale })),
    screen: "consultation-signed",
  });
}
