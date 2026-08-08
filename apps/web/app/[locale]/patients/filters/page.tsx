/**
 * @file Açık hasta filtreleri Stitch ekranı route'u.
 * @module @vetniva/web/app/[locale]/patients/filters
 * @description Hasta filtre popover'ının açık durumunu gösterir.
 * @security Filtreler tenant bağlamında değerlendirilmelidir; bu demo route
 * herhangi bir hasta verisi sorgulamaz.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function PatientFiltersPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "patients-filtered" });
}
