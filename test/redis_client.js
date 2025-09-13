'use strict'

const assert = require('node:assert')
const { beforeEach, describe, it } = require('node:test')
const sinon = require('sinon')

const { RedisClient } = require('../lib/redis_client')

let default_redis_client,
  encrypted_redis_client,
  mock_redis,
  default_redis_config,
  encrypted_redis_config

describe('redis client', () => {
  beforeEach(() => {
    mock_redis = {
      connect: sinon.stub().resolves(),
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub(),
      keys: sinon.stub(),
    }
    mock_redis = {
      connect: sinon.stub().resolves(),
      get: sinon.stub(),
      set: sinon.stub(),
      del: sinon.stub(),
      keys: sinon.stub(),
    }
    default_redis_config = {
      host: 'localhost',
      port: 6379,
      ttl: 100,
      prefix: 'dkim:',
    }
    encrypted_redis_config = {
      ...default_redis_config,
      cache_encryption_key:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }
    default_redis_client = new RedisClient(default_redis_config)
    default_redis_client.client = mock_redis
    encrypted_redis_client = new RedisClient(encrypted_redis_config)
    encrypted_redis_client.client = mock_redis
  })

  it('get_from_cache returns parsed value without encryption', async () => {
    default_redis_client.cache_encryption_key = undefined
    mock_redis.get.resolves(JSON.stringify({ foo: 'bar' }))
    const result = await default_redis_client.get_from_cache('key')
    assert.deepEqual(result, { foo: 'bar' })
    assert(mock_redis.get.calledWith(`dkim:key`))
  })

  it('get_from_cache returns null if not found', async () => {
    mock_redis.get.resolves(null)
    const result = await default_redis_client.get_from_cache('key')
    assert.equal(result, null)
    assert(mock_redis.get.calledWith(`dkim:key`))
  })

  it('set_cache sets unencrypted value with ttl when encryption disabled', async () => {
    default_redis_client.cache_encryption_key = undefined
    mock_redis.set.resolves()
    await default_redis_client.set_cache('key', { foo: 'bar' })
    assert(
      mock_redis.set.calledWith(
        `dkim:key`,
        JSON.stringify({ foo: 'bar' }),
        'EX',
        100
      )
    )
  })

  it('clear_cache deletes all keys with prefix', async () => {
    const keys = [`dkim:key1`, `dkim:key2`]
    mock_redis.keys.resolves(keys)
    mock_redis.del.resolves()
    await default_redis_client.clear_cache()
    assert(mock_redis.keys.calledWith('dkim:*'))
    assert(mock_redis.del.calledWith(keys))
    await Promise.resolve()
  })

  it('clear_domain_cache deletes the domain key', async () => {
    mock_redis.del.resolves()
    await default_redis_client.clear_domain_cache('example.com')
    assert(mock_redis.del.calledWith('dkim:vault:dkim/example.com'))
    await Promise.resolve()
  })

  it('_validate_encryption_key accepts valid 32-byte hex key', () => {
    const validKey =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const client = new RedisClient({ cache_encryption_key: validKey })
    assert(client.key instanceof Buffer)
    assert.equal(client.key.length, 32)
  })

  it('_validate_encryption_key throws error on invalid hex key', () => {
    const invalidKey = 'not-a-hex-key'
    assert.throws(() => {
      new RedisClient({ cache_encryption_key: invalidKey })
    }, /Invalid encryption key: must be 64 hex characters/)
  })

  it('_validate_encryption_key throws error on wrong length hex key', () => {
    const shortKey = '0123456789abcdef' // Only 8 bytes
    assert.throws(() => {
      new RedisClient({ cache_encryption_key: shortKey })
    }, /Invalid encryption key: must be 64 hex characters/)
  })

  it('encrypt and decrypt handles data correctly', () => {
    const testData = { foo: 'bar', number: 123, array: [1, 2, 3] }
    const encrypted = encrypted_redis_client._encrypt(testData)

    // Verify encrypted format
    assert(typeof encrypted === 'string')
    assert(encrypted.split(':').length === 3) // Should have iv, authTag, and encrypted parts

    const decrypted = encrypted_redis_client._decrypt(encrypted)
    assert.deepEqual(
      decrypted,
      testData,
      'Decrypted data should match original'
    )
  })

  it('encrypt throws error when no data provided', () => {
    assert.throws(() => {
      encrypted_redis_client._encrypt(null)
    }, /No data provided for encryption/)
  })

  it('decrypt throws error on null input', () => {
    assert.throws(() => {
      encrypted_redis_client._decrypt(null)
    }, /Invalid encrypted data format/)
  })

  it('decrypt throws error on non-string input', () => {
    assert.throws(() => {
      encrypted_redis_client._decrypt(123)
    }, /Invalid encrypted data format/)
  })

  it('decrypt throws error on wrong number of parts', () => {
    assert.throws(() => {
      encrypted_redis_client._decrypt('part1:part2')
    }, /Invalid encrypted data format/)
  })

  it('decrypt throws error on empty parts', () => {
    assert.throws(() => {
      encrypted_redis_client._decrypt('::')
    }, /Invalid encrypted data format/)
  })

  it('decrypt throws error on invalid hex in iv', () => {
    assert.throws(() => {
      encrypted_redis_client._decrypt('XYZ:validhex:validhex')
    }, /Decryption failed/)
  })

  it('decrypt throws error on invalid hex in authTag', () => {
    const testData = { foo: 'bar' }
    let encrypted = encrypted_redis_client._encrypt(testData)
    const parts = encrypted.split(':')
    encrypted = `${parts[0]}:XYZ:${parts[2]}`
    assert.throws(() => {
      encrypted_redis_client._decrypt(encrypted)
    }, /Decryption failed/)
  })

  it('decrypt throws error on invalid hex in encrypted data', () => {
    const testData = { foo: 'bar' }
    let encrypted = encrypted_redis_client._encrypt(testData)
    const parts = encrypted.split(':')
    encrypted = `${parts[0]}:${parts[1]}:XYZ`
    assert.throws(() => {
      encrypted_redis_client._decrypt(encrypted)
    }, /Decryption failed/)
  })

  it('decrypt throws error on tampered data', () => {
    const testData = { foo: 'bar' }
    let encrypted = encrypted_redis_client._encrypt(testData)
    encrypted = encrypted.replace(/.$/, 'X') // Tamper with last character

    assert.throws(() => {
      encrypted_redis_client._decrypt(encrypted)
    }, /Decryption failed/)
  })

  it('get_from_cache decrypts encrypted value', async () => {
    const testData = { foo: 'bar' }
    const encrypted = encrypted_redis_client._encrypt(testData)
    mock_redis.get.resolves(encrypted)
    const result = await encrypted_redis_client.get_from_cache('key')
    assert.deepEqual(result, testData)
    assert(mock_redis.get.calledWith(`enc:dkim:key`))
  })

  it('set_cache encrypts value before storing', async () => {
    const testData = { foo: 'bar' }
    mock_redis.set.resolves()
    await encrypted_redis_client.set_cache('key', testData)
    const setCall = mock_redis.set.getCall(0)
    const storedData = setCall.args[1]
    // Check that the stored data is a string in the expected format: iv:tag:encrypted
    assert(typeof storedData === 'string')
    const parts = storedData.split(':')
    assert.equal(parts.length, 3)
    assert(parts[0] && parts[1] && parts[2])
    assert(
      mock_redis.set.calledWith(`enc:dkim:key`, sinon.match.string, 'EX', 100)
    )
  })
})
