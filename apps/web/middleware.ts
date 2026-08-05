/**
 * @file Next.js middleware giriş noktası.
 * @module @vetniva/web/middleware-entry
 * @description Next.js, `app` dizini proje kökünde yer aldığında middleware
 * dosyasını da proje kökünde keşfeder. Locale yönlendirme kuralı `src`
 * altında tutulur ve buradan yeniden dışa aktarılır.
 * @security Locale'i olmayan isteklerin varsayılan locale'e yönlendirilmesi
 * tenant bağlamının tutarlı başlamasını sağlar.
 */

export { config, middleware } from "./src/middleware";
