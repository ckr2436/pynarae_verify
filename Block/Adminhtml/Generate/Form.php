<?php

declare(strict_types=1);

namespace Pynarae\Verify\Block\Adminhtml\Generate;

use Magento\Backend\Block\Template;
use Pynarae\Verify\Model\Config;

class Form extends Template
{
    protected $_template = 'Pynarae_Verify::generate/form.phtml';

    public function __construct(
        Template\Context $context,
        private readonly Config $config,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    public function getSubmitUrl(): string
    {
        return $this->getUrl('pynarae_verify/generate/run');
    }

    public function getDefaultPrefix(): string
    {
        return 'PYN-';
    }

    public function getDefaultCodeLength(): int
    {
        return 12;
    }

    public function getDefaultCount(): int
    {
        return 1000;
    }

    public function isSecureTokenEnabled(): bool
    {
        return $this->config->isSecureTokenEnabled();
    }
}
