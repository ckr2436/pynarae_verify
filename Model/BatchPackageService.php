<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Filesystem;
use Magento\Framework\Phrase;
use Magento\Framework\Stdlib\DateTime\DateTime;
use Magento\Framework\UrlInterface;
use Magento\Store\Model\StoreManagerInterface;

class BatchPackageService
{
    public function __construct(
        private readonly ResourceConnection $resourceConnection,
        private readonly CodeGenerator $codeGenerator,
        private readonly Config $config,
        private readonly SecureTokenService $secureTokenService,
        private readonly QrSvgGenerator $qrSvgGenerator,
        private readonly StoreManagerInterface $storeManager,
        private readonly Filesystem $filesystem,
        private readonly DateTime $dateTime
    ) {
    }

    /**
     * @param array<string,mixed> $params
     * @return array<string,mixed>
     */
    public function generate(array $params): array
    {
        $count = max(1, (int)($params['count'] ?? 1));
        if ($count > 50000) {
            throw new LocalizedException(new Phrase('Count cannot exceed 50000 in one batch generation.'));
        }

        $length = max(6, (int)($params['length'] ?? 12));
        $prefix = trim((string)($params['prefix'] ?? 'PYN-'));
        $sku = trim((string)($params['product_sku'] ?? ''));
        $batchNo = trim((string)($params['batch_no'] ?? ''));
        $productName = trim((string)($params['product_name'] ?? ''));
        $notes = trim((string)($params['notes'] ?? ''));
        $status = ((int)($params['status'] ?? 1)) === 0 ? 0 : 1;
        $insert = ((int)($params['insert_db'] ?? 1)) === 1;
        $includeQrSvg = ((int)($params['include_qr_svg'] ?? 1)) === 1;
        $qrSize = max(120, (int)($params['qr_size'] ?? 300));
        $qrMargin = max(0, (int)($params['qr_margin'] ?? 2));

        $metaJson = trim((string)($params['meta_json'] ?? ''));
        if ($metaJson !== '') {
            json_decode($metaJson, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new LocalizedException(new Phrase('Meta JSON is invalid.'));
            }
        }

        $connection = $this->resourceConnection->getConnection();
        $table = $this->resourceConnection->getTableName('pynarae_verify_code');
        $existsCallback = function (string $code) use ($connection, $table): bool {
            $select = $connection->select()
                ->from($table, ['entity_id'])
                ->where('code = ?', $code)
                ->limit(1);

            return (bool)$connection->fetchOne($select);
        };

        $codes = $this->codeGenerator->generateBatch($count, $length, $prefix, $existsCallback);

        $verifyBaseUrl = rtrim($this->config->getQrVerifyBaseUrl(), '/');
        if ($verifyBaseUrl === '') {
            $storeBaseUrl = rtrim($this->storeManager->getStore()->getBaseUrl(UrlInterface::URL_TYPE_WEB), '/');
            $verifyBaseUrl = $storeBaseUrl . '/verify';
        }

        $paramName = $this->config->getQrCodeParam();
        $verifySeparator = str_contains($verifyBaseUrl, '?') ? '&' : '?';
        $qrImageTemplate = $this->config->getQrImageUrlTemplate();
        $hasQrImageTemplate = $qrImageTemplate !== '';
        $secureTokenEnabled = $this->secureTokenService->isEnabled();

        $exportRoot = $this->filesystem->getDirectoryWrite(DirectoryList::VAR_DIR);
        $timestamp = $this->dateTime->gmtDate('Ymd_His');
        $batchSlug = preg_replace('/[^A-Za-z0-9\-_]/', '_', $batchNo) ?: 'batch';
        $baseDir = 'export/pynarae_verify_packages/' . $timestamp . '_' . $batchSlug;
        $csvRelativePath = $baseDir . '/verify_codes.csv';
        $qrDirRelativePath = $baseDir . '/qr';
        $zipRelativePath = $baseDir . '/verify_package.zip';

        $exportRoot->create($baseDir);
        if ($includeQrSvg) {
            $exportRoot->create($qrDirRelativePath);
        }

        $csvAbsolutePath = $exportRoot->getAbsolutePath($csvRelativePath);
        $handle = fopen($csvAbsolutePath, 'wb');
        if ($handle === false) {
            throw new LocalizedException(new Phrase('Unable to create CSV file.'));
        }

        $header = ['code', 'product_name', 'product_sku', 'batch_no', 'status', 'notes', 'meta_json', 'verify_value', 'verify_url'];
        if ($secureTokenEnabled) {
            $header[] = 'secure_token_enabled';
        }
        if ($hasQrImageTemplate) {
            $header[] = 'qr_image_url';
        }
        if ($includeQrSvg) {
            $header[] = 'qr_svg_file';
        }
        fputcsv($handle, $header);

        $insertRows = [];
        $qrFiles = [];

        foreach ($codes as $code) {
            $verifyValue = $code;
            if ($secureTokenEnabled) {
                $verifyValue = $this->secureTokenService->generateToken([
                    'code' => $code,
                    'sku' => $sku,
                    'batch' => $batchNo,
                    'product_name' => $productName,
                    'rnd' => substr(hash('sha256', $code . '|' . microtime(true)), 0, 16),
                ]);
            }

            $verifyUrl = $verifyBaseUrl . $verifySeparator . http_build_query([$paramName => $verifyValue]);

            $row = [
                $code,
                $productName,
                $sku,
                $batchNo,
                $status,
                $notes,
                $metaJson,
                $verifyValue,
                $verifyUrl,
            ];

            if ($secureTokenEnabled) {
                $row[] = 1;
            }

            if ($hasQrImageTemplate) {
                $row[] = strtr($qrImageTemplate, [
                    '{VERIFY_URL}' => $verifyUrl,
                    '{VERIFY_URL_ENCODED}' => rawurlencode($verifyUrl),
                    '{CODE}' => $code,
                    '{CODE_ENCODED}' => rawurlencode($code),
                ]);
            }

            if ($includeQrSvg) {
                $safeName = preg_replace('/[^A-Za-z0-9\-_]/', '_', $code) ?: ('qr_' . count($qrFiles));
                $svgRelative = $qrDirRelativePath . '/' . $safeName . '.svg';
                $svgAbsolute = $exportRoot->getAbsolutePath($svgRelative);
                file_put_contents($svgAbsolute, $this->qrSvgGenerator->generate($verifyUrl, $qrSize, $qrMargin));
                $qrFiles[] = $svgRelative;
                $row[] = 'qr/' . $safeName . '.svg';
            }

            fputcsv($handle, $row);

            if ($insert) {
                $insertRows[] = [
                    'code' => $code,
                    'product_sku' => $sku !== '' ? $sku : null,
                    'batch_no' => $batchNo !== '' ? $batchNo : null,
                    'status' => $status,
                    'notes' => $notes !== '' ? $notes : null,
                    'meta_json' => $metaJson !== '' ? $metaJson : null,
                ];
            }
        }

        fclose($handle);

        if ($insert && !empty($insertRows)) {
            foreach ($insertRows as $row) {
                $connection->insertOnDuplicate(
                    $table,
                    $row,
                    ['product_sku', 'batch_no', 'status', 'notes', 'meta_json']
                );
            }
        }

        $zipAbsolutePath = $exportRoot->getAbsolutePath($zipRelativePath);
        $zip = new \ZipArchive();
        $openResult = $zip->open($zipAbsolutePath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
        if ($openResult !== true) {
            throw new LocalizedException(new Phrase('Unable to create ZIP package.'));
        }

        $zip->addFile($csvAbsolutePath, 'verify_codes.csv');
        foreach ($qrFiles as $qrRelativePath) {
            $zip->addFile($exportRoot->getAbsolutePath($qrRelativePath), str_replace($qrDirRelativePath . '/', 'qr/', $qrRelativePath));
        }
        $zip->close();

        return [
            'count' => count($codes),
            'inserted' => $insert,
            'csv_relative_path' => $csvRelativePath,
            'zip_relative_path' => $zipRelativePath,
            'qr_count' => count($qrFiles),
            'secure_token_enabled' => $secureTokenEnabled,
        ];
    }
}
