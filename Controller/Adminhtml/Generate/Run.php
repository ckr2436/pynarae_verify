<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Generate;

use Magento\Backend\App\Action;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Magento\Framework\Exception\LocalizedException;
use Pynarae\Verify\Model\BatchPackageService;

class Run extends Action
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::generate';

    public function __construct(
        Action\Context $context,
        private FormKeyValidator $formKeyValidator,
        private BatchPackageService $batchPackageService
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $redirect = $this->resultRedirectFactory->create()->setPath('pynarae_verify/generate/index');
        $request = $this->getRequest();

        if (!$request->isPost() || !$this->formKeyValidator->validate($request)) {
            $this->messageManager->addErrorMessage(__('Invalid form submission. Please refresh the page and try again.'));
            return $redirect;
        }

        $params = (array)$request->getPostValue();

        try {
            $result = $this->batchPackageService->generate($params);
            $csvDownloadUrl = $this->getUrl('pynarae_verify/generate/download', ['path' => base64_encode((string)$result['csv_relative_path'])]);
            $zipDownloadUrl = $this->getUrl('pynarae_verify/generate/download', ['path' => base64_encode((string)$result['zip_relative_path'])]);

            $this->messageManager->addSuccessMessage(
                __('Generated %1 codes (QR images: %2).', (int)$result['count'], (int)$result['qr_count'])
            );
            $this->messageManager->addNoticeMessage(__('CSV Download URL: %1', $csvDownloadUrl));
            $this->messageManager->addNoticeMessage(__('ZIP Package Download URL: %1', $zipDownloadUrl));
        } catch (LocalizedException $e) {
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            $this->messageManager->addExceptionMessage($e, __('Failed to generate package.'));
        }

        return $redirect;
    }
}
