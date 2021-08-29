import { CreateApp, SvelteKitContextArgs } from '@graphql-ez/sveltekit';
import { ezSchema, gql } from '@graphql-ez/plugin-schema';

const buildContext = ({ sveltekit }: SvelteKitContextArgs<{ asd: string }, {}>) => {
  sveltekit?.req.locals.asd;

  return {};
};

const ezApp = CreateApp({
  ez: {
    plugins: [
      ezSchema({
        schema: {
          typeDefs: gql`
            type Query {
              hello: String!
            }
          `,
          resolvers: {
            Query: {
              hello(_root, _args, _ctx) {
                return 'Hello World!';
              },
            },
          },
        },
      }),
    ],
  },
  buildContext,
});

const { handler } = ezApp.buildApp();

export const get = handler;

export const post = handler;