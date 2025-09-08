'use strict'

const vault = require('node-vault')

/**
 *
 * @param {*} config
 * @param RedisClient cacheStore
 */
function VaultClient(config, cache) {
  config = config || {}
  this.vaultAddr = config.addr
  this.vaultToken = config.token
  this.retryCount = parseInt(config.retry_count) || 3
  this.retryDelay = parseInt(config.retry_delay) || 1000
  this.cache = cache

  this.client = vault({
    apiVersion: 'v1',
    endpoint: this.vaultAddr,
    token: this.vaultToken,
    requestOptions: {
      timeout: parseInt(config.timeout) || 5000,
    },
  })
}

VaultClient.prototype.get_cache_key = function (path) {
  return `vault:${path}`
}

VaultClient.prototype.get_from_cache = function (key) {
  // RedisClient returns a Promise
  return this.cache.getFromCache(key)
}

VaultClient.prototype.set_cache = function (key, data) {
  // RedisClient returns a Promise
  return this.cache.setCache(key, data)
}

VaultClient.prototype.retry_operation = function (operation, retries) {
  const self = this
  retries = typeof retries === 'number' ? retries : self.retryCount
  let lastError
  let attempt = 0
  function tryNext(resolve, reject) {
    operation()
      .then(resolve)
      .catch(function (error) {
        lastError = error
        if (attempt < retries) {
          attempt++
          setTimeout(function () {
            tryNext(resolve, reject)
          }, self.retryDelay * attempt)
        } else {
          reject(lastError)
        }
      })
  }
  return new Promise(tryNext)
}

VaultClient.prototype.get_dkim_keys = async function (domain) {
  const self = this
  if (!domain) {
    return Promise.reject(new Error('Domain is required to fetch DKIM keys'))
  }
  const cacheKey = self.get_cache_key(`dkim/${domain}`)
  const cached = await self.get_from_cache(cacheKey)
  if (cached) {
    return cached
  }
  return self
    .retry_operation(function () {
      return self.client.read(`secret/data/dkim/${domain}`)
    })
    .then(function (response) {
      if (!response || !response.data || !response.data.data) {
        throw new Error(`No DKIM keys found for domain: ${domain}`)
      }
      const keys = response.data.data
      if (!keys.privateKey || !keys.publicKey) {
        throw new Error(`Invalid DKIM key structure for domain: ${domain}`)
      }
      return self.set_cache(cacheKey, keys).then(() => keys)
    })
    .catch(function (error) {
      if (
        (error.response && error.response.statusCode === 404) ||
        (error.message && error.message.includes('404'))
      ) {
        throw new Error(`DKIM keys not found in Vault for domain: ${domain}`)
      }
      throw new Error(`Failed to fetch DKIM keys from Vault: ${error.message}`)
    })
}

VaultClient.prototype.health_check = function () {
  const self = this
  return self.client
    .health()
    .then(function (response) {
      return {
        initialized: response.initialized,
        sealed: response.sealed,
        standby: response.standby,
        healthy: response.initialized && !response.sealed,
      }
    })
    .catch(function (error) {
      return {
        healthy: false,
        error: error.message,
      }
    })
}

VaultClient.prototype.clear_cache = function () {
  return this.cache.clearCache()
}

VaultClient.prototype.clear_domain_cache = function (domain) {
  return this.cache.clearDomainCache(domain)
}

exports.VaultClient = VaultClient
