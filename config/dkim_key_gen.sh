#!/bin/sh

usage()
{
    echo "   usage: ${0} <example.com> [vault_path_prefix]" 2>&1
    echo "   " 2>&1
    echo "   Requires VAULT_ADDR and VAULT_TOKEN environment variables" 2>&1
    echo 2>&1
    exit 1
}

DOMAIN="$1"
if [ -z "$DOMAIN" ]; then usage; fi

# Check Vault environment
if [ -z "$VAULT_ADDR" ] || [ -z "$VAULT_TOKEN" ]; then
    echo "Error: VAULT_ADDR and VAULT_TOKEN must be set" 2>&1
    usage
fi

# Optional vault path prefix (default: dkim)
VAULT_PATH_PREFIX="${2:-dkim}"

# The selector can be any value that is a valid DNS label
# Create in the common format: mmmYYYY (apr2014)
SELECTOR=$(date '+%h%Y' | tr '[:upper:]' '[:lower:]')

# Generate private and public keys in memory
PRIVATE_KEY=$(openssl genrsa 2048 2>/dev/null)
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | openssl rsa -pubout 2>/dev/null)

# Get current timestamp
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Save to Vault
echo "Saving DKIM keys to Vault at ${VAULT_PATH_PREFIX}/${DOMAIN}..."
vault kv put "${VAULT_PATH_PREFIX}/${DOMAIN}" \
    selector="$SELECTOR" \
    private_key="$PRIVATE_KEY" \
    public_key="$PUBLIC_KEY" \
    domain="$DOMAIN" \
    created_at="$CREATED_AT"

if [ $? -ne 0 ]; then
    echo "Error: Failed to save keys to Vault" 2>&1
    exit 1
fi

echo "Keys successfully saved to Vault!"
echo

# Extract public key for DNS record
DNS_NAME="${SELECTOR}._domainkey"
DNS_ADDRESS="v=DKIM1;p=$(echo "$PUBLIC_KEY" | grep -v '^-' | tr -d '\n')"

# Fold width is arbitrary, any value between 80 and 255 is reasonable
BIND_SPLIT_ADDRESS="$(echo "$DNS_ADDRESS" | fold -w 110 | sed -e 's/^/	"/g; s/$/"/g')"

# Output DNS instructions to terminal
cat <<EO_DKIM_DNS

Add this TXT record to the ${DOMAIN} DNS zone.

${DNS_NAME}    IN   TXT   ${DNS_ADDRESS}


BIND zone file formatted:

${DNS_NAME}    IN   TXT (
${BIND_SPLIT_ADDRESS}
        )

Tell the world that the ONLY mail servers that send mail from this domain are DKIM signed and/or bear our MX and A records.

With SPF:

        SPF "v=spf1 mx a -all"
        TXT "v=spf1 mx a -all"

With DMARC:

_dmarc  TXT "v=DMARC1; p=reject; adkim=s; aspf=r; rua=mailto:dmarc-feedback@${DOMAIN}; ruf=mailto:dmarc-feedback@${DOMAIN}; pct=100"

For more information about DKIM and SPF policy,
the documentation within each plugin contains a longer discussion and links to more detailed information:

   haraka -h dkim
   haraka -h spf

EO_DKIM_DNS
