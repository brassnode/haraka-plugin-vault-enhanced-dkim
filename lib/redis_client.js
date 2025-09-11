'use strict'

const redis = require('redis')
const { promisify } = require('util')

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

    this.getAsync = promisify(this.client.get).bind(this.client)
    this.setAsync = promisify(this.client.set).bind(this.client)
    this.delAsync = promisify(this.client.del).bind(this.client)
  }

  async connect() {
    await this.client.connect()
  }

  async get_from_cache(key) {
    const data = await this.getAsync(this.prefix + key)
    if (!data) return null
    try {
      return JSON.parse(data)
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      return null
    }
  }

  async set_cache(key, value) {
    await this.setAsync(
      this.prefix + key,
      JSON.stringify(value),
      'EX',
      this.ttl
    )
  }

  async clear_cache() {
    // This will clear all keys with the prefix
    const keys = await promisify(this.client.keys).bind(this.client)(
      this.prefix + '*'
    )
    if (!keys.length) return
    await this.delAsync(keys)
  }

  async clear_domain_cache(domain) {
    const key = this.prefix + `vault:dkim/${domain}`
    await this.delAsync(key)
  }
}

module.exports = { RedisClient }
