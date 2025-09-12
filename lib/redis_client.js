'use strict'

const redis = require('redis')

class RedisClient {
  constructor(config) {
    config = config || {}
    this.host = config.host || '127.0.0.1'
    this.port = config.port || 6379
    this.username = config.username || undefined
    this.password = config.password || undefined
    this.db = config.db !== undefined ? config.db : 0
    this.ttl = config.ttl || 3600
    this.prefix = config.prefix || 'dkim:'

    this.client = redis.createClient({
      url: `redis://${this.host}:${this.port}`,
      username: this.username,
      password: this.password,
      database: this.db,
    })
  }

  async connect() {
    await this.client.connect()
  }

  async get_from_cache(key) {
    const data = await this.client.get(this.prefix + key)
    if (!data) return null
    try {
      return JSON.parse(data)
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      return null
    }
  }

  async set_cache(key, value) {
    await this.client.set(
      this.prefix + key,
      JSON.stringify(value),
      'EX',
      this.ttl
    )
  }

  async clear_cache() {
    // This will clear all keys with the prefix
    const keys = await this.client.keys(this.prefix + '*')
    if (!keys.length) return
    await this.client.del(keys)
  }

  async clear_domain_cache(domain) {
    const key = this.prefix + `vault:dkim/${domain}`
    await this.client.del(key)
  }
}

module.exports = { RedisClient }
