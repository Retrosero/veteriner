/**
 * @file Stitch muayene giriş route'u.
 * @module @vetniva/web/app/[locale]/consultation
 * @description Sol menüdeki Muayene bağlantısını aktif muayene tasarımına
 * yönlendirir; seçili kayıt için dinamik alt route kullanılır.
 * @security Gerçek muayene seçimi tenant, rol ve hasta erişim denetimi ile
 * yapılır; burada yalnızca Stitch görünüm iskeleti sunulur.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function ConsultationIndexPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "consultation-active" });
}
