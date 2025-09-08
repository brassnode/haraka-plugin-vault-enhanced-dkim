'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')
const sinon = require('sinon')

const { VaultClient } = require('../lib/vault_client')

// Mock RedisClient
class MockCache {
  constructor() {
    this.get_from_cache = sinon.stub()
    this.set_cache = sinon.stub()
    this.clear_cache = sinon.stub().resolves()
    this.clear_domain_cache = sinon.stub().resolves()
  }
}

describe('VaultClient', () => {
  let vaultClient, mockCache, mockVault

  beforeEach(() => {
    mockCache = new MockCache()
    mockVault = {
      read: sinon.stub(),
      health: sinon.stub(),
    }
    const config = {
      addr: 'http://vault',
      token: 'token',
      retry_count: 1,
      retry_delay: 1,
    }
    vaultClient = new VaultClient(config, mockCache)
    vaultClient.client = mockVault
  })

  it('get_from_cache delegates to cache', async () => {
    mockCache.get_from_cache.resolves('value')
    const result = await vaultClient.get_from_cache('key')
    assert.equal(result, 'value')
    assert(mockCache.get_from_cache.calledWith('key'))
  })

  it('set_cache delegates to cache', async () => {
    mockCache.set_cache.resolves()
    await vaultClient.set_cache('key', { foo: 'bar' })
    assert(mockCache.set_cache.calledWith('key', { foo: 'bar' }))
  })

  it('get_dkim_keys returns cached value if present', async () => {
    mockCache.get_from_cache.resolves({ privateKey: 'priv', publicKey: 'pub' })
    const result = await vaultClient.get_dkim_keys('example.com')
    assert.deepEqual(result, { privateKey: 'priv', publicKey: 'pub' })
  })

  it('get_dkim_keys fetches from vault and caches if not cached', async () => {
    mockCache.get_from_cache.resolves(null)
    mockVault.read.resolves({
      data: { data: { privateKey: 'priv', publicKey: 'pub' } },
    })
    mockCache.set_cache.resolves()
    const result = await vaultClient.get_dkim_keys('example.com')
    assert.deepEqual(result, { privateKey: 'priv', publicKey: 'pub' })
    assert(mockVault.read.called)
    assert(mockCache.set_cache.called)
  })

  it('get_dkim_keys throws if no domain', async () => {
    await assert.rejects(
      () => vaultClient.get_dkim_keys(),
      /Domain is required/
    )
  })

  it('get_dkim_keys throws if vault returns no keys', async () => {
    mockCache.get_from_cache.resolves(null)
    mockVault.read.resolves({ data: { data: {} } })
    await assert.rejects(
      () => vaultClient.get_dkim_keys('example.com'),
      /Invalid DKIM key structure/
    )
  })

  it('get_dkim_keys throws if vault returns 404', async () => {
    mockCache.get_from_cache.resolves(null)
    mockVault.read.rejects({ response: { statusCode: 404 } })
    await assert.rejects(
      () => vaultClient.get_dkim_keys('example.com'),
      /DKIM keys not found/
    )
  })

  it('health_check returns healthy true if initialized and not sealed', async () => {
    mockVault.health.resolves({
      initialized: true,
      sealed: false,
      standby: false,
    })
    const result = await vaultClient.health_check()
    assert(result.initialized)
    assert.equal(result.sealed, false)
    assert.equal(result.standby, false)
  })

  it('health_check returns healthy false on error', async () => {
    mockVault.health.rejects(new Error('fail'))
    try {
      await vaultClient.health_check()
    } catch (err) {
      assert(err)
    }
  })

  it('clear_cache delegates to cache', async () => {
    await vaultClient.clear_cache()
    assert(mockCache.clear_cache.called)
  })

  it('clear_domain_cache delegates to cache', async () => {
    await vaultClient.clear_domain_cache('example.com')
    assert(mockCache.clear_domain_cache.calledWith('example.com'))
  })
})
