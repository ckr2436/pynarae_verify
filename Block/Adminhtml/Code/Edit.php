<?php

declare(strict_types=1);

namespace Pynarae\Verify\Block\Adminhtml\Code;

use Magento\Backend\Block\Widget\Form\Container;
use Magento\Framework\Registry;
use Pynarae\Verify\Controller\Adminhtml\AbstractCode;

class Edit extends Container
{
    public function __construct(
        \Magento\Backend\Block\Widget\Context $context,
        private Registry $coreRegistry,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    protected function _construct(): void
    {
        $this->_objectId = 'entity_id';
        $this->_blockGroup = 'Pynarae_Verify';
        $this->_controller = 'adminhtml_code';

        parent::_construct();

        $this->buttonList->update('save', 'label', __('Save Code'));
        $this->buttonList->update('delete', 'label', __('Delete Code'));
        $this->buttonList->remove('reset');

        $this->addButton(
            'save_and_continue',
            [
                'label' => __('Save and Continue Edit'),
                'class' => 'save',
                'data_attribute' => [
                    'mage-init' => [
                        'button' => ['event' => 'saveAndContinueEdit']
                    ]
                ],
                'sort_order' => 80,
            ]
        );
    }

    public function getHeaderText(): string
    {
        $model = $this->coreRegistry->registry(AbstractCode::REGISTRY_KEY);

        if ($model && $model->getId()) {
            return (string)__('Edit Verification Code: %1', $model->getData('code'));
        }

        return (string)__('New Verification Code');
    }

    protected function _getSaveAndContinueUrl(): string
    {
        return $this->getUrl('*/*/save', ['_current' => true, 'back' => 1]);
    }
}
