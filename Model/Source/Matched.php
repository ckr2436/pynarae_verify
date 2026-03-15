<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;

class Matched implements OptionSourceInterface
{
    public function toOptionArray(): array
    {
        return [
            ['value' => 1, 'label' => __('Yes')],
            ['value' => 0, 'label' => __('No')],
        ];
    }
}
