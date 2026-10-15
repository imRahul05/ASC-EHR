import { formatZodError, type ZodType, type ZodTypeDef } from "@asc/validation";
import type { FastifyReply, FastifyRequest } from "fastify";

export function validateBody<TOutput, TDef extends ZodTypeDef = ZodTypeDef, TInput = TOutput>(
  schema: ZodType<TOutput, TDef, TInput>,
  message?: string,
) {
  return (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      reply.code(400).send(message ? { ...formatted, message } : formatted);
      return Promise.resolve();
    }
    request.body = parsed.data;
    return Promise.resolve();
  };
}

export function validateQuery<TOutput, TDef extends ZodTypeDef = ZodTypeDef, TInput = TOutput>(
  schema: ZodType<TOutput, TDef, TInput>,
  message?: string,
) {
  return (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      const formatted = formatZodError(parsed.error);
      reply.code(400).send({
        ...formatted,
        code: "invalid_query",
        ...(message ? { message } : {}),
      });
      return Promise.resolve();
    }
    request.query = parsed.data;
    return Promise.resolve();
  };
}


