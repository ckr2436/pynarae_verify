<?php

declare(strict_types=1);

namespace Pynarae\Verify\Ui\DataProvider\Code\Listing;

use Magento\Framework\View\Element\UiComponent\DataProvider\SearchResult;

class Collection extends SearchResult
{
    protected function _initSelect()
    {
        $this->addFilterToMap('entity_id', 'main_table.entity_id');
        $this->addFilterToMap('code', 'main_table.code');
        $this->addFilterToMap('status', 'main_table.status');
        $this->addFilterToMap('product_sku', 'main_table.product_sku');
        $this->addFilterToMap('batch_no', 'main_table.batch_no');
        $this->addFilterToMap('scan_count', 'main_table.scan_count');
        $this->addFilterToMap('first_scanned_at', 'main_table.first_scanned_at');
        $this->addFilterToMap('last_scanned_at', 'main_table.last_scanned_at');
        $this->addFilterToMap('updated_at', 'main_table.updated_at');

        parent::_initSelect();
        return $this;
    }
}
