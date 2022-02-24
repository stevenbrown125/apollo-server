import gql from 'graphql-tag';
import { ApolloServer } from '../ApolloServer';
import type { BaseContext } from '@apollo/server-types';
import { KeyvLRU } from '../utils/KeyvLRU';
import Keyv from 'keyv';
import type { DocumentNode } from 'graphql';
import assert from 'assert';

const typeDefs = gql`
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello() {
      return 'world';
    },
  },
};

const documentNodeMatcher = {
  kind: 'Document',
  definitions: expect.any(Array),
  loc: {
    start: 0,
    end: 15,
  },
};

const hash = 'ec2e01311ab3b02f3d8c8c712f9e579356d332cd007ac4c1ea5df727f482f05f';
const operations = {
  simple: {
    op: { query: 'query { hello }' },
    hash,
  },
};

describe('ApolloServer documentStore', () => {
  it('documentStore - undefined', async () => {
    const server = new ApolloServer<BaseContext>({
      typeDefs,
      resolvers,
    });

    await server.start();

    // Use [] syntax to access a private method.
    const { schemaManager } = await server['_ensureStarted']();
    const { documentStore } = schemaManager.getSchemaDerivedData();
    assert(documentStore);
    expect(documentStore).toBeInstanceOf(Keyv);

    await server.executeOperation(operations.simple.op);

    expect(documentStore.getTotalSize()).toBe(508);

    expect(await documentStore.get(operations.simple.hash)).toMatchObject(
      documentNodeMatcher,
    );
  });

  it('documentStore - custom', async () => {
    const documentStore = new KeyvLRU<DocumentNode>();

    const getSpy = jest.spyOn(documentStore, 'get');
    const setSpy = jest.spyOn(documentStore, 'set');

    const server = new ApolloServer({
      typeDefs,
      resolvers,
      documentStore,
    });
    await server.start();

    await server.executeOperation(operations.simple.op);

    const cache: Record<string, DocumentNode | undefined> = {};
    cache[hash] = await documentStore.get(hash);

    const keys = Object.keys(cache);
    expect(keys).toHaveLength(1);
    const theKey = keys[0];
    expect(theKey.split(':')).toHaveLength(2);
    expect(theKey.split(':')[1]).toEqual(operations.simple.hash);
    expect(cache[theKey]).toMatchObject(documentNodeMatcher);

    await server.executeOperation(operations.simple.op);

    expect(Object.keys(cache)).toEqual([theKey]);

    // one of these calls is ours
    expect(getSpy.mock.calls.length).toBe(2 + 1);
    expect(setSpy.mock.calls.length).toBe(1);
  });

  it('documentStore - null', async () => {
    const server = new ApolloServer<BaseContext>({
      typeDefs,
      resolvers,
      documentStore: null,
    });

    await server.start();

    // Use [] syntax to access a private method.
    const { documentStore } = (
      await server['_ensureStarted']()
    ).schemaManager.getSchemaDerivedData();
    expect(documentStore).toBeNull();

    const result = await server.executeOperation(operations.simple.op);

    expect(result.data).toEqual({ hello: 'world' });
  });

  it('documentStore with changing schema', async () => {});
});
