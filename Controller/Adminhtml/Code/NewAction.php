<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Pynarae\Verify\Controller\Adminhtml\AbstractCode;

use Magento\Framework\App\Action\HttpGetActionInterface;

class NewAction extends AbstractCode implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::save';

    public function execute()
    {
        return $this->_forward('edit');
    }
}
