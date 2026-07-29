/**
 * @file Button bileşeni.
 * @module @vetniva/ui/components/button
 *
 * @description Klinik arayüz için standart buton. Varyant: primary,
 * secondary, ghost, danger. Boyut: sm, md, lg. Loading state için
 * `aria-busy` ve devre dışı bırakma davranışı içerir.
 *
 * @security Tıbbi/finansal tehlikeli işlemlerde `variant="danger"`
 * kullanılmalı ve onay adımıyla sarmalanmalıdır. Bu bileşen yalnızca
 * görsel/işlevsel sunum sağlar; işlem güvenliği kapsayıcı sayfada
 * çözülür.
 */

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../lib/cn.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic-700 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-clinic-700 text-white hover:bg-clinic-800",
        secondary:
          "bg-white text-clinic-800 border border-clinic-200 hover:bg-clinic-50",
        ghost: "bg-transparent text-clinic-700 hover:bg-clinic-50",
        danger: "bg-danger-500 text-white hover:bg-danger-700",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
  };

/**
 * Standart buton. `isLoading` true olduğunda `aria-busy="true"` ayarlanır
 * ve icon yerine spinner gösterilebilir (kapsayıcı sayfada eklenebilir).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading,
      disabled,
      type,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled ?? isLoading}
        aria-busy={isLoading === true ? "true" : undefined}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
