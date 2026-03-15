<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Backend\App\Action;
use Magento\Ui\Component\MassAction\Filter;
use Pynarae\Verify\Model\ResourceModel\Code\CollectionFactory;

class MassStatus extends Action
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::save';

    public function __construct(
        Action\Context $context,
        private readonly Filter $filter,
        private readonly CollectionFactory $collectionFactory
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $status = ((int)$this->getRequest()->getParam('status')) === 0 ? 0 : 1;

        try {
            $collection = $this->filter->getCollection($this->collectionFactory->create());
            $updated = 0;

            foreach ($collection as $item) {
                $item->setData('status', $status);
                $item->save();
                $updated++;
            }

            $this->messageManager->addSuccessMessage(__('A total of %1 record(s) have been updated.', $updated));
        } catch (\Throwable $e) {
            $this->messageManager->addExceptionMessage($e, __('Could not update the selected records.'));
        }

        return $this->resultRedirectFactory->create()->setPath('*/*/index');
    }
}
