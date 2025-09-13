/* eslint-disable no-unused-vars */
'use strict'

const redis = require('redis')
const crypto = require('crypto')

class RedisClient {
  constructor(config) {
    config = config || {}
    this.host = config.host || '127.0.0.1'
    this.port = config.port || 6379
    this.username = config.username || undefined
    this.password = config.password || undefined
    this.db = config.db !== undefined ? config.db : 0
    this.ttl = config.ttl || 3600
    this.cache_encryption_key = config.cache_encryption_key || undefined
    this.prefix = config.prefix || 'dkim:'
    this.prefix = this.cache_encryption_key ? `enc:${this.prefix}` : this.prefix
    this.algorithm = 'aes-256-gcm'

    // Validate and set up encryption key if provided
    this._validate_encryption_key()

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

  _validate_encryption_key() {
    if (!this.cache_encryption_key) {
      return
    }

    // Ensure encryption key is valid hex and exactly 32 bytes (256 bits)
    if (!/^[0-9a-fA-F]{64}$/.test(this.cache_encryption_key)) {
      throw new Error(
        'Invalid encryption key: must be 64 hex characters (32 bytes)'
      )
    }

    this.key = Buffer.from(this.cache_encryption_key, 'hex')

    if (!this.key) {
      throw new Error('Encryption key not initialized')
    }
  }

  _encrypt(jsonData) {
    if (!jsonData) {
      throw new Error('No data provided for encryption')
    }

    try {
      const jsonString = JSON.stringify(jsonData)
      const iv = crypto.randomBytes(12) // 96-bit IV is standard for GCM
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv)

      let encrypted = cipher.update(jsonString, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      const authTag = cipher.getAuthTag()

      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`)
    }
  }

  _decrypt(encryptedData) {
    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Invalid encrypted data format')
    }

    const parts = encryptedData.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format')
    }

    const [ivHex, authTagHex, encryptedHex] = parts

    // Validate hex strings aren't empty
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid encrypted data format')
    }

    try {
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv)
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return JSON.parse(decrypted)
    } catch (error) {
      throw new Error('Decryption failed')
    }
  }

  async get_from_cache(key) {
    const data = await this.client.get(this.prefix + key)
    if (!data) return null
    try {
      return this.cache_encryption_key ? this._decrypt(data) : JSON.parse(data)
    } catch (e) {
      console.error('Cache retrieval error:', e.message)
      return null
    }
  }

  async set_cache(key, value) {
    try {
      const data = this.cache_encryption_key
        ? this._encrypt(value)
        : JSON.stringify(value)
      await this.client.set(this.prefix + key, data, 'EX', this.ttl)
    } catch (error) {
      console.error('Cache set error:', error.message)
      throw error
    }
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
