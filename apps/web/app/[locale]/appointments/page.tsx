/**
 * @file Randevu tasarım ekranı route'u.
 * @module @vetniva/web/app/[locale]/appointments
 * @description Günlük randevu görünümünü Stitch tasarım diliyle sunar.
 * @security Gerçek randevular yalnızca doğrulanmış tenant ve yetki bağlamında
 * okunur veya değiştirilir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function AppointmentsPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "appointments" });
}
