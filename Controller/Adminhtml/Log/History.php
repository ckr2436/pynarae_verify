<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Log;

use Magento\Backend\App\Action;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\Controller\Result\JsonFactory;
use Pynarae\Verify\Model\CodeFormatter;

use Magento\Framework\App\Action\HttpGetActionInterface;

class History extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::logs';

    public function __construct(
        Action\Context $context,
        private JsonFactory $jsonFactory,
        private ResourceConnection $resourceConnection,
        private CodeFormatter $codeFormatter
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $result = $this->jsonFactory->create();

        $rawCode = (string)$this->getRequest()->getParam('code', '');
        $code = $this->codeFormatter->normalize($rawCode);

        if ($code === '') {
            return $result->setData([
                'success' => false,
                'message' => (string)__('The "code" query parameter is required.'),
                'items' => [],
            ]);
        }

        $limit = (int)$this->getRequest()->getParam('limit', 50);
        $limit = max(1, min($limit, 500));

        $connection = $this->resourceConnection->getConnection();
        $table = $this->resourceConnection->getTableName('pynarae_verify_scan_log');

        $select = $connection->select()
            ->from($table, ['created_at', 'ip', 'user_agent', 'matched', 'verify_status'])
            ->where('code = ?', $code)
            ->order('entity_id DESC')
            ->limit($limit);

        $rows = $connection->fetchAll($select);

        $items = array_map(static function (array $row): array {
            return [
                'scanned_at' => (string)($row['created_at'] ?? ''),
                'ip' => (string)($row['ip'] ?? ''),
                'user_agent' => (string)($row['user_agent'] ?? ''),
                'matched' => ((int)($row['matched'] ?? 0)) === 1,
                'verify_status' => (string)($row['verify_status'] ?? ''),
            ];
        }, $rows);

        return $result->setData([
            'success' => true,
            'code' => $code,
            'total' => count($items),
            'items' => $items,
        ]);
    }
}
