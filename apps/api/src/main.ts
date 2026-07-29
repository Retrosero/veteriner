/**
 * @file API bootstrap.
 * @module apps/api
 *
 * @description NestJS uygulamasını başlatır:
 * - Global exception filter (AllExceptionsFilter)
 * - Global request ID interceptor
 * - Helmet (güvenlik başlıkları)
 * - CORS (WEB_BASE_URL'den)
 * - Compression
 * - Swagger UI (/api/docs) ve JSON (/api/docs-json)
 * - Shutdown hooks
 *
 * @security Şu an tenant bağlamı yok; production'da reverse proxy
 * (nginx) tarafında TLS, rate limit ve IP filtreleme uygulanır.
 */

import "reflect-metadata";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compression from "compression";
import helmet from "helmet";

import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import {
  REQUEST_ID_HEADER,
  RequestIdInterceptor,
} from "./common/interceptors/request-id.interceptor.js";
import { validateEnv } from "./env.js";

async function bootstrap(): Promise<void> {
  const env = validateEnv();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.enableCors({
    origin: env.WEB_BASE_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("VetNiva API")
    .setDescription(
      "VetNiva çok kiracılı veteriner klinik + petshop SaaS API. " +
        "GOAL-000: yalnızca health endpoint'leri. Detaylı sözleşme için packages/contracts.",
    )
    .setVersion(env.APP_VERSION)
    .addApiKey(
      { type: "apiKey", name: REQUEST_ID_HEADER, in: "header" },
      "request-id",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(env.PORT_API, "0.0.0.0");
  const logger = new Logger("Bootstrap");
  logger.log(
    `VetNiva API hazır — port ${env.PORT_API}, sürüm ${env.APP_VERSION}`,
  );
  logger.log(`Swagger UI: http://localhost:${env.PORT_API}/api/docs`);
  logger.log(`Request ID header: ${REQUEST_ID_HEADER}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("API başlatılamadı:", err);
  process.exit(1);
});
