<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Backend\App\Action;
use Magento\Backend\Model\Menu\Config as MenuConfig;
use Magento\Backend\Model\View\Result\PageFactory;
use Magento\Framework\App\Action\HttpGetActionInterface;

class Index extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::codes';

    public function __construct(
        Action\Context $context,
        private PageFactory $pageFactory,
        private MenuConfig $menuConfig
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $resultPage = $this->pageFactory->create();

        if ($this->menuConfig->getMenu()->get('Pynarae_Verify::codes_menu')) {
            $resultPage->setActiveMenu('Pynarae_Verify::codes_menu');
        }

        $resultPage->getConfig()->getTitle()->prepend(__('Verify Codes'));
        return $resultPage;
    }
}
