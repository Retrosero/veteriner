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
        "h-[44px] w-full rounded-lg border border-[#D5DBD7] bg-white px-3.5 text-[15px] text-[#1D1D1F] placeholder:text-[#86868B] transition-colors focus:border-[#167A4A] focus:outline-none focus:ring-2 focus:ring-[#167A4A]/20 disabled:cursor-not-allowed disabled:bg-[#F1F5F1]",
        invalid === true &&
          "border-[#C3362C] focus:border-[#C3362C] focus:ring-[#C3362C]/20",
        className,
      )}
      {...rest}
    />
  );
});
