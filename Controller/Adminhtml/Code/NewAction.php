<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Pynarae\Verify\Controller\Adminhtml\AbstractCode;

class NewAction extends AbstractCode
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::save';

    public function execute()
    {
        return $this->_forward('edit');
    }
}
