/**
 * @file Stitch aktif muayene route'u.
 * @module @vetniva/web/app/[locale]/consultation/[id]
 * @description Aktif muayene kayıt ekranının görsel düzenini sunar.
 * @security Klinik kayıt erişimi tenant, rol ve hasta erişim denetimine bağlıdır.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function ConsultationPage(props: {
  params:
    Promise<{ locale: string; id: string }> | { locale: string; id: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({
    params: Promise.resolve(props.params).then(({ locale }) => ({ locale })),
    screen: "consultation-active",
  });
}
