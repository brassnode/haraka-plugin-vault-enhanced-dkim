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

  it('getFromCache delegates to cache', async () => {
    mockCache.getFromCache.resolves('value')
    const result = await vaultClient.getFromCache('key')
    assert.equal(result, 'value')
    assert(mockCache.getFromCache.calledWith('key'))
  })

  it('setCache delegates to cache', async () => {
    mockCache.setCache.resolves()
    await vaultClient.setCache('key', { foo: 'bar' })
    assert(mockCache.setCache.calledWith('key', { foo: 'bar' }))
  })

  it('getDKIMKeys returns cached value if present', async () => {
    mockCache.getFromCache.resolves({ privateKey: 'priv', publicKey: 'pub' })
    const result = await vaultClient.getDKIMKeys('example.com')
    assert.deepEqual(result, { privateKey: 'priv', publicKey: 'pub' })
  })

  it('getDKIMKeys fetches from vault and caches if not cached', async () => {
    mockCache.getFromCache.resolves(null)
    mockVault.read.resolves({
      data: { data: { privateKey: 'priv', publicKey: 'pub' } },
    })
    mockCache.setCache.resolves()
    const result = await vaultClient.getDKIMKeys('example.com')
    assert.deepEqual(result, { privateKey: 'priv', publicKey: 'pub' })
    assert(mockVault.read.called)
    assert(mockCache.setCache.called)
  })

  it('getDKIMKeys throws if no domain', async () => {
    await assert.rejects(() => vaultClient.getDKIMKeys(), /Domain is required/)
  })

  it('getDKIMKeys throws if vault returns no keys', async () => {
    mockCache.getFromCache.resolves(null)
    mockVault.read.resolves({ data: { data: {} } })
    await assert.rejects(
      () => vaultClient.getDKIMKeys('example.com'),
      /Invalid DKIM key structure/
    )
  })

  it('getDKIMKeys throws if vault returns 404', async () => {
    mockCache.getFromCache.resolves(null)
    mockVault.read.rejects({ response: { statusCode: 404 } })
    await assert.rejects(
      () => vaultClient.getDKIMKeys('example.com'),
      /DKIM keys not found/
    )
  })

  it('healthCheck returns healthy true if initialized and not sealed', async () => {
    mockVault.health.resolves({
      initialized: true,
      sealed: false,
      standby: false,
    })
    const result = await vaultClient.healthCheck()
    assert(result.healthy)
    assert.equal(result.initialized, true)
    assert.equal(result.sealed, false)
  })

  it('healthCheck returns healthy false on error', async () => {
    mockVault.health.rejects(new Error('fail'))
    const result = await vaultClient.healthCheck()
    assert.equal(result.healthy, false)
    assert(result.error)
  })

  it('clearCache delegates to cache', async () => {
    await vaultClient.clearCache()
    assert(mockCache.clearCache.called)
  })

  it('clearDomainCache delegates to cache', async () => {
    await vaultClient.clearDomainCache('example.com')
    assert(mockCache.clearDomainCache.calledWith('example.com'))
  })
})
