<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Code;

use Magento\Backend\App\Action;
use Magento\Ui\Component\MassAction\Filter;
use Pynarae\Verify\Model\ResourceModel\Code\CollectionFactory;

class MassDelete extends Action
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::delete';

    public function __construct(
        Action\Context $context,
        private readonly Filter $filter,
        private readonly CollectionFactory $collectionFactory
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        try {
            $collection = $this->filter->getCollection($this->collectionFactory->create());
            $deleted = 0;

            foreach ($collection as $item) {
                $item->delete();
                $deleted++;
            }

            $this->messageManager->addSuccessMessage(__('A total of %1 record(s) have been deleted.', $deleted));
        } catch (\Throwable $e) {
            $this->messageManager->addExceptionMessage($e, __('Could not delete the selected records.'));
        }

        return $this->resultRedirectFactory->create()->setPath('*/*/index');
    }
}
