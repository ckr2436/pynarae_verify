<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Backend\App\Action;
use Magento\Backend\Model\View\Result\PageFactory;

class Index extends Action
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::codes';

    public function __construct(
        Action\Context $context,
        private PageFactory $pageFactory
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $resultPage = $this->pageFactory->create();
        $resultPage->getConfig()->getTitle()->prepend(__('Verify Codes'));
        return $resultPage;
    }
}
