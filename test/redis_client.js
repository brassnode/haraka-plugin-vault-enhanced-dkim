'use strict'

const assert = require('node:assert')
const { beforeEach, describe, it } = require('node:test')
const sinon = require('sinon')

const { RedisClient } = require('../lib/redis_client')

let redis_client, mock_redis, config

describe('RedisClient', () => {
  beforeEach(() => {
    mock_redis = {
      connect: sinon.stub().resolves(),
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub(),
      keys: sinon.stub(),
    }
    config = { host: 'localhost', port: 6379, ttl: 100, prefix: 'dkim:' }
    redis_client = new RedisClient(config)
    redis_client.client = mock_redis
  })

  it('get_from_cache returns parsed value', async () => {
    mock_redis.get.resolves(JSON.stringify({ foo: 'bar' }))
    const result = await redis_client.get_from_cache('key')
    assert.deepEqual(result, { foo: 'bar' })
    assert(mock_redis.get.calledWith('dkim:key'))
  })

  it('get_from_cache returns null if not found', async () => {
    mock_redis.get.resolves(null)
    const result = await redis_client.get_from_cache('key')
    assert.equal(result, null)
    assert(mock_redis.get.calledWith('dkim:key'))
  })

  it('set_cache sets value with ttl', async () => {
    mock_redis.set.resolves()
    await redis_client.set_cache('key', { foo: 'bar' })
    assert(
      mock_redis.set.calledWith(
        'dkim:key',
        JSON.stringify({ foo: 'bar' }),
        'EX',
        100
      )
    )
  })

  it('clear_cache deletes all keys with prefix', async () => {
    const keys = ['dkim:key1', 'dkim:key2']
    mock_redis.keys.resolves(keys)
    mock_redis.del.resolves()
    await redis_client.clear_cache()
    assert(mock_redis.keys.calledWith('dkim:*'))
    assert(mock_redis.del.calledWith(keys))
    await Promise.resolve()
  })

  it('clear_domain_cache deletes the domain key', async () => {
    mock_redis.del.resolves()
    await redis_client.clear_domain_cache('example.com')
    assert(mock_redis.del.calledWith('dkim:vault:dkim/example.com'))
    await Promise.resolve()
  })
})
