<?php

declare(strict_types=1);

namespace Pynarae\Verify\Ui\DataProvider\ScanLog\Listing;

use Magento\Framework\View\Element\UiComponent\DataProvider\SearchResult;

class Collection extends SearchResult
{
    protected function _initSelect()
    {
        $this->addFilterToMap('entity_id', 'main_table.entity_id');
        $this->addFilterToMap('code', 'main_table.code');
        $this->addFilterToMap('matched', 'main_table.matched');
        $this->addFilterToMap('verify_status', 'main_table.verify_status');
        $this->addFilterToMap('ip', 'main_table.ip');
        $this->addFilterToMap('created_at', 'main_table.created_at');

        parent::_initSelect();
        return $this;
    }
}
