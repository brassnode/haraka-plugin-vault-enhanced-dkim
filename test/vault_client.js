'use strict'

const assert = require('node:assert')
const { describe, it, beforeEach } = require('node:test')
const sinon = require('sinon')

const { VaultClient } = require('../lib/vault_client')

// Mock RedisClient
class MockCache {
  constructor() {
    this.getFromCache = sinon.stub()
    this.setCache = sinon.stub()
    this.clearCache = sinon.stub().resolves()
    this.clearDomainCache = sinon.stub().resolves()
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
    mockCache.getFromCache.resolves('value')
    const result = await vaultClient.get_from_cache('key')
    assert.equal(result, 'value')
    assert(mockCache.getFromCache.calledWith('key'))
  })

  it('set_cache delegates to cache', async () => {
    mockCache.setCache.resolves()
    await vaultClient.set_cache('key', { foo: 'bar' })
    assert(mockCache.setCache.calledWith('key', { foo: 'bar' }))
  })

  it('get_dkim_keys returns cached value if present', async () => {
    mockCache.getFromCache.resolves({ privateKey: 'priv', publicKey: 'pub' })
    const result = await vaultClient.get_dkim_keys('example.com')
    assert.deepEqual(result, { privateKey: 'priv', publicKey: 'pub' })
  })

  it('get_dkim_keys fetches from vault and caches if not cached', async () => {
    mockCache.getFromCache.resolves(null)
    mockVault.read.resolves({
      data: { data: { privateKey: 'priv', publicKey: 'pub' } },
    })
    mockCache.setCache.resolves()
    const result = await vaultClient.get_dkim_keys('example.com')
    assert.deepEqual(result, { privateKey: 'priv', publicKey: 'pub' })
    assert(mockVault.read.called)
    assert(mockCache.setCache.called)
  })

  it('get_dkim_keys throws if no domain', async () => {
    await assert.rejects(
      () => vaultClient.get_dkim_keys(),
      /Domain is required/
    )
  })

  it('get_dkim_keys throws if vault returns no keys', async () => {
    mockCache.getFromCache.resolves(null)
    mockVault.read.resolves({ data: { data: {} } })
    await assert.rejects(
      () => vaultClient.get_dkim_keys('example.com'),
      /Invalid DKIM key structure/
    )
  })

  it('get_dkim_keys throws if vault returns 404', async () => {
    mockCache.getFromCache.resolves(null)
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
    assert(result.healthy)
    assert.equal(result.initialized, true)
    assert.equal(result.sealed, false)
  })

  it('health_check returns healthy false on error', async () => {
    mockVault.health.rejects(new Error('fail'))
    const result = await vaultClient.health_check()
    assert.equal(result.healthy, false)
    assert(result.error)
  })

  it('clear_cache delegates to cache', async () => {
    await vaultClient.clear_cache()
    assert(mockCache.clearCache.called)
  })

  it('clear_domain_cache delegates to cache', async () => {
    await vaultClient.clear_domain_cache('example.com')
    assert(mockCache.clearDomainCache.calledWith('example.com'))
  })
})
