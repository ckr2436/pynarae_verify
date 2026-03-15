# Pynarae_Verify

Production-ready Magento 2 authenticity verification module for `pynarae.com`.

## Features

- Frontend verification page at `/verify`
- Mobile camera QR scan on `/verify` when browser supports `getUserMedia` + `BarcodeDetector` (desktop shows mobile-scan guidance)
- QR-friendly verification URLs, for example:
  - `https://pynarae.com/verify?code=PYN-ABCD1234EFGH`
- Verification code master table
- Verification scan logs
- First-scan / repeat-scan / invalid handling
- Configurable customer-facing messages
- Admin management pages:
  - Verify Codes
  - Scan Logs
- Admin create / edit / delete
- Admin mass actions:
  - Enable
  - Disable
  - Delete
- CSV import command
- CSV generation command with optional DB insert

## Installation

Unzip to:

```text
app/code/Pynarae/Verify
```

Then run:

```bash
cd /opt/apps/magento
php bin/magento module:enable Pynarae_Verify
php bin/magento setup:upgrade
php bin/magento cache:flush
```

If your store is in production mode, also run:

```bash
php bin/magento setup:di:compile
php bin/magento setup:static-content:deploy -f en_US
php bin/magento cache:flush
```

## Frontend URL

```text
https://pynarae.com/verify
```

## CSV import format

Header row:

```csv
code,product_sku,batch_no,status,notes,meta_json
```

Example:

```csv
code,product_sku,batch_no,status,notes,meta_json
PYN-ABCD1234EFGH,PYN-SERUM-30ML,L260315A,1,Initial batch,"{""channel"":""website""}"
PYN-HJKL5678MNPR,PYN-SERUM-30ML,L260315A,1,Initial batch,"{""channel"":""website""}"
```

Import:

```bash
php bin/magento pynarae:verify:import-csv var/import/pynarae_verify_codes.csv
```

## Generate new codes to CSV

```bash
php bin/magento pynarae:verify:generate-csv \
  --count=1000 \
  --length=12 \
  --prefix=PYN- \
  --sku=PYN-SERUM-30ML \
  --batch=L260315A \
  --output=var/export/pynarae_verify_codes.csv \
  --insert=1
```

Generated CSV columns:

```csv
code,product_sku,batch_no,status,notes,meta_json,verify_url
```

`verify_url` can be directly converted to QR codes by your label/printing workflow for batch anti-counterfeit deployment.


## Scan history API (Admin)

For customer service / risk-control use, admins can query per-code scan history:

```text
GET /admin/pynarae_verify/log/history?code=PYN-ABCD1234EFGH&limit=50
```

Response fields include each scan's timestamp (`scanned_at`), `ip`, `user_agent`, `matched`, and `verify_status`.

> Requires admin authentication and `Pynarae_Verify::logs` permission.

## Admin pages

- `Pynarae > Verify Codes`
- `Pynarae > Scan Logs`
- `Pynarae > Settings`

## Notes

- Verification page is deliberately marked non-cacheable and `NOINDEX,NOFOLLOW`.
- Code format is normalized to uppercase and trimmed before validation.
- Invalid lookups are logged too, which helps detect abuse or counterfeit attempts.

## Troubleshooting

### Admin login error: `Could not create an acl object ... DOMXPath::query(): Invalid expression`

This Magento error means at least one ACL XML resource id is malformed (in this module or another installed module).

Recommended checks:

1. Validate every `etc/acl.xml` file and ensure each `resource id` follows Magento conventions (for example `Vendor_Module::permission_key`, only letters/numbers/underscore).
2. Confirm every ACL id referenced by:
   - `etc/adminhtml/menu.xml` (`resource="..."`)
   - `etc/adminhtml/system.xml` (`<resource>...</resource>`)
   - admin controllers (`ADMIN_RESOURCE` constants)
   exists in some `etc/acl.xml`.
3. Rebuild metadata/cache:

```bash
php bin/magento cache:flush
php bin/magento setup:di:compile
```

For this module specifically, ACL resource definitions are in `etc/acl.xml`, and the file now uses the Magento 2.4.x recommended root structure: `<config><acl><resources>...</resources></acl></config>`.

## Package contents

This ZIP contains the full module source. No file is omitted.
