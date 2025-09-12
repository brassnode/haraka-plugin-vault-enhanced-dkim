'use strict'

const vault = require('node-vault')

class VaultClient {
  constructor(config, cache) {
    config = config || {}
    this.retryCount = parseInt(config.retry_count) || 3
    this.retryDelay = parseInt(config.retry_delay) || 1000
    this.cache = cache

    this.client = vault({
      apiVersion: 'v1',
      endpoint: config.addr || 'http://127.0.0.1:8200',
      token: config.token || '',
      requestOptions: {
        timeout: parseInt(config.timeout) || 5000,
      },
    })
  }

  async health_check() {
    return this.client.health()
  }

  get_cache_key(path) {
    return `vault:${path}`
  }

  get_from_cache(key) {
    return this.cache.get_from_cache(key)
  }

  set_cache(key, data) {
    return this.cache.set_cache(key, data)
  }

  retry_operation(operation, retries) {
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

  async get_dkim_data(domain) {
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
        return self.client.read(`dkim/${domain}`)
      })
      .then(function (response) {
        if (!response || !response.data || !response.data) {
          throw new Error(`No DKIM keys found for domain: ${domain}`)
        }
        const keys = response.data
        if (!keys.private_key || !keys.public_key) {
          throw new Error(`Invalid DKIM key structure for domain: ${domain}`)
        }
        return self.set_cache(cacheKey, keys).then(() => keys)
      })
      .catch(function (error) {
        if (error.response && error.response.statusCode === 404) {
          throw new Error(`DKIM keys not found in Vault for domain: ${domain}`)
        }
        throw new Error(
          `Failed to fetch DKIM keys from Vault: ${error.message}`
        )
      })
  }

  clear_cache() {
    return this.cache.clear_cache()
  }

  clear_domain_cache(domain) {
    return this.cache.clear_domain_cache(domain)
  }
}

exports.VaultClient = VaultClient
