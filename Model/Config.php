<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\ScopeInterface;

class Config
{
    private const XML_PATH_ENABLED = 'pynarae_verify/general/enabled';
    private const XML_PATH_PAGE_TITLE = 'pynarae_verify/general/page_title';
    private const XML_PATH_INTRO_TEXT = 'pynarae_verify/general/intro_text';
    private const XML_PATH_FIRST_SCAN_MESSAGE = 'pynarae_verify/general/first_scan_message';
    private const XML_PATH_REPEAT_SCAN_MESSAGE = 'pynarae_verify/general/repeat_scan_message';
    private const XML_PATH_INVALID_MESSAGE = 'pynarae_verify/general/invalid_message';
    private const XML_PATH_SUSPICIOUS_THRESHOLD = 'pynarae_verify/general/suspicious_threshold';
    private const XML_PATH_SHOW_PRODUCT_SKU = 'pynarae_verify/general/show_product_sku';
    private const XML_PATH_SHOW_BATCH_NO = 'pynarae_verify/general/show_batch_no';
    private const XML_PATH_SHOW_SCAN_COUNT = 'pynarae_verify/general/show_scan_count';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig
    ) {
    }

    public function isEnabled(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_ENABLED, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function getPageTitle(?int $storeId = null): string
    {
        return (string)($this->scopeConfig->getValue(self::XML_PATH_PAGE_TITLE, ScopeInterface::SCOPE_STORE, $storeId)
            ?: 'Product Authenticity Check');
    }

    public function getIntroText(?int $storeId = null): string
    {
        return (string)$this->scopeConfig->getValue(self::XML_PATH_INTRO_TEXT, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function getFirstScanMessage(?int $storeId = null): string
    {
        return (string)$this->scopeConfig->getValue(self::XML_PATH_FIRST_SCAN_MESSAGE, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function getRepeatScanMessage(?int $storeId = null): string
    {
        return (string)$this->scopeConfig->getValue(self::XML_PATH_REPEAT_SCAN_MESSAGE, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function getInvalidMessage(?int $storeId = null): string
    {
        return (string)$this->scopeConfig->getValue(self::XML_PATH_INVALID_MESSAGE, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function getSuspiciousThreshold(?int $storeId = null): int
    {
        $value = (int)$this->scopeConfig->getValue(self::XML_PATH_SUSPICIOUS_THRESHOLD, ScopeInterface::SCOPE_STORE, $storeId);
        return $value > 1 ? $value : 3;
    }

    public function shouldShowProductSku(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_SHOW_PRODUCT_SKU, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function shouldShowBatchNo(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_SHOW_BATCH_NO, ScopeInterface::SCOPE_STORE, $storeId);
    }

    public function shouldShowScanCount(?int $storeId = null): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_SHOW_SCAN_COUNT, ScopeInterface::SCOPE_STORE, $storeId);
    }
}
