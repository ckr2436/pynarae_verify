<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Framework\View\Result\PageFactory;
use Pynarae\Verify\Controller\Adminhtml\AbstractCode;

use Magento\Framework\App\Action\HttpGetActionInterface;

class Edit extends AbstractCode implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::save';

    public function __construct(
        \Magento\Backend\App\Action\Context $context,
        \Magento\Framework\Registry $coreRegistry,
        \Pynarae\Verify\Model\CodeFactory $codeFactory,
        \Pynarae\Verify\Model\ResourceModel\Code $codeResource,
        private PageFactory $pageFactory
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
