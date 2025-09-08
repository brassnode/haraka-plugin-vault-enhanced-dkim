const assert = require('node:assert')
const { beforeEach, describe, it } = require('node:test')
const path = require('path')
const sinon = require('sinon')

const fixtures = require('haraka-test-fixtures')

beforeEach(() => {
  this.plugin = new fixtures.plugin('vault-enhanced-dkim')
  this.plugin.config.root_path = path.resolve('test', 'config')
  delete this.plugin.config.overrides_path

  sinon.stub(this.plugin, 'initialize_redis_connection').resolves()
  sinon.stub(this.plugin, 'check_vault_connectivity').resolves()
})

describe('plugin', () => {
  it('loads', () => {
    assert.ok(this.plugin)
  })

  it('loads vault_enhanced_dkim.ini', () => {
    this.plugin.load_vault_enhanced_dkim_ini()
    assert.ok(this.plugin.cfg)
  })

  it('initializes enabled boolean', () => {
    this.plugin.load_vault_enhanced_dkim_ini()
    assert.equal(this.plugin.cfg.sign.enabled, true, this.plugin.cfg)
  })
})

describe('uses text fixtures', () => {
  it('sets up a connection', () => {
    this.connection = fixtures.connection.createConnection({})
    assert.ok(this.connection.server)
  })

  it('sets up a transaction', () => {
    this.connection = fixtures.connection.createConnection({})
    this.connection.init_transaction()
    assert.ok(this.connection.transaction.header)
  })
})

const expectedCfg = {
  main: {},
  vault: {
    addr: 'http://vault:8200',
    token: '',
    timeout: 5000,
    retry_count: 3,
    retry_delay: 1000,
  },
  redis: {
    host: '127.0.0.1',
    port: 6379,
    password: '',
    db: 0,
    cache_ttl: 3600,
  },
  sign: {
    enabled: false,
    selector: 'mail',
    domain: 'example.com',
    headers:
      'From, Sender, Reply-To, Subject, Date, Message-ID, To, Cc, MIME-Version',
  },
  verify: {
    enabled: true,
    timeout: 29,
    allowed_time_skew: 60,
    sigerror_log_level: 'info',
  },
  headers_to_sign: [
    'from',
    'sender',
    'reply-to',
    'subject',
    'date',
    'message-id',
    'to',
    'cc',
    'mime-version',
  ],
}

describe('register', () => {
  beforeEach(() => {
    this.plugin.config.root_path = path.resolve(__dirname, '../config')
  })

  it('registers', async () => {
    assert.deepEqual(this.plugin.cfg, undefined)
    await this.plugin.register()
    assert.ok(this.plugin.initialize_redis_connection.calledOnce)
    assert.ok(this.plugin.check_vault_connectivity.calledOnce)
    assert.deepEqual(this.plugin.cfg, expectedCfg)
  })
})

describe('load_vault_enhanced_dkim_ini', () => {
  beforeEach(() => {
    this.plugin.config.root_path = path.resolve(__dirname, '../config')
  })

  it('loads vault_enhanced_dkim.ini', () => {
    assert.deepEqual(this.plugin.cfg, undefined)
    this.plugin.load_vault_enhanced_dkim_ini()
    assert.deepEqual(this.plugin.cfg, expectedCfg)
  })
})
