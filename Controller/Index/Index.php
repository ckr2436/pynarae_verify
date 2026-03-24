<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Index;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\View\Result\PageFactory;

class Index extends Action implements HttpGetActionInterface
{
    public function __construct(
        Context $context,
        private PageFactory $pageFactory
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $resultPage = $this->pageFactory->create();

        $response = $this->getResponse();
        $response->setNoCacheHeaders();
        $response->setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0', true);
        $response->setHeader('Pragma', 'no-cache', true);
        $response->setHeader('Expires', '0', true);

        return $resultPage;
    }
}
