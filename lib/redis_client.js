'use strict'

const redis = require('redis')
const { promisify } = require('util')

function RedisClient(config) {
  config = config || {}
  this.host = config.host || '127.0.0.1'
  this.port = config.port || 6379
  this.password = config.password || undefined
  this.db = config.db !== undefined ? config.db : 0
  this.ttl = config.ttl || 3600
  this.prefix = config.prefix || 'dkim:'

  this.client = redis.createClient({
    url: `redis://${this.host}:${this.port}`,
    password: this.password,
    database: this.db,
  })

  // Promisify get/set/del
  this.getAsync = promisify(this.client.get).bind(this.client)
  this.setAsync = promisify(this.client.set).bind(this.client)
  this.delAsync = promisify(this.client.del).bind(this.client)
}

RedisClient.prototype.get_from_cache = async function (key) {
  const data = await this.getAsync(this.prefix + key)
  if (!data) return null
  try {
    return JSON.parse(data)
  } catch (e) {
    return null
  }
}

RedisClient.prototype.set_cache = async function (key, value) {
  await this.setAsync(this.prefix + key, JSON.stringify(value), 'EX', this.ttl)
}

RedisClient.prototype.clear_cache = async function () {
  // This will clear all keys with the prefix
  const keys = await promisify(this.client.keys).bind(this.client)(
    this.prefix + '*'
  )
  if (!keys.length) return
  await this.delAsync(keys)
}

RedisClient.prototype.clear_domain_cache = async function (domain) {
  const key = this.prefix + `vault:dkim/${domain}`
  await this.delAsync(key)
}

module.exports = { RedisClient }
