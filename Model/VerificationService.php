<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\App\RequestInterface;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\DB\Sql\Expression;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\HTTP\PhpEnvironment\RemoteAddress;
use Magento\Framework\Stdlib\DateTime\DateTime;
use Pynarae\Verify\Model\Source\Status;

class VerificationService
{
    public function __construct(
        private ResourceConnection $resourceConnection,
        private DateTime $dateTime,
        private RemoteAddress $remoteAddress,
        private RequestInterface $request,
        private Config $config,
        private CodeFormatter $codeFormatter,
        private SecureTokenService $secureTokenService
    ) {
    }

    public function verify(string $rawCode): array
    {
        $submitted = trim($rawCode);
        $decodedPayload = null;

        if ($submitted === '') {
            $this->logAttempt(null, '', false, 'empty');
            return [
                'status' => 'error',
                'title' => (string)__('Code not found'),
                'message' => $this->config->getInvalidMessage(),
                'code' => '',
                'matched' => false,
            ];
        }

        if (str_starts_with($submitted, 'PV1.')) {
            try {
                $decodedPayload = $this->secureTokenService->parseToken($submitted);
                $submitted = (string)($decodedPayload['code'] ?? '');
            } catch (LocalizedException $e) {
                $this->logAttempt(null, mb_substr($submitted, 0, 64), false, 'invalid_token');
                return [
                    'status' => 'error',
                    'title' => (string)__('Code not found'),
                    'message' => $this->config->getInvalidMessage(),
                    'code' => mb_substr($rawCode, 0, 64),
                    'matched' => false,
                ];
            }
        }

        $code = $this->codeFormatter->normalize($submitted);

        if ($code === '' || !$this->codeFormatter->isValidFormat($code)) {
            $this->logAttempt(null, $code, false, 'invalid_format');

            return [
                'status' => 'error',
                'title' => (string)__('Code not found'),
                'message' => $this->config->getInvalidMessage(),
                'code' => $code,
                'matched' => false,
            ];
        }

        $connection = $this->resourceConnection->getConnection();
        $codeTable = $this->resourceConnection->getTableName('pynarae_verify_code');

        $row = $connection->fetchRow(
            $connection->select()
                ->from($codeTable)
                ->where('code = ?', $code)
                ->limit(1)
        );

        if (!$row || (int)$row['status'] !== Status::ENABLED) {
            $this->logAttempt(
                isset($row['entity_id']) ? (int)$row['entity_id'] : null,
                $code,
                false,
                'invalid'
            );

            return [
                'status' => 'error',
                'title' => (string)__('Code not found'),
                'message' => $this->config->getInvalidMessage(),
                'code' => $code,
                'matched' => false,
            ];
        }

        $isFirstScan = (int)$row['scan_count'] === 0;
        $newScanCount = ((int)$row['scan_count']) + 1;
        $now = $this->dateTime->gmtDate();

        try {
            $connection->beginTransaction();

            $updateData = [
                'last_scanned_at' => $now,
                'scan_count' => new Expression('scan_count + 1'),
            ];

            if ($isFirstScan) {
                $updateData['first_scanned_at'] = $now;
            }

            $connection->update(
                $codeTable,
                $updateData,
                ['entity_id = ?' => (int)$row['entity_id']]
            );

            $this->logAttempt((int)$row['entity_id'], $code, true, $isFirstScan ? 'valid_first' : 'valid_repeat');

            $connection->commit();
        } catch (\Throwable $e) {
            $connection->rollBack();
            throw new LocalizedException(__('Could not complete verification. Please try again later.'));
        }

        $title = $isFirstScan
            ? (string)__('Authentic product confirmed')
            : (string)__('This code was verified before');

        $message = $isFirstScan
            ? $this->config->getFirstScanMessage()
            : $this->config->getRepeatScanMessage();

        if (!$isFirstScan && $newScanCount >= $this->config->getSuspiciousThreshold()) {
            $title = (string)__('Repeated verification detected');
            $message = trim($message . ' ' . (string)__('Total verification count: %1.', $newScanCount));
        }

        return [
            'status' => $isFirstScan ? 'success' : 'notice',
            'title' => $title,
            'message' => $message,
            'code' => $code,
            'matched' => true,
            'is_first_scan' => $isFirstScan,
            'scan_count' => $newScanCount,
            'product_sku' => (string)($row['product_sku'] ?? ($decodedPayload['sku'] ?? '')),
            'batch_no' => (string)($row['batch_no'] ?? ($decodedPayload['batch'] ?? '')),
            'product_name' => (string)($decodedPayload['product_name'] ?? ''),
            'first_scanned_at' => $isFirstScan ? $now : (string)($row['first_scanned_at'] ?? ''),
            'last_scanned_at' => $now,
        ];
    }

    private function logAttempt(?int $codeId, string $code, bool $matched, string $verifyStatus): void
    {
        $connection = $this->resourceConnection->getConnection();
        $logTable = $this->resourceConnection->getTableName('pynarae_verify_scan_log');

        $connection->insert($logTable, [
            'code_id' => $codeId,
            'code' => mb_substr($code, 0, 64),
            'matched' => $matched ? 1 : 0,
            'verify_status' => mb_substr($verifyStatus, 0, 32),
            'ip' => (string)$this->remoteAddress->getRemoteAddress(),
            'user_agent' => (string)$this->request->getServer('HTTP_USER_AGENT'),
            'referer' => (string)$this->request->getServer('HTTP_REFERER'),
            'created_at' => $this->dateTime->gmtDate(),
        ]);
    }
}
