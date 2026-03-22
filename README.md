# Pynarae_Verify

Production-ready Magento 2 authenticity verification module for `pynarae.com`.

## Features

- Frontend verification page at `/verify`
- Mobile camera QR scan on `/verify` with capability routing: native `BarcodeDetector` when available, fallback scanners (`qr-scanner` / `html5-qrcode` / `zxing`) when not
- QR-friendly verification URLs, for example:
  - `https://pynarae.com/verify?code=PYN-ABCD1234EFGH`
- Verification code master table
- Verification scan logs
- First-scan / repeat-scan / invalid handling
- Configurable customer-facing messages
- Admin management pages:
  - Verify Codes
  - Batch Generate (production batch QR package)
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
  --product-name="Repair Serum 30ml" \
  --output=var/export/pynarae_verify_codes.csv \
  --insert=1
```

Generated CSV columns (default):

```csv
code,product_sku,batch_no,product_name,status,notes,meta_json,verify_value,verify_url
```

If encrypted token is enabled, CSV adds:

```csv
...,secure_token_enabled
```

If `QR Image URL Template` is configured, CSV also adds:

```csv
...,qr_image_url
```

This means each row has its own unique verify payload (`verify_value`) and URL (`verify_url`) for printing.




## Offline batch generate QR images (SVG)

```bash
php bin/magento pynarae:verify:export-qr-images \
  --input=var/export/pynarae_verify_codes.csv \
  --output-dir=var/export/pynarae_verify_qr \
  --url-column=verify_url \
  --name-column=code \
  --size=300 \
  --margin=2
```

This command is fully offline and generates one SVG QR image per CSV row.

## Scan history API (Admin)

For customer service / risk-control use, admins can query per-code scan history:

```text
GET /admin/pynarae_verify/log/history?code=PYN-ABCD1234EFGH&limit=50
```

Response fields include each scan's timestamp (`scanned_at`), `ip`, `user_agent`, `matched`, and `verify_status`.

> Requires admin authentication and `Pynarae_Verify::logs` permission.

## Admin pages

- `Pynarae > Verify Codes`
- `Pynarae > Batch Generate`
- `Pynarae > Scan Logs`
- `Pynarae > Settings`

### QR code generation config

In `Stores > Configuration > Pynarae > Product Verify > General`, you can now set:

- `QR Verify Base URL`: the base URL used to build `verify_url` in generated CSV (for example `https://verify.pynarae.com/check`). If empty, module uses current store `https://<store>/verify`.
- `QR Code Parameter Name`: query parameter name used in `verify_url` (default: `code`).
- `QR Image URL Template`: optional QR image template. If configured, generated CSV includes `qr_image_url` for every unique code.
  - Supported placeholders: `{VERIFY_URL}`, `{VERIFY_URL_ENCODED}`, `{CODE}`, `{CODE_ENCODED}`
  - Example template: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={VERIFY_URL_ENCODED}`

- `Enable Encrypted Verify Token`: if enabled, verify URL carries encrypted token instead of plaintext code.
- `Secure Token Secret Key`: required for encryption/decryption and signature verification.
- `Secure Token Expiry (Days)`: optional token expiration in days (`0` = never expires).

When enabled, generated token payload includes `code`, `product_name`, `sku`, `batch`, and random/signature context, and verification decrypts this payload before checking authenticity.

Example generated URL with custom config:

```text
https://verify.pynarae.com/check?vc=PYN-ABCD1234EFGH
```

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


### Production batch generation in Admin

Open `Pynarae > Batch Generate` and fill:

- Product name / SKU / batch number
- Quantity (how many anti-counterfeit QR codes to generate)
- Prefix and random length
- Notes and optional metadata JSON
- Whether to insert generated codes directly into verify DB
- Whether to generate QR SVG files for print packaging

After submit, system generates:

- CSV download URL
- ZIP package download URL (contains CSV + QR SVG files)

Output is stored under:

```text
var/export/pynarae_verify_packages/<timestamp>_<batch>/
```
