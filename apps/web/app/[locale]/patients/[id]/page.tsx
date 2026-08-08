/**
 * @file Stitch hasta detay route'u.
 * @module @vetniva/web/app/[locale]/patients/[id]
 * @description Hasta özeti ve klinik zaman çizelgesi tasarımını sunar.
 * @security Kimlik parametresi kayıt erişimi vermez; gerçek sorgu tenant ile filtrelenir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function PatientDetailPage(props: {
  params:
    Promise<{ locale: string; id: string }> | { locale: string; id: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({
    params: Promise.resolve(props.params).then(({ locale }) => ({ locale })),
    screen: "patient-detail",
  });
}
