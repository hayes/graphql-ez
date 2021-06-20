import fetch from 'node-fetch';

import { getObjectValue } from '@graphql-ez/core-utils/object';

import { onIntegrationRegister } from './integrations';

import type { AltairConfigOptions } from 'altair-exported-types/dist/app/modules/altair/config';
import type { EZPlugin } from '@graphql-ez/core-types';
import type { RenderOptions } from 'altair-static';
import type { AltairOptions, HandlerConfig, IDEHandler } from './types';

const altairUnpkgDist = 'https://unpkg.com/altair-static@^4.0.6/build/dist/';

/**
 * Render Altair Initial options as a string using the provided renderOptions
 * @param renderOptions
 */
export const renderInitialOptions = (options: RenderOptions = {}) => {
  return `
        AltairGraphQL.init(${getRenderedAltairOpts(options, [
          'endpointURL',
          'subscriptionsEndpoint',
          'initialQuery',
          'initialVariables',
          'initialPreRequestScript',
          'initialPostRequestScript',
          'initialHeaders',
          'initialEnvironments',
          'instanceStorageNamespace',
          'initialSettings',
          'initialSubscriptionsProvider',
          'initialSubscriptionsPayload',
          'preserveState',
          'initialHttpMethod',
        ])});
    `;
};

/**
 * Render Altair as a string using the provided renderOptions
 * @param renderOptions
 */
export const renderAltair = async (options: RenderOptions = {}) => {
  const altairHtml = await (await fetch(altairUnpkgDist + 'index.html')).text();

  const initialOptions = renderInitialOptions(options);
  const baseURL = options.baseURL || './';
  if (options.serveInitialOptionsInSeperateRequest) {
    return altairHtml
      .replace(/<base.*>/, `<base href="${baseURL}">`)
      .replace('</body>', `<script src="initial_options.js"></script></body>`);
  } else {
    return altairHtml
      .replace(/<base.*>/, `<base href="${baseURL}">`)
      .replace('</body>', `<script>${initialOptions}</script></body>`);
  }
};

const getRenderedAltairOpts = (renderOptions: RenderOptions, keys: (keyof AltairConfigOptions)[]) => {
  const optProps = Object.keys(renderOptions)
    .filter((key: any): key is keyof AltairConfigOptions => keys.includes(key))
    .map(key => getObjectPropertyForOption(renderOptions[key], key));

  return ['{', ...optProps, '}'].join('\n');
};
function getObjectPropertyForOption(option: any, propertyName: keyof AltairConfigOptions) {
  if (option) {
    switch (typeof option) {
      case 'object':
        return `${propertyName}: ${JSON.stringify(option)},`;
    }
    return `${propertyName}: \`${option}\`,`;
  }
  return '';
}

export function UnpkgAltairHandler(options: AltairOptions | boolean = {}, extraConfig?: HandlerConfig): IDEHandler {
  let { path = '/api/altair', endpointURL = '/api/graphql', ...renderOptions } = getObjectValue(options) || {};

  const baseURL = path.endsWith('/') ? (path = path.slice(0, path.length - 1)) + '/' : path + '/';

  const rawHttp = extraConfig?.rawHttp ?? true;

  return async function (req, res) {
    switch (req.url) {
      case path:
      case baseURL: {
        const content = await renderAltair({
          ...renderOptions,
          baseURL,
          endpointURL,
        });

        if (rawHttp) {
          res.setHeader('content-type', 'text/html');
          res.end(content);
        }

        return {
          content,
          contentType: 'text/html',
        };
      }
      case undefined: {
        if (rawHttp) {
          res.writeHead(404).end();
        }

        return;
      }
      default: {
        const resolvedPath = altairUnpkgDist + req.url.slice(baseURL.length);

        const fetchResult = await fetch(resolvedPath).catch(() => null);

        if (!fetchResult) {
          if (rawHttp) {
            res.writeHead(404).end();
          }

          return;
        }

        const result = await fetchResult.arrayBuffer().catch(() => null);

        const contentType = fetchResult.headers.get('content-type');

        if (!result || !contentType) {
          if (rawHttp) {
            res.writeHead(404).end();
          }
          return;
        }

        const content = Buffer.from(result);

        if (rawHttp) {
          res.setHeader('content-type', contentType);
          res.end(content);
        }

        return {
          content,
          contentType,
        };
      }
    }
  };
}

export const UnpkgAltairIDE = (options: AltairOptions | boolean = true): EZPlugin => {
  return {
    name: 'Altair GraphQL Client UNPKG',
    compatibilityList: ['fastify-new', 'express-new', 'hapi-new', 'http-new', 'koa-new', 'nextjs-new'],
    onRegister(ctx) {
      if (!options) return;

      const objOptions = { ...(getObjectValue(options) || {}) };

      objOptions.endpointURL ||= ctx.options.path;

      const path = (objOptions.path ||= '/altair');

      const baseURL = (objOptions.baseURL ||= '/altair/');

      ctx.altair = {
        handler: UnpkgAltairHandler,
        options: objOptions,
        path,
        baseURL,
      };
    },
    onIntegrationRegister,
  };
};
