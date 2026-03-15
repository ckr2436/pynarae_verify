<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Pynarae\Verify\Controller\Adminhtml\AbstractCode;

class Delete extends AbstractCode
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::delete';

    public function execute()
    {
        $entityId = (int)$this->getRequest()->getParam('entity_id');

        if (!$entityId) {
            $this->messageManager->addErrorMessage(__('We cannot find a verification code to delete.'));
            return $this->redirectToGrid();
        }

        $model = $this->codeFactory->create();
        $this->codeResource->load($model, $entityId);

        if (!$model->getId()) {
            $this->messageManager->addErrorMessage(__('This verification code no longer exists.'));
            return $this->redirectToGrid();
        }

        try {
            $this->codeResource->delete($model);
            $this->messageManager->addSuccessMessage(__('The verification code has been deleted.'));
        } catch (\Throwable $e) {
            $this->messageManager->addExceptionMessage($e, __('Could not delete the verification code.'));
            return $this->resultRedirectFactory->create()->setPath('*/*/edit', ['entity_id' => $entityId]);
        }

        return $this->redirectToGrid();
    }
}
