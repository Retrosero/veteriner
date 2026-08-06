/**
 * @file Genel veri tablosu.
 * @module @vetniva/web/components/ui/data-table
 * @description Sıralı, satır hover'lı, boş durumu destekleyen tablo.
 * Sayfa bazlı veri (server-side pagination) için tasarlanmıştır;
 * client-side sıralama ileride eklenebilir.
 *
 * Erişilebilirlik:
 * - `<table>` semantiği + `<caption>` opsiyonel
 * - `<th scope="col">` zorunlu
 * - Satırlar `role="row"` (varsayılan), hücreler `role="cell"`
 * - Yükleme durumu `aria-busy="true"`
 * - Boş durum `role="status"` ile duyurulur.
 * @security Tablodaki veri PII içerebilir; maskeleme üst katmanda
 * yapılır. Bu bileşen salt render — veri şekillendirme çağırana ait.
 */

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";
import { type ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  className?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  /**
   * Boş durumunda gösterilecek içerik. Sağlanmazsa genel bir
   * mesaj gösterilir.
   */
  empty?: ReactNode;
  /**
   * `getRowKey` ile her satır için stabil anahtar. Sağlanmazsa
   * index kullanılır (önerilmez).
   */
  getRowKey?: (row: T, index: number) => string;
  /**
   * Yükleme durumu. True ise satırlar `aria-busy` ile işaretlenir
   * ve skeleton gösterilir.
   */
  loading?: boolean;
  /**
   * Tablo etiketi (ekran okuyucu için).
   */
  caption?: string;
  className?: string;
};

/**
 *
 * @param root0
 * @param root0.columns
 * @param root0.rows
 * @param root0.empty
 * @param root0.getRowKey
 * @param root0.loading
 * @param root0.caption
 * @param root0.className
 */
export function DataTable<T>({
  columns,
  rows,
  empty,
  getRowKey,
  loading = false,
  caption,
  className,
}: DataTableProps<T>): JSX.Element {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[14px] border border-[#E1E5E2] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#ECEFED]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-[#F6F8F6]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-5 py-3.5 text-left text-xs font-medium tracking-normal text-[#5F6368]",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className,
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECEFED]" aria-busy={loading}>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center"
                  role="status"
                >
                  {empty ?? (
                    <span className="text-sm text-[#5F6368]">
                      Kayıt bulunamadı
                    </span>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const key = getRowKey ? getRowKey(row, index) : String(index);
                return (
                  <tr
                    key={key}
                    className="transition-colors hover:bg-[#F7FBF8]"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "whitespace-nowrap px-5 py-4 text-sm text-[#1D1D1F]",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.className,
                        )}
                      >
                        {col.cell(row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Badge için yardımcı sarmalayıcı. Tablo hücrelerinde doğrudan
 * kullanım için.
 */
export const DataTableBadge = Badge;
