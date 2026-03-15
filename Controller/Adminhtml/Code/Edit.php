<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Backend\Model\View\Result\PageFactory;
use Pynarae\Verify\Controller\Adminhtml\AbstractCode;

class Edit extends AbstractCode
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::save';

    public function __construct(
        \Magento\Backend\App\Action\Context $context,
        \Magento\Framework\Registry $coreRegistry,
        \Pynarae\Verify\Model\CodeFactory $codeFactory,
        \Pynarae\Verify\Model\ResourceModel\Code $codeResource,
        private readonly PageFactory $pageFactory
    ) {
        parent::__construct($context, $coreRegistry, $codeFactory, $codeResource);
    }

    public function execute()
    {
        $entityId = (int)$this->getRequest()->getParam('entity_id');
        $model = $this->initModel($entityId);

        if ($entityId && !$model->getId()) {
            $this->messageManager->addErrorMessage(__('This verification code no longer exists.'));
            return $this->redirectToGrid();
        }

        $resultPage = $this->pageFactory->create();
        $this->initPage($resultPage);

        $title = $model->getId() ? __('Edit Verification Code') : __('New Verification Code');
        $resultPage->getConfig()->getTitle()->prepend($title);

        return $resultPage;
    }
}
