/**
 * @file Stitch ayarlar giriş route'u.
 * @module @vetniva/web/app/[locale]/settings
 * @description Sol menüdeki Ayarlar bağlantısını klinik bilgileri ekranına
 * taşır; kullanıcı ayarları ayrı alt route'ta sunulur.
 * @security Klinik ayarları gerçek uygulamada tenant yöneticisi yetkisi ile
 * doğrulanır; bu görsel iskelet hassas veri sorgulamaz.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function SettingsPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "settings-clinic" });
}
