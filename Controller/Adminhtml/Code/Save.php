<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Framework\App\Request\DataPersistorInterface;
use Magento\Framework\Exception\AlreadyExistsException;
use Magento\Framework\Exception\LocalizedException;
use Pynarae\Verify\Controller\Adminhtml\AbstractCode;
use Pynarae\Verify\Model\CodeFormatter;

class Save extends AbstractCode
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::save';

    public function __construct(
        \Magento\Backend\App\Action\Context $context,
        \Magento\Framework\Registry $coreRegistry,
        \Pynarae\Verify\Model\CodeFactory $codeFactory,
        \Pynarae\Verify\Model\ResourceModel\Code $codeResource,
        private DataPersistorInterface $dataPersistor,
        private CodeFormatter $codeFormatter
    ) {
        parent::__construct($context, $coreRegistry, $codeFactory, $codeResource);
    }

    public function execute()
    {
        $data = $this->getRequest()->getPostValue();

        if (!$data) {
            return $this->redirectToGrid();
        }

        $entityId = isset($data['entity_id']) ? (int)$data['entity_id'] : null;
        $model = $this->codeFactory->create();

        if ($entityId) {
            $this->codeResource->load($model, $entityId);

            if (!$model->getId()) {
                $this->messageManager->addErrorMessage(__('This verification code no longer exists.'));
                return $this->redirectToGrid();
            }
        }

        $code = $this->codeFormatter->normalize((string)($data['code'] ?? ''));

        try {
            if ($code === '' || !$this->codeFormatter->isValidFormat($code)) {
                throw new LocalizedException(
                    __('The verification code format is invalid. Use 6-64 uppercase letters, numbers, or hyphens.')
                );
            }

            $metaJson = trim((string)($data['meta_json'] ?? ''));
            if ($metaJson !== '') {
                json_decode($metaJson, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    throw new LocalizedException(__('The Meta JSON field contains invalid JSON.'));
                }
            }

            $model->setData('code', $code);
            $model->setData('status', ((int)($data['status'] ?? 1)) === 0 ? 0 : 1);
            $model->setData('product_sku', trim((string)($data['product_sku'] ?? '')) ?: null);
            $model->setData('batch_no', trim((string)($data['batch_no'] ?? '')) ?: null);
            $model->setData('notes', trim((string)($data['notes'] ?? '')) ?: null);
            $model->setData('meta_json', $metaJson !== '' ? $metaJson : null);

            $this->codeResource->save($model);

            $this->messageManager->addSuccessMessage(__('The verification code has been saved.'));
            $this->dataPersistor->clear('pynarae_verify_code');

            if ($this->getRequest()->getParam('back')) {
                return $this->resultRedirectFactory->create()->setPath(
                    '*/*/edit',
                    ['entity_id' => $model->getId(), '_current' => true]
                );
            }

            return $this->redirectToGrid();
        } catch (AlreadyExistsException $e) {
            $this->messageManager->addErrorMessage(__('The verification code already exists.'));
        } catch (LocalizedException $e) {
            $this->messageManager->addErrorMessage($e->getMessage());
        } catch (\Throwable $e) {
            $this->messageManager->addExceptionMessage($e, __('Could not save the verification code.'));
        }

        $this->dataPersistor->set('pynarae_verify_code', $data);

        return $this->resultRedirectFactory->create()->setPath(
            '*/*/edit',
            ['entity_id' => $entityId]
        );
    }
}
