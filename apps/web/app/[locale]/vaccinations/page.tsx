/**
 * @file Aşı tasarım ekranı route'u.
 * @module @vetniva/web/app/[locale]/vaccinations
 * @description Aşı takvimi ve yaklaşan uygulamaları Stitch tasarım diliyle sunar.
 * @security Gerçek uygulamalar tenant bağlamı, ürün lotu ve audit kurallarıyla işlenir.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function VaccinationsPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "vaccinations" });
}
