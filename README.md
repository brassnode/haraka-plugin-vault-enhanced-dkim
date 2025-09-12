# haraka-plugin-vault-enhanced-dkim

[![CI Test Status][ci-img]][ci-url]
[![Code Climate][clim-img]][clim-url]

A Haraka plugin that integrates with HashiCorp Vault to securely manage DKIM signing keys for multiple domains.

## Overview

This plugin implements the [DKIM Core specification](dkimcore.org) with enhanced security by storing DKIM keys in HashiCorp Vault instead of the filesystem.

### Key Features

- Centralized DKIM key management using HashiCorp Vault
- Automatic key retrieval for multiple domains
- Secure key storage with audit trails
- No local key files required

## Install

```sh
cd /path/to/local/haraka
npm install @brassnode/haraka-plugin-vault-enhanced-dkim
echo "vault-enhanced-dkim" >> config/plugins
service haraka restart
```

## Vault Configuration

### Prerequisites

1. HashiCorp Vault server installed and configured
2. KV v2 secrets engine enabled
3. Appropriate Vault authentication configured

### Key Storage Structure

DKIM keys are stored in Vault under the following path structure:

```txt
dkim/{domain-name}
```

Each domain's secret should contain the following keys:

```json
{
  "selector": "your-selector",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\n...",
  "public_key": "-----BEGIN PUBLIC KEY-----\n...",
  "domain": "example.com",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### Vault Permissions

The Vault token/role used by this plugin needs the following capabilities:

```hcl
path "kv/data/dkim/*" {
  capabilities=["read"]
}

path "kv/metadata/dkim/*" {
  capabilities=["read", "list"]
}
```

### Generating and Storing Keys

This plugin includes a key generation script that creates DKIM keys and stores them directly in Vault or in the local filesystem:

Set Vault environment variables (if using vault storage)

```sh
export VAULT_ADDR="http://vault.example.com:8200"
export VAULT_TOKEN="your-vault-token"
```

Usage:

```sh
./config/dkim/dkim_key_gen.sh <domain> [--store vault|local] [--path path_prefix]

Arguments:
  DOMAIN               Domain name to generate DKIM keys for (required)
  --store vault|local  Storage mode for the generated keys (default: vault)
  --path path_prefix   Optional path prefix:
                      - For vault: Path prefix in Vault (default: dkim)
                      - For local: Directory path (default: ./config/dkim)
```

Examples:

Generate and store in Vault (default path: ./config/dkim)

```sh
./config/dkim/dkim_key_gen.sh example.com
```

Generate and store in local filesystem with default path (./config/dkim)

```sh
./config/dkim/dkim_key_gen.sh example.com --store local
```

Generate and store in Vault with  with default path (dkim/example.com)

```sh
./config/dkim/dkim_key_gen.sh example.com --store vault
```

Generate and store in local filesystem with custom path (custom/local/path)

```sh
./config/dkim/dkim_key_gen.sh example.com --store local --path /custom/local/path
```

Generate and store in Vault with custom path (custom/path/example.com)

```sh
./config/dkim/dkim_key_gen.sh example.com --store vault --path custom/path
```

The script will:

1. Generate a 2048-bit RSA key pair
2. Create a selector in the format `mmmYYYY` (e.g., `jan2024`)
3. Store the keys in Vault at `dkim/example.com` or in the local filesystem at `./config/dkim/example.com` (or custom paths if specified)
4. Display DNS configuration instructions

## Plugin Configuration

### vault_enhanced_dkim.ini

```ini
[main]

[vault]
addr=http://vault.example.com:8200
token=your-vault-token
timeout=5000
retry_count=3
retry_delay=1000

[redis]
host=127.0.0.1
port=6379
password=
db=0
cache_ttl=3600

[sign]
enabled=false
selector=mail
domain=example.com
headers=From, Sender, Reply-To, Subject, Date, Message-ID, To, Cc, MIME-Version

[verify]
enabled=true
allowed_time_skew=60
sigerror_log_level=info
```

### Vault Configuration Notes

- `addr`: Your Vault server address (e.g., `http://vault:8200` or `https://vault.example.com:8200`)
- `token`: Vault authentication token (can also be set via `VAULT_TOKEN` environment variable)
- `timeout`: Connection timeout for Vault requests (milliseconds)
- `retry_count`: Number of times to retry failed Vault requests
- `retry_delay`: Time to wait between retries (milliseconds)

