'use strict'

const assert = require('node:assert')
const { beforeEach, describe, it } = require('node:test')
const sinon = require('sinon')

const { RedisClient } = require('../lib/redis_client')

let redisClient, mockRedis

describe('RedisClient', () => {
  beforeEach(() => {
    mockRedis = {
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub(),
      flushdb: sinon.stub(),
    }
    redisClient = new RedisClient({ cache_ttl: 100 })
    redisClient.client = mockRedis
    redisClient.getAsync = sinon.stub()
    redisClient.setAsync = sinon.stub()
    redisClient.delAsync = sinon.stub()
  })

  it('getFromCache returns parsed value', async () => {
    redisClient.getAsync.resolves(JSON.stringify({ foo: 'bar' }))
    const result = await redisClient.getFromCache('key')
    assert.deepEqual(result, { foo: 'bar' })
  })

  it('getFromCache returns null for missing', async () => {
    redisClient.getAsync.resolves(null)
    const result = await redisClient.getFromCache('key')
    assert.equal(result, null)
  })

  it('setCache stores value as JSON', async () => {
    redisClient.setAsync.resolves('OK')
    await redisClient.setCache('key', { foo: 'bar' })
    assert(
      redisClient.setAsync.calledWith(
        'key',
        JSON.stringify({ foo: 'bar' }),
        'EX',
        100
      )
    )
  })

  it('clearCache calls flushdb', async () => {
    const flushdb = sinon.stub().resolves('OK')
    redisClient.client.flushdb = flushdb
    await redisClient.clearCache()
    assert(flushdb.calledOnce)
  })

  it('clearDomainCache calls delAsync with correct key', async () => {
    redisClient.delAsync.resolves(1)
    await redisClient.clearDomainCache('example.com')
    assert(redisClient.delAsync.calledWith('vault:dkim/example.com'))
  })
})
