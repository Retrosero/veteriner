/**
 * @file Zod validation pipe.
 * @module apps/api/common/pipes/zod-validation
 *
 * @description Controller metodlarına gelen DTO'ları Zod şeması ile
 * doğrular. Hatalar exception filter tarafından standart hata
 * formatına çevrilir.
 */

import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import { ZodError, ZodType } from "zod";

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  public transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ZodError(result.error.issues);
    }
    return result.data;
  }
}

/**
 * Body veya query için Zod şeması olmadığında hızlıca kullanılabilecek
 * yardımcı: schema parametresi opsiyonel.
 */
export function zodPipe<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe<T>(schema);
}

/**
 * ZodError'ı BadRequestException'a dönüştüren kısayol. Kullanım:
 * controller'da `@Body(new ZodValidationPipe(schema))` yeterli; ayrıca
 * try/catch gerekmez.
 */
export function _ensureValidationPipeRegistration(): never {
  throw new BadRequestException("ZodValidationPipe yanlış kayıt edildi");
}
