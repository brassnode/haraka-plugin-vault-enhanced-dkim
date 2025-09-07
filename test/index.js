const assert = require('node:assert/strict')
const { beforeEach, describe, it } = require('node:test')

// npm modules
const fixtures = require('haraka-test-fixtures')

// start of tests
//    assert: https://nodejs.org/api/assert.html

beforeEach(() => {
  this.plugin = new fixtures.plugin('template')
})

describe('template', () => {
  it('loads', () => {
    assert.ok(this.plugin)
  })
})

describe('load_template_ini', () => {
  it('loads template.ini from config/template.ini', () => {
    this.plugin.load_template_ini()
    assert.ok(this.plugin.cfg)
  })

  it('initializes enabled boolean', () => {
    this.plugin.load_template_ini()
    assert.equal(this.plugin.cfg.main.enabled, true, this.plugin.cfg)
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
