import { BaseAppBuilder, createEnvelopAppFactory, handleRequest } from '@graphql-ez/core-app';
import { getObjectValue } from '@graphql-ez/core-utils/object';
import { LazyPromise } from '@graphql-ez/core-utils/promise';

import type { FastifyPluginCallback, FastifyInstance, RouteOptions, FastifyRequest, FastifyReply } from 'fastify';
import type { BuildAppOptions, BaseEZApp, AppOptions, InternalAppBuildContext } from '@graphql-ez/core-types';
import type { FastifyCorsOptions, FastifyCorsOptionsDelegate, FastifyPluginOptionsDelegate } from 'fastify-cors';

declare module '@graphql-ez/core-types' {
  interface BuildContextArgs {
    fastify?: {
      request: FastifyRequest;
      reply: FastifyReply;
    };
  }

  interface InternalAppBuildIntegrationContext {
    fastify?: FastifyInstance;
  }
}

interface FastifyAppOptions extends AppOptions {
  path?: string;
  /**
   * Enable or configure CORS
   */
  cors?: boolean | FastifyCorsOptions | FastifyPluginOptionsDelegate<FastifyCorsOptionsDelegate>;

  /**
   * Custom Fastify Route options
   */
  routeOptions?: Omit<RouteOptions, 'method' | 'url' | 'handler'>;

  /**
   * Custom on app register callback with access to internal build context
   */
  onAppRegister?(ctx: InternalAppBuildContext, instance: FastifyInstance): void | Promise<void>;
}

export type FastifyAppPlugin = FastifyPluginCallback<{}>;

declare module 'fastify' {
  interface FastifyRequest {
    isMultipart?: true;
  }
}

export interface EZApp extends BaseEZApp {
  fastifyPlugin: FastifyAppPlugin;
}

export interface EZAppBuilder extends BaseAppBuilder {
  buildApp(options?: BuildAppOptions): EZApp;
}

export function CreateApp(config: FastifyAppOptions = {}): EZAppBuilder {
  const path = (config.path ||= '/graphql');

  const { appBuilder, onIntegrationRegister, ...commonApp } = createEnvelopAppFactory(
    {
      moduleName: 'fastify-new',
    },
    config,
    {}
  );

  const buildApp: EZAppBuilder['buildApp'] = function buildApp(buildOptions = {}) {
    const appPromise = LazyPromise(() => {
      return appBuilder(buildOptions, ({ ctx, getEnveloped }) => {
        const { cors, routeOptions, buildContext, onAppRegister } = config;
        return async function FastifyPlugin(instance: FastifyInstance) {
          if (onAppRegister) await onAppRegister?.(ctx, instance);
          await onIntegrationRegister({
            fastify: instance,
          });

          if (cors) {
            const fastifyCors = (await import('fastify-cors')).default;

            await instance.register(fastifyCors, getObjectValue(cors));
          }

          const requestHandler = ctx.options.customHandleRequest || handleRequest;

          instance.route({
            ...routeOptions,
            method: ['GET', 'POST'],
            url: path,
            handler(req, reply) {
              const request = {
                body: req.body,
                headers: req.headers,
                method: req.method,
                query: req.query,
              };

              return requestHandler({
                request,
                getEnveloped,
                baseOptions: config,
                buildContextArgs() {
                  return {
                    req: req.raw,
                    fastify: {
                      request: req,
                      reply,
                    },
                  };
                },
                buildContext,
                onResponse(result) {
                  reply.status(result.status);
                  reply.send(result.payload);
                },
                onMultiPartResponse(result, defaultHandle) {
                  reply.hijack();
                  return defaultHandle(req.raw, reply.raw, result);
                },
                onPushResponse(result, defaultHandle) {
                  reply.hijack();
                  return defaultHandle(req.raw, reply.raw, result);
                },
              });
            },
          });
        };
      });
    });

    return {
      async fastifyPlugin(instance) {
        await (await appPromise).app(instance);
      },
      getEnveloped: LazyPromise(() => appPromise.then(v => v.getEnveloped)),
    };
  };

  return {
    ...commonApp,
    buildApp,
  };
}

export * from '@graphql-ez/core-app';
export * from '@graphql-ez/core-utils';