/**
 * @file API bootstrap.
 * @module apps/api
 * @description NestJS uygulamasını başlatır:
 * - Global exception filter (AllExceptionsFilter)
 * - Global request ID interceptor
 * - Global actor interceptor (AuthGuard'ın ürettiği güvenilir actor
 *   bağlamını endpoint katmanına taşır)
 * - Helmet (güvenlik başlıkları)
 * - CORS (WEB_BASE_URL'den, credentials=true)
 * - Cookie parser (GOAL-011 session cookie)
 * - Compression
 * - Swagger UI (/api/docs)
 * - Shutdown hooks.
 * Güvenlik: Production'da reverse proxy (nginx) TLS, rate limit ve IP
 * filtreleme uygular. Session cookie httpOnly + secure (prod) + SameSite=Lax.
 * GOAL-011 (FAZ-1) ile cookie tabanlı session eklenmiştir.
 */

import "reflect-metadata";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module.js";
import { ActorInterceptor } from "./common/actor/actor.interceptor.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import {
  REQUEST_ID_HEADER,
  RequestIdInterceptor,
} from "./common/interceptors/request-id.interceptor.js";
import { validateEnv } from "./env.js";
import { ErrorEventsService } from "./modules/error-events/error-events.service.js";

import type { INestApplication } from "@nestjs/common";

/** API uygulamasını HTTP dinleme olmadan production varsayımlarıyla kurar. */
export async function createApiApplication(): Promise<INestApplication> {
  const env = validateEnv();
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(cookieParser());
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
  const actorInterceptor = app.get(ActorInterceptor);
  app.useGlobalInterceptors(actorInterceptor);
  // GOAL-100: AllExceptionsFilter'a merkezi hata kayıt servisini
  // inject et. Servis @Global modülden gelir; null ise filter
  // sessizce çalışmaya devam eder.
  const errorEvents = app.get(ErrorEventsService, { strict: false });
  app.useGlobalFilters(new AllExceptionsFilter(errorEvents));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("VetNiva API")
    .setDescription(
      "VetNiva çok kiracılı veteriner klinik + petshop SaaS API. " +
        "GOAL-011: kimlik doğrulama (cookie session) + GOAL-010 tenant altyapısı. " +
        "Detaylı sözleşme için packages/contracts.",
    )
    .setVersion(env.APP_VERSION)
    .addApiKey(
      { type: "apiKey", name: REQUEST_ID_HEADER, in: "header" },
      "request-id",
    )
    .addCookieAuth("vetniva_session", undefined, "Session cookie (GOAL-011)")
    .addApiKey({ type: "apiKey", name: "x-actor-id", in: "header" }, "actor-id")
    .addApiKey(
      { type: "apiKey", name: "x-actor-role", in: "header" },
      "actor-role",
    )
    .addApiKey(
      { type: "apiKey", name: "x-tenant-id", in: "header" },
      "tenant-id",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  return app;
}

/** API uygulamasını güvenli varsayılanlarla başlatır. */
async function bootstrap(): Promise<void> {
  const env = validateEnv();
  const app = await createApiApplication();

  await app.listen(env.PORT_API, "0.0.0.0");
  const logger = new Logger("Bootstrap");
  logger.log(
    `VetNiva API hazır — port ${env.PORT_API}, sürüm ${env.APP_VERSION}`,
  );
  logger.log(`Swagger UI: http://localhost:${env.PORT_API}/api/docs`);
  logger.log(`Request ID header: ${REQUEST_ID_HEADER}`);
  logger.log(
    "Auth: cookie tabanlı (vetniva_session, httpOnly, SameSite=Lax). Login: POST /api/v1/auth/login",
  );
}

// Vitest bu modülü embedded HTTP E2E için import eder; test sürecinde ikinci
// bir sabit-port bootstrap başlatılmaz. `node dist/main.js` ortamında VITEST
// tanımlı değildir ve normal production bootstrap her zaman çalışır.
if (process.env["VITEST"] !== "true") {
  bootstrap().catch((err) => {
    console.error("API başlatılamadı:", err);
    process.exitCode = 1;
  });
}
