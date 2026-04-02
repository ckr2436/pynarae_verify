<?php

declare(strict_types=1);

namespace Pynarae\Verify\Block;

use Magento\Framework\App\RequestInterface;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Pynarae\Verify\Model\Config;

class Verify extends Template
{
    public function __construct(
        Context $context,
        private Config $config,
        private RequestInterface $request,
        private FormKey $formKey,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    protected function _prepareLayout()
    {
        $this->pageConfig->getTitle()->set($this->getPageTitle());
        return parent::_prepareLayout();
    }

    public function isEnabled(): bool
    {
        return $this->config->isEnabled();
    }

    public function getPageTitle(): string
    {
        return $this->config->getPageTitle();
    }

    public function getIntroText(): string
    {
        return $this->config->getIntroText();
    }

    public function getSubmittedCode(): string
    {
        $paramName = $this->getCodeParam();
        $value = trim((string)$this->request->getParam($paramName, ''));

        if ($value === '' && $paramName !== 'code') {
            $value = trim((string)$this->request->getParam('code', ''));
        }

        return $value;
    }

    public function hasSubmittedCode(): bool
    {
        return $this->getSubmittedCode() !== '';
    }

    public function shouldRenderPendingState(): bool
    {
        return $this->hasSubmittedCode();
    }

    public function shouldShowContinueVerificationButton(): bool
    {
        return $this->hasSubmittedCode();
    }

    public function getCodeParam(): string
    {
        return $this->config->getQrCodeParam();
    }

    public function getVerifyUrl(): string
    {
        return $this->getUrl('verify');
    }

    public function getChallengeCreateUrl(): string
    {
        return $this->getUrl('verify/challenge/create');
    }

    public function getChallengeVerifyUrl(): string
    {
        return $this->getUrl('verify/challenge/verify');
    }

    public function getPerformUrl(): string
    {
        return $this->getUrl('verify/perform');
    }

    public function getFormKey(): string
    {
        return $this->formKey->getFormKey();
    }

    public function shouldShowProductSku(): bool
    {
        return $this->config->shouldShowProductSku();
    }

    public function shouldShowBatchNo(): bool
    {
        return $this->config->shouldShowBatchNo();
    }

    public function shouldShowScanCount(): bool
    {
        return $this->config->shouldShowScanCount();
    }
}
