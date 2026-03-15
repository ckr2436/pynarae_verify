<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model\ResourceModel;

use Magento\Framework\Model\ResourceModel\Db\AbstractDb;

class Code extends AbstractDb
{
    protected function _construct(): void
    {
        $this->_init('pynarae_verify_code', 'entity_id');
    }
}
