<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Generate;

use Magento\Backend\App\Action;
use Magento\Backend\Model\View\Result\PageFactory;

class Index extends Action
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::generate';

    public function __construct(
        Action\Context $context,
        private readonly PageFactory $pageFactory
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $resultPage = $this->pageFactory->create();
        $resultPage->setActiveMenu('Pynarae_Verify::generate_menu');
        $resultPage->getConfig()->getTitle()->prepend(__('Batch Generate Verify QR Package'));

        return $resultPage;
    }
}