### Redis Cache Configuration Notes

- `host`: Redis server hostname (default: 127.0.0.1)
- `port`: Redis server port (default: 6379)
- `password`: Redis password (if required)
- `db`: Redis database number (default: 0)
- `cache_ttl`: Time-to-live for cached DKIM keys in seconds (default: 3600)

### Sign Configuration Notes

- `enabled`: Set to `true` to enable DKIM signing
- `selector`: Fallback selector if domain not found in Vault
- `domain`: Fallback domain if not determined from message
- `headers`: List of headers to include in DKIM signature. The From header is always included

### Verify Configuration Notes

- `enabled`: Set to `true` to verify incoming DKIM signatures
- `allowed_time_skew`: Tolerance for timestamp differences (seconds). Useful when clock is skewed
- `sigerror_log_level`: Logging level for signature errors (debug, info, warn, error)

## DNS Configuration

For each domain stored in Vault, you need to publish the public key in DNS:

```txt
{selector}._domainkey.{domain}. IN TXT "v=DKIM1; k=rsa; p={public_key_base64}"
```

Example:

```txt
202401._domainkey.example.com. IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQ..."
```

## Signing Behavior

1. When an email is received, the plugin extracts the sender's domain
2. It queries Vault for DKIM keys at `dkim/{domain}`
3. If keys are found, the message is signed with the domain's DKIM key
4. If no keys are found, the message is not signed (or uses a default if configured)

## Verification Behaviour

Verify DKIM signatures as defined by RFC 6376 and add an Authentication-Results header as appropriate.

When verification is enabled, the plugin:

1. **Extracts DKIM-Signature headers** from incoming messages
2. **Retrieves the public key** from DNS using the selector and domain specified in the signature
3. **Validates the signature** against the message body and signed headers
4. **Adds Authentication-Results header** with the verification result

### Authentication-Results Header Format

The plugin adds headers in the following format:

```txt
Authentication-Results: mail.example.com;
  dkim=pass (2048-bit key) header.d=sender.com header.i=@sender.com header.b="signature_fragment"
```

Possible results:

- `pass`: Signature validated successfully
- `fail`: Signature validation failed
- `neutral`: Unable to verify (e.g., DNS lookup failed)
- `temperror`: Temporary failure during verification
- `permerror`: Permanent error in signature or key format

### Verification Process Details

1. **Header Canonicalization**: Headers are normalized according to the canonicalization method specified in the signature (simple or relaxed)
2. **Body Hash Verification**: The body hash in the signature is compared against a computed hash of the message body
3. **Signature Validation**: The signature is validated using the public key retrieved from DNS
4. **Time Skew Handling**: Signatures are accepted within the configured `allowed_time_skew` to handle clock differences

## Migration from Standard DKIM Plugin

To migrate from the standard haraka-plugin-dkim:

1. Extract your existing DKIM keys from the filesystem
2. Store them in Vault using the structure shown above
3. Update your Haraka configuration to use vault-enhanced-dkim
4. Remove the old dkim plugin and configuration files

## Testing

This plugin provides a command-line test tool that can be used to
debug DKIM issues or to check results.

```txt
# dkimverify < message
identity="@gmail.com" domain="gmail.com" result=pass
```

You can add `--debug` to the option arguments to see a full trace of the processing.

## Troubleshooting

### Common Issues

1. **Vault connection errors**: Check your Vault address and network connectivity
2. **Authentication failures**: Verify your token/credentials are valid
3. **Key not found**: Ensure the domain exists in Vault at the correct path
4. **DNS verification failures**: Verify your DNS TXT record matches the public key in Vault

### Verify Vault Connectivity

```sh
# List all domains with DKIM keys
vault kv list dkim

# View keys for a specific domain
vault kv get dkim/example.com
```

## Notes

This plugin and underlying library do not currently support DKIM body length limits (l=).

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

### Top contributors

![Contributors](https://contrib.rocks/image?repo=brassnode/haraka-plugin-vault-enhanced-dkim)

## License

Distributed under the Unlicense License. See [LICENSE](https://github.com/brassnode/haraka-plugin-vault-enhanced-dkim/blob/master/LICENSE) for more information.

## Contact

Abdulmatin Sanni - [@abdulmatinsanni](https://x.com/abdulmatinsanni) - <abdulmatin@brassnode.com>
