import { envelop } from '@envelop/core';
import { gql } from '@graphql-ez/core-utils/gql';
import { uniqueArray } from '@graphql-ez/core-utils/object';

import type { Envelop } from '@envelop/types';
import type {
  AppOptions,
  BaseAppBuilder,
  InternalAppBuildContext,
  EnvelopAppFactoryType,
  AdapterFactoryContext,
} from '@graphql-ez/core-types';

export function createEnvelopAppFactory(
  factoryCtx: AdapterFactoryContext,
  rawOptions: AppOptions,
  {
    preBuild,
    afterBuild,
  }: {
    preBuild?: (ctx: InternalAppBuildContext) => void | Promise<void>;
    afterBuild?: (getEnveloped: Envelop, ctx: InternalAppBuildContext) => void | Promise<void>;
  } = {}
): EnvelopAppFactoryType {
  const options = {
    ...rawOptions,
    ez: {
      plugins: [...(rawOptions.ez?.plugins || [])],
    },
    envelop: {
      plugins: [...(rawOptions.envelop?.plugins || [])],
    },
  };
  const baseAppBuilder: BaseAppBuilder = {
    gql,
  };

  const ctx: InternalAppBuildContext = {
    ...factoryCtx,
    options,
    appBuilder: baseAppBuilder,
  };

  const registerPromise = Promise.all(
    options.ez.plugins.map(plugin => {
      return plugin.onRegister?.(ctx);
    })
  ).catch(err => {
    console.error(err);
    process.exit(1);
  });

  const appBuilder: EnvelopAppFactoryType['appBuilder'] = async function appBuilder(adapterFactory) {
    await registerPromise;

    if (options.prepare) await options.prepare(baseAppBuilder);

    return getApp();

    async function getApp() {
      await Promise.all([
        ...options.ez.plugins.map(plugin => {
          return plugin.onPreBuild?.(ctx);
        }),
        preBuild?.(ctx),
      ]);

      const getEnveloped = envelop({
        plugins: uniqueArray(options.envelop.plugins),
      });

      await Promise.all([
        ...options.ez.plugins.map(async plugin => {
          return plugin.onAfterBuild?.(getEnveloped, ctx);
        }),
        afterBuild?.(getEnveloped, ctx),
      ]);

      return {
        app: adapterFactory({
          envelop: getEnveloped,
          ctx,
        }),
        getEnveloped,
      };
    }
  };

  return { ...baseAppBuilder, appBuilder };
}

export * from '@graphql-ez/core-types';