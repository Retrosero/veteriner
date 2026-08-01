/**
 * @file Sayfa başlığı bileşeni.
 * @module @vetniva/web/components/ui/page-header
 * @description Her sayfanın üstünde tekrarlanan başlık bloğu.
 * Başlık, alt başlık, breadcrumb ve sağ tarafta aksiyon
 * butonları içerir. AppShell ile birlikte kullanıldığında sadece
 * başlık + breadcrumb gösterilir (TopBar zaten page title içerir).
 *
 * Erişilebilirlik:
 * - `<header>` semantiği
 * - `aria-label` her bölümde
 * - Breadcrumb: `<nav aria-label="Breadcrumb">` + ordered list
 * - Başlık `<h2>` (AppShell'deki `<h1>` page title için ayrılmıştır).
 * @security Breadcrumb tenant-aware olabilir; tenant slug burada
 * gösterilir.
 */

import { cn } from "@vetniva/ui/cn";
import Link from "next/link";
import { type ReactNode } from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
};

/**
 *
 * @param root0
 * @param root0.title
 * @param root0.description
 * @param root0.breadcrumb
 * @param root0.actions
 * @param root0.className
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <header
      className={cn("mb-6 flex flex-col gap-3", className)}
      aria-label="Sayfa başlığı"
    >
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <li
                  key={`${item.label}-${index}`}
                  className="flex items-center gap-1"
                >
                  {item.href && !isLast ? (
                    <Link
                      href={item.href}
                      className="rounded text-gray-500 hover:text-clinic-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-clinic-500"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={isLast ? "page" : undefined}
                      className={cn(isLast && "font-medium text-gray-700")}
                    >
                      {item.label}
                    </span>
                  )}
                  {!isLast ? (
                    <span aria-hidden="true" className="text-gray-300">
                      /
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <div className="mt-1 text-sm text-gray-600">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
