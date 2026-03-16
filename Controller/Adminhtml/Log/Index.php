<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Log;

use Magento\Backend\App\Action;
use Magento\Backend\Model\View\Result\PageFactory;

use Magento\Framework\App\Action\HttpGetActionInterface;

class Index extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::logs';

    public function __construct(
        Action\Context $context,
        private PageFactory $pageFactory
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $resultPage = $this->pageFactory->create();
        $resultPage->getConfig()->getTitle()->prepend(__('Scan Logs'));
        return $resultPage;
    }
}
