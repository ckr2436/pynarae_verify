<?php

declare(strict_types=1);

namespace Pynarae\Verify\Block;

use Magento\Framework\App\RequestInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;
use Pynarae\Verify\Model\Config;
use Pynarae\Verify\Model\SecondaryVerificationManager;
use Pynarae\Verify\Model\VerificationService;

class Verify extends Template
{
    private ?array $verificationResult = null;
    private bool $verificationLoaded = false;
    private ?string $requestNonce = null;

    public function __construct(
        Context $context,
        private Config $config,
        private RequestInterface $request,
        private SecondaryVerificationManager $secondaryVerificationManager,
        private VerificationService $verificationService,
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

    public function getCodeParam(): string
    {
        return $this->config->getQrCodeParam();
    }

    public function getVerificationResult(): ?array
    {
        if ($this->verificationLoaded) {
            return $this->verificationResult;
        }

        $this->verificationLoaded = true;
        $code = $this->getSubmittedCode();

        if ($code === '') {
            return null;
        }

        $verificationToken = trim((string)$this->request->getParam(SecondaryVerificationManager::TOKEN_PARAM, ''));
        if (
            $verificationToken === ''
            || !$this->secondaryVerificationManager->consumeVerificationToken($verificationToken, $code)
        ) {
            $this->verificationResult = [
                'status' => 'error',
                'title' => (string)__('Verification blocked'),
                'message' => (string)__('Secondary verification is required and may have expired. Please scan and verify again.'),
                'code' => $code,
                'matched' => false,
            ];

            return $this->verificationResult;
        }

        try {
            $this->verificationResult = $this->verificationService->verify($code);
        } catch (LocalizedException $e) {
            $this->verificationResult = [
                'status' => 'error',
                'title' => (string)__('Verification unavailable'),
                'message' => (string)$e->getMessage(),
                'code' => $code,
                'matched' => false,
            ];
        } catch (\Throwable $e) {
            $this->verificationResult = [
                'status' => 'error',
                'title' => (string)__('Verification unavailable'),
                'message' => (string)__('We could not complete verification. Please try again later.'),
                'code' => $code,
                'matched' => false,
            ];
        }

        return $this->verificationResult;
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

    public function getRequestNonce(): string
    {
        if ($this->requestNonce !== null) {
            return $this->requestNonce;
        }

        try {
            $random = bin2hex(random_bytes(8));
        } catch (\Throwable $e) {
            $random = str_replace('.', '', uniqid('', true));
        }

        $microtime = str_replace('.', '', sprintf('%.6f', microtime(true)));
        $this->requestNonce = $microtime . '-' . $random;

        return $this->requestNonce;
    }

    public function getStatusCssClass(): string
    {
        $status = (string)($this->getVerificationResult()['status'] ?? 'notice');

        return match ($status) {
            'success' => 'pynarae-verify__result pynarae-verify__result--success',
            'error' => 'pynarae-verify__result pynarae-verify__result--error',
            default => 'pynarae-verify__result pynarae-verify__result--notice',
        };
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
