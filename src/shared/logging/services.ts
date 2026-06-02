import { IncomingMessage, ServerResponse } from 'http';
import morgan from 'morgan';
import winston from 'winston';
import * as Transport from 'winston-transport';

import { type ExpressMiddleware } from '../express/services';

export type LogContext = Record<string, unknown>;

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warn',
  ERROR = 'error',
  CRITICAL = 'fatal',
}

const logCache = new Map<string, winston.Logger>();

const HIGHEST_LOG_LEVEL = process.env.LOG_LEVEL ?? 'debug';

const createLogTransports = (
  streamName: string,
  logInJSON = true,
): Transport[] => {
  const transports: Transport[] = [];

  const labelFormat = winston.format.label({ label: streamName });
  const logFormat = logInJSON
    ? winston.format.combine(
        winston.format.timestamp(),
        labelFormat,
        winston.format.json({ space: 2 }),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        labelFormat,
        winston.format.simple(),
      );

  transports.push(
    new winston.transports.Console({
      level: HIGHEST_LOG_LEVEL,
      format: logFormat,
    }),
  );

  return transports;
};

export const createLogger = (
  streamName: string,
  logInJSON = true,
): winston.Logger => {
  const cachedLogger = logCache.get(streamName);
  if (cachedLogger) return cachedLogger;

  const logger = winston.createLogger({
    level: HIGHEST_LOG_LEVEL,
    transports: createLogTransports(streamName, logInJSON),
  });

  logCache.set(streamName, logger);
  return logger;
};

export const loggerMiddleware = (logger: winston.Logger): ExpressMiddleware => {
  const middleware = morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    {
      stream: {
        write(message: string): void {
          logger.info(message.trim());
        },
      },
    },
  );

  return (req, res, next): void => {
    middleware(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      next,
    );
  };
};
