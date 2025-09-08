'use strict'

const redis = require('redis')
const { promisify } = require('util')

function RedisClient(config) {
  config = config || {}
  this.host = config.redis_host || '127.0.0.1'
  this.port = config.redis_port || 6379
  this.ttl = parseInt(config.cache_ttl) || 3600 // seconds

  this.client = redis.createClient({
    host: this.host,
    port: this.port,
    password: config.redis_password,
    db: config.redis_db || 0,
  })

  // Promisify get/set/del
  this.getAsync = promisify(this.client.get).bind(this.client)
  this.setAsync = promisify(this.client.set).bind(this.client)
  this.delAsync = promisify(this.client.del).bind(this.client)
}

RedisClient.prototype.getCacheKey = function (path) {
  return `vault:${path}`
}

RedisClient.prototype.getFromCache = async function (key) {
  const data = await this.getAsync(key)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    return null
  }
}

RedisClient.prototype.setCache = async function (key, value) {
  await this.setAsync(key, JSON.stringify(value), 'EX', this.ttl)
}

RedisClient.prototype.clearCache = async function () {
  // WARNING: This will delete all keys in the Redis DB!
  // Use with caution in production.
  await promisify(this.client.flushdb).bind(this.client)()
}

RedisClient.prototype.clearDomainCache = async function (domain) {
  const key = this.getCacheKey(`dkim/${domain}`)
  await this.delAsync(key)
}

module.exports = { RedisClient }
