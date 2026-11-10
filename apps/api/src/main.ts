import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { APP_OPTIONS, setupApp } from './app.setup.js';
import { API_DOCS_PATH, versionedPath } from './common/constants.js';
import { appConfig, httpConfig, type AppConfig, type HttpConfig } from './config/index.js';

const LOCAL_HOST = 'localhost';

const app = await NestFactory.create<NestExpressApplication>(AppModule, APP_OPTIONS);
await setupApp(app);

const { port } = app.get<AppConfig>(appConfig.KEY);
const { apiDocsEnabled } = app.get<HttpConfig>(httpConfig.KEY);
await app.listen(port);

const baseUrl = `http://${LOCAL_HOST}:${port}`;
const docs = apiDocsEnabled ? ` | OpenAPI docs: ${baseUrl}/${API_DOCS_PATH}` : '';
app.get(Logger).log(`API ready: ${baseUrl}${versionedPath()}${docs}`, 'Bootstrap');
