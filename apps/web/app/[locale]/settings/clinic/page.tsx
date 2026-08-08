/**
 * @file Stitch klinik ayarları route'u.
 * @module @vetniva/web/app/[locale]/settings/clinic
 * @description Klinik kimliği ve bölgesel ayarların tasarımını sunar.
 * @security Klinik bilgileri yalnızca doğrulanmış tenant yönetim bağlamında güncellenir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function SettingsClinicPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "settings-clinic" });
}
