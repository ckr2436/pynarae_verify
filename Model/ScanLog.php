<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\Model\AbstractModel;
use Pynarae\Verify\Model\ResourceModel\ScanLog as ResourceModel;

class ScanLog extends AbstractModel
{
    protected function _construct(): void
    {
        $this->_init(ResourceModel::class);
    }
}
