/**
 * @file Input bileşeni.
 * @module @vetniva/ui/components/input
 * @description Form alanları için standart input. Hata durumu için
 * `aria-invalid` ve görsel ipucu. Label ve hata metni kapsayıcı form
 * tarafından sağlanır; bu bileşen yalnızca alanın kendisini render eder.
 * @security PII alanları (TC kimlik, telefon) bu bileşen kullanılarak
 * alınırken masked/log kurallarına dikkat edilmelidir. Input değeri
 * merkezi logger'a yazılmaz; backend yalnızca validation amacıyla görür.
 */

import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type ?? "text"}
      aria-invalid={invalid === true ? "true" : undefined}
      className={cn(
        "h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-clinic-500 focus:outline-none focus:ring-1 focus:ring-clinic-500 disabled:cursor-not-allowed disabled:bg-gray-100",
        invalid === true &&
          "border-danger-500 focus:border-danger-500 focus:ring-danger-500",
        className,
      )}
      {...rest}
    />
  );
});
