'use strict'

const assert = require('node:assert')
const { beforeEach, describe, it } = require('node:test')
const sinon = require('sinon')

const { RedisClient } = require('../lib/redis_client')

let redis_client, mock_redis, config

describe('RedisClient', () => {
  beforeEach(() => {
    mock_redis = {
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub(),
      keys: sinon.stub(),
    }
    config = { host: 'localhost', port: 6379, ttl: 100, prefix: 'dkim:' }
    redis_client = new RedisClient(config)
    redis_client.client = mock_redis
    redis_client.getAsync = sinon.stub()
    redis_client.setAsync = sinon.stub()
    redis_client.delAsync = sinon.stub()
  })

  it('get_from_cache returns parsed value', async () => {
    redis_client.getAsync.resolves(JSON.stringify({ foo: 'bar' }))
    const result = await redis_client.get_from_cache('key')
    assert.deepEqual(result, { foo: 'bar' })
  })

  it('get_from_cache returns null if not found', async () => {
    redis_client.getAsync.resolves(null)
    const result = await redis_client.get_from_cache('key')
    assert.equal(result, null)
  })

  it('set_cache sets value with ttl', async () => {
    redis_client.setAsync.resolves()
    await redis_client.set_cache('key', { foo: 'bar' })
    assert(
      redis_client.setAsync.calledWith(
        'dkim:key',
        JSON.stringify({ foo: 'bar' }),
        'EX',
        100
      )
    )
  })

  it('clear_cache deletes all keys with prefix', async () => {
    const keys = ['dkim:key1', 'dkim:key2']
    redis_client.client.keys = sinon.stub().yields(null, keys)
    redis_client.delAsync.resolves()
    await redis_client.clear_cache()
    assert(redis_client.delAsync.calledWith(keys))
  })

  it('clear_domain_cache deletes the domain key', async () => {
    redis_client.delAsync.resolves()
    await redis_client.clear_domain_cache('example.com')
    assert(redis_client.delAsync.calledWith('dkim:vault:dkim/example.com'))
  })
})
