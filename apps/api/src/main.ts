import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

try {
  if (existsSync('.env')) process.loadEnvFile('.env');
} catch {
  // .env is optional — proceed with process.env as-is
}
import { pathToFileURL } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

const API_PREFIX = 'api/v1';
const AUTH_MUTATION_METHODS = new Set(['POST', 'OPTIONS']);

type Environment = NodeJS.ProcessEnv;

interface RuntimeConfig {
  host: string;
  logLevel: string;
  port: number;
  webOrigins: ReadonlySet<string>;
  nodeEnvironment: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    retryAfterSeconds?: number;
  };
  requestId: string;
}

interface HttpRequest {
  id: string;
  log: {
    error(bindings: Record<string, unknown>, message: string): void;
  };
}

interface HttpReply {
  status(statusCode: number): HttpReply;
  send(payload: ErrorResponse): unknown;
}

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseExactOrigins(value: string | undefined, nodeEnvironment: string): ReadonlySet<string> {
  const configured = value?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  const candidates = configured.length > 0
    ? configured
    : nodeEnvironment === 'production'
      ? []
      : ['http://127.0.0.1:8081', 'http://127.0.0.1:19000', 'http://localhost:19000'];

  if (candidates.length === 0) {
    throw new Error('WEB_ORIGIN is required in production.');
  }

  return new Set(candidates.map((candidate) => {
    const parsed = new URL(candidate);
    if (
      parsed.origin !== candidate
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
    ) {
      throw new Error('WEB_ORIGIN entries must be exact origins without credentials, paths, queries, or fragments.');
    }
    if (nodeEnvironment === 'production' && parsed.protocol !== 'https:') {
      throw new Error('WEB_ORIGIN entries must use HTTPS in production.');
    }
    return parsed.origin;
  }));
}

export function parseRuntimeConfig(environment: Environment = process.env): RuntimeConfig {
  const nodeEnvironment = environment.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  return {
    host: environment.HOST ?? (nodeEnvironment === 'production' ? '0.0.0.0' : '127.0.0.1'),
    logLevel: environment.LOG_LEVEL ?? (nodeEnvironment === 'test' ? 'silent' : 'info'),
    port: parsePort(environment.PORT),
    webOrigins: parseExactOrigins(environment.WEB_ORIGIN, nodeEnvironment),
    nodeEnvironment,
  };
}

function validationDetails(errors: ValidationError[]): Array<{ field: string; codes: string[] }> {
  return errors.map((error) => ({
    field: error.property,
    codes: Object.keys(error.constraints ?? {}).sort(),
  }));
}

function codeForStatus(status: number): string {
  const knownCodes: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  };
  return knownCodes[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}

function messageForStatus(status: number): string {
  return status >= 500 ? 'An unexpected error occurred.' : 'The request could not be completed.';
}

@Catch()
class StableHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const reply = context.getResponse<HttpReply>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const structured = typeof response === 'object' && response !== null
      ? response as Record<string, unknown>
      : undefined;
    const code = typeof structured?.code === 'string' ? structured.code : codeForStatus(status);
    const message = typeof structured?.message === 'string' ? structured.message : messageForStatus(status);
    const details = structured?.details;
    const retryAfterSeconds = typeof structured?.retryAfterSeconds === 'number'
      ? structured.retryAfterSeconds
      : undefined;

    if (status >= 500) {
      request.log.error(
        { exceptionName: exception instanceof Error ? exception.name : 'UnknownException' },
        'Unhandled request error',
      );
    }

    const payload: ErrorResponse = {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      },
      requestId: request.id,
    };
    reply.status(status).send(payload);
  }
}

export async function createApplication(
  environment: Environment = process.env,
): Promise<NestFastifyApplication> {
  const config = parseRuntimeConfig(environment);
  const adapter = new FastifyAdapter({
    genReqId: () => randomUUID(),
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.url',
          'request.headers.authorization',
          'request.headers.cookie',
          '*.password',
          '*.token',
          '*.refreshToken',
          '*.pendingProof',
        ],
        censor: '[REDACTED]',
      },
    },
    requestIdHeader: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(environment), adapter, {
    abortOnError: true,
  });

  await app.register(fastifyCookie);
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    credentials: true,
    methods: ['GET', 'PATCH', 'POST', 'OPTIONS'],
    origin: (origin, callback) => {
      // 非生产环境允许所有来源，便于开发和多设备测试
      if (config.nodeEnvironment !== 'production') {
        callback(null, true);
        return;
      }
      callback(null, origin === undefined || config.webOrigins.has(origin));
    },
  });
  app.useGlobalPipes(new ValidationPipe({
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    whitelist: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) => new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      details: validationDetails(errors),
    }),
  }));
  app.useGlobalFilters(new StableHttpExceptionFilter());

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', async (request: { id: string; method: string; url: string }, reply: HttpReply) => {
    const path = request.url.split('?', 1)[0];
    if (path?.startsWith(`/${API_PREFIX}/auth/`) && !AUTH_MUTATION_METHODS.has(request.method)) {
      const payload: ErrorResponse = {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Authentication state changes require POST.',
        },
        requestId: request.id,
      };
      await reply.status(HttpStatus.METHOD_NOT_ALLOWED).send(payload);
    }
  });

  const document = createOpenApiDocument(app);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
    ui: false,
  });

  return app;
}

export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Muchakucha Zwei API')
      .setDescription('Versioned household collaboration API')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
}

export async function bootstrap(environment: Environment = process.env): Promise<void> {
  const config = parseRuntimeConfig(environment);
  const app = await createApplication(environment);
  await app.listen(config.port, config.host);
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void bootstrap().catch((error: unknown) => {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const message = error instanceof Error ? error.message : '';
    const stack = error instanceof Error ? error.stack : '';
    process.stderr.write(`API bootstrap failed (${name}): ${message}\n${stack}\n`);
    process.exitCode = 1;
  });
}
