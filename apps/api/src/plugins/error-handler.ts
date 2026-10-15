import {
  API_ERROR_CODES,
  API_ERROR_REGISTRY,
  type ApiErrorPayload,
  type SendApiErrorOptions,
} from "@asc/types";
import { formatZodError, isZodError } from "@asc/validation";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

export function sendApiError(reply: FastifyReply, options: SendApiErrorOptions): FastifyReply {
  const reg = API_ERROR_REGISTRY[options.code];
  const status = options.status ?? reg.status;
  const message = options.message ?? reg.defaultMessage;

  const payload: ApiErrorPayload = {
    code: options.code,
    message,
    ...(options.details ? { details: options.details } : {}),
    ...(options.reasons ? { reasons: options.reasons } : {}),
    ...(options.duplicateMatch ? { duplicateMatch: options.duplicateMatch } : {}),
  };

  return reply.code(status).send(payload);
}

declare module "fastify" {
  interface FastifyReply {
    sendApiError(options: SendApiErrorOptions): FastifyReply;
  }
}

interface FastifyErrorWithStatus extends Error {
  readonly statusCode?: number;
  readonly code?: string;
}

const errorHandlerPlugin: FastifyPluginAsync = (app: FastifyInstance): Promise<void> => {
  app.decorateReply("sendApiError", function (this: FastifyReply, options: SendApiErrorOptions) {
    return sendApiError(this, options);
  });

  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    if (isZodError(error)) {
      return reply.code(400).send(formatZodError(error));
    }

    const fastifyError = error as FastifyErrorWithStatus;
    if (fastifyError.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" || fastifyError.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return reply.sendApiError({
        code: API_ERROR_CODES.INVALID_PAYLOAD,
        status: 400,
        message: fastifyError.message,
      });
    }

    if (fastifyError.statusCode === 429) {
      return reply.sendApiError({
        code: API_ERROR_CODES.RATE_LIMITED,
        status: 429,
        message: fastifyError.message,
      });
    }

    request.log.error({ errorName: error.name, message: error.message }, "Unhandled error caught by central handler");
    return reply.sendApiError({
      code: API_ERROR_CODES.INTERNAL_ERROR,
      status: 500,
      message: "Internal server error.",
    });
  });

  return Promise.resolve();
};

export const registerErrorHandler = fp(errorHandlerPlugin);
