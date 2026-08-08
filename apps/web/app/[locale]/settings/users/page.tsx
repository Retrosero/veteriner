/**
 * @file Stitch kullanıcı ayarları route'u.
 * @module @vetniva/web/app/[locale]/settings/users
 * @description Kullanıcı, rol ve erişim tasarımını sunar.
 * @security Kullanıcı yönetimi yalnızca uygun yetkideki tenant yöneticisine açıktır.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function SettingsUsersPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "settings-users" });
}
