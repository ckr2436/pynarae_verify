<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model\ResourceModel\Code;

use Magento\Framework\Model\ResourceModel\Db\Collection\AbstractCollection;
use Pynarae\Verify\Model\Code as Model;
use Pynarae\Verify\Model\ResourceModel\Code as ResourceModel;

class Collection extends AbstractCollection
{
    protected $_idFieldName = 'entity_id';

    protected function _construct(): void
    {
        $this->_init(Model::class, ResourceModel::class);
    }
}
