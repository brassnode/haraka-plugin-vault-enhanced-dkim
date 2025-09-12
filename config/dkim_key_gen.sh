#!/bin/sh

# Print usage information
usage() {
    echo "   usage: ${0} <example.com> [--store vault|local] [path_prefix]" 2>&1
    echo "   " 2>&1
    echo "   Arguments:" 2>&1
    echo "     DOMAIN               Domain name to generate DKIM keys for (required)" 2>&1
    echo "     --store vault|local  Storage mode for the generated keys (default: vault)" 2>&1
    echo "     [path_prefix]        Optional path prefix:" 2>&1
    echo "                        - For vault: Path prefix in Vault (default: dkim)" 2>&1
    echo "                        - For local: Directory path (default: ./config/dkim)" 2>&1
    echo 2>&1
    exit 1
}

# Parse and validate command line arguments
parse_arguments() {
    # Initialize defaults
    STORAGE_MODE="vault"
    VAULT_PATH_PREFIX="dkim"
    LOCAL_PATH_PREFIX="./config/dkim"
    DOMAIN=""
    
    # Parse arguments
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --store)
                if [ "$#" -lt 2 ]; then
                    echo "Error: --store requires vault or local argument" >&2
                    usage
                fi
                STORAGE_MODE="$2"
                shift 2
                ;;
            -*)
                echo "Error: Unknown option $1" >&2
                usage
                ;;
            *)
                if [ -z "$DOMAIN" ]; then
                    DOMAIN="$1"
                else
                    if [ "$STORAGE_MODE" = "vault" ]; then
                        VAULT_PATH_PREFIX="$1"
                    else
                        LOCAL_PATH_PREFIX="$1"
                    fi
                fi
                shift
                ;;
        esac
    done

    # Check if domain is provided
    if [ -z "$DOMAIN" ]; then
        echo "Error: Domain name is required" >&2
        usage
    fi
}

# Parse all arguments
parse_arguments "$@"

# Validate storage mode
if [ "$STORAGE_MODE" != "vault" ] && [ "$STORAGE_MODE" != "local" ]; then
    echo "Error: Invalid storage mode. Use --store vault or --store local" 2>&1
    usage
fi

# Check Vault environment if using vault mode
if [ "$STORAGE_MODE" = "vault" ] && { [ -z "$VAULT_ADDR" ] || [ -z "$VAULT_TOKEN" ]; }; then
    echo "Error: VAULT_ADDR and VAULT_TOKEN must be set for vault storage mode" 2>&1
    usage
fi

# Initialize global variables
init_variables() {
    SELECTOR=$(date '+%h%Y' | tr '[:upper:]' '[:lower:]')
}

# Generate and store keys in file system
store_keys_in_file() {
    DKIM_DIR="$LOCAL_PATH_PREFIX"
    DOMAIN_DIR="$DKIM_DIR/$DOMAIN"
    
    mkdir -p "$DOMAIN_DIR"
    
    echo "$SELECTOR" > "$DOMAIN_DIR/selector"
    openssl genrsa -out "$DOMAIN_DIR/private_key" 2048
    chmod 0400 "$DOMAIN_DIR/private_key"
    openssl rsa -in "$DOMAIN_DIR/private_key" -out "$DOMAIN_DIR/public_key" -pubout

    echo "Keys successfully saved to directory: $DOMAIN_DIR/"
}

# Generate and store keys in Vault
store_keys_in_vault() {
    PRIVATE_KEY=$(openssl genrsa 2048 2>/dev/null)
    PUBLIC_KEY=$(echo "$PRIVATE_KEY" | openssl rsa -pubout 2>/dev/null)
    CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

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
}



# Generate and display DNS instructions
display_dns_instructions() {
    echo "$DNS_INSTRUCTIONS"
}

# Main execution flow
main() {
    parse_arguments "$@"
    
    # Validate input
    if [ -z "$DOMAIN" ]; then usage; fi
    
    # Validate storage mode
    if [ "$STORAGE_MODE" != "vault" ] && [ "$STORAGE_MODE" != "local" ]; then
        echo "Error: Invalid storage mode. Use --store vault or --store local" 2>&1
        usage
    fi

    # Check Vault environment if using vault mode
    if [ "$STORAGE_MODE" = "vault" ] && { [ -z "$VAULT_ADDR" ] || [ -z "$VAULT_TOKEN" ]; }; then
        echo "Error: VAULT_ADDR and VAULT_TOKEN must be set for vault storage mode" 2>&1
        usage
    fi

    init_variables

    # Generate and store keys based on storage mode
    if [ "$STORAGE_MODE" = "local" ]; then
        store_keys_in_file
    else
        store_keys_in_vault
    fi

    echo

    # Generate DNS records
    DNS_NAME="${SELECTOR}._domainkey"
    if [ "$STORAGE_MODE" = "local" ]; then
        DNS_ADDRESS="v=DKIM1;p=$(grep -v '^-' "$DOMAIN_DIR/public_key" | tr -d '\n')"
    else
        DNS_ADDRESS="v=DKIM1;p=$(echo "$PUBLIC_KEY" | grep -v '^-' | tr -d '\n')"
    fi

    # Format DNS record
    BIND_SPLIT_ADDRESS="$(echo "$DNS_ADDRESS" | fold -w 110 | sed -e 's/^/	"/g; s/$/"/g')"

    # Create DNS instructions
    DNS_INSTRUCTIONS=$(cat <<EO_DKIM_DNS

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
)

    # Save DNS instructions to file if in local mode
    if [ "$STORAGE_MODE" = "local" ]; then
        echo "$DNS_INSTRUCTIONS" > "$DOMAIN_DIR/dns"
    fi

    # Display DNS instructions
    echo "$DNS_INSTRUCTIONS"
}

# Execute main function with all arguments
main "$@"
