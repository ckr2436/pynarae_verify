<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;

class Status implements OptionSourceInterface
{
    public const DISABLED = 0;
    public const ENABLED = 1;

    public function toOptionArray(): array
    {
        return [
            ['value' => self::ENABLED, 'label' => __('Enabled')],
            ['value' => self::DISABLED, 'label' => __('Disabled')],
        ];
    }

    public function getOptionText(int|string|null $value): string
    {
        return match ((int)$value) {
            self::ENABLED => (string)__('Enabled'),
            default => (string)__('Disabled'),
        };
    }
}
