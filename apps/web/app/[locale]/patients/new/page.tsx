/**
 * @file Stitch yeni hasta kaydı route'u.
 * @module @vetniva/web/app/[locale]/patients/new
 * @description Sahip ve hayvan kayıt formunun görsel iskeletini sunar.
 * @security Kaydetme işlemi, tenant ve yetki doğrulaması olmadan yapılmaz.
 */

import { StitchScreenPage } from "@/components/stitch/stitch-screen-page";

export default function NewPatientPage(props: {
  params: Promise<{ locale: string }> | { locale: string };
}): Promise<JSX.Element> {
  return StitchScreenPage({ ...props, screen: "patient-new" });
}
