<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml;

use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\ResultFactory;
use Magento\Framework\Registry;
use Pynarae\Verify\Model\Code;
use Pynarae\Verify\Model\CodeFactory;
use Pynarae\Verify\Model\ResourceModel\Code as CodeResource;

abstract class AbstractCode extends Action
{
    public const REGISTRY_KEY = 'pynarae_verify_code';

    public function __construct(
        Context $context,
        protected Registry $coreRegistry,
        protected CodeFactory $codeFactory,
        protected CodeResource $codeResource
    ) {
        parent::__construct($context);
    }

    protected function initPage($resultPage)
    {
        $resultPage->addBreadcrumb(__('Pynarae'), __('Pynarae'));
        $resultPage->addBreadcrumb(__('Verify Codes'), __('Verify Codes'));
        return $resultPage;
    }

    protected function initModel(?int $entityId = null): Code
    {
        $model = $this->codeFactory->create();

        if ($entityId) {
            $this->codeResource->load($model, $entityId);
        }

        $this->coreRegistry->register(self::REGISTRY_KEY, $model);
        return $model;
    }

    protected function redirectToGrid()
    {
        return $this->resultFactory->create(ResultFactory::TYPE_REDIRECT)->setPath('*/*/index');
    }
}
