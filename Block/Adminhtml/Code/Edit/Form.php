<?php

declare(strict_types=1);

namespace Pynarae\Verify\Block\Adminhtml\Code\Edit;

use Magento\Backend\Block\Widget\Form\Generic;
use Magento\Framework\Data\FormFactory;
use Magento\Framework\App\Request\DataPersistorInterface;
use Magento\Framework\Registry;
use Pynarae\Verify\Controller\Adminhtml\AbstractCode;
use Pynarae\Verify\Model\Source\Status;

class Form extends Generic
{
    public function __construct(
        \Magento\Backend\Block\Template\Context $context,
        Registry $registry,
        FormFactory $formFactory,
        private readonly Status $statusSource,
        private readonly DataPersistorInterface $dataPersistor,
        array $data = []
    ) {
        parent::__construct($context, $registry, $formFactory, $data);
    }

    protected function _prepareForm()
    {
        /** @var \Pynarae\Verify\Model\Code $model */
        $model = $this->_coreRegistry->registry(AbstractCode::REGISTRY_KEY);

        $form = $this->_formFactory->create([
            'data' => [
                'id' => 'edit_form',
                'action' => $this->getUrl('*/*/save'),
                'method' => 'post',
            ]
        ]);

        $form->setUseContainer(true);

        $fieldset = $form->addFieldset('base_fieldset', ['legend' => __('Code Information')]);

        if ($model && $model->getId()) {
            $fieldset->addField('entity_id', 'hidden', ['name' => 'entity_id']);
        }

        $fieldset->addField('code', 'text', [
            'name' => 'code',
            'label' => __('Verification Code'),
            'title' => __('Verification Code'),
            'required' => true,
            'note' => __('Allowed characters: uppercase letters, numbers, hyphens. Example: PYN-ABCD1234EFGH'),
        ]);

        $fieldset->addField('status', 'select', [
            'name' => 'status',
            'label' => __('Status'),
            'title' => __('Status'),
            'required' => true,
            'values' => $this->statusSource->toOptionArray(),
        ]);

        $fieldset->addField('product_sku', 'text', [
            'name' => 'product_sku',
            'label' => __('Product SKU'),
            'title' => __('Product SKU'),
            'required' => false,
        ]);

        $fieldset->addField('batch_no', 'text', [
            'name' => 'batch_no',
            'label' => __('Batch Number'),
            'title' => __('Batch Number'),
            'required' => false,
        ]);

        $fieldset->addField('notes', 'textarea', [
            'name' => 'notes',
            'label' => __('Notes'),
            'title' => __('Notes'),
            'required' => false,
            'style' => 'height:100px;',
        ]);

        $fieldset->addField('meta_json', 'textarea', [
            'name' => 'meta_json',
            'label' => __('Meta JSON'),
            'title' => __('Meta JSON'),
            'required' => false,
            'style' => 'height:120px;',
            'note' => __('Optional JSON object for internal metadata.'),
        ]);

        if ($model && $model->getId()) {
            $metrics = $form->addFieldset('metrics_fieldset', ['legend' => __('Verification Metrics')]);

            $metrics->addField('scan_count_note', 'note', [
                'label' => __('Scan Count'),
                'text' => (string)((int)$model->getData('scan_count')),
            ]);

            $metrics->addField('first_scanned_at_note', 'note', [
                'label' => __('First Scanned At'),
                'text' => (string)($model->getData('first_scanned_at') ?: '—'),
            ]);

            $metrics->addField('last_scanned_at_note', 'note', [
                'label' => __('Last Scanned At'),
                'text' => (string)($model->getData('last_scanned_at') ?: '—'),
            ]);

            $metrics->addField('created_at_note', 'note', [
                'label' => __('Created At'),
                'text' => (string)($model->getData('created_at') ?: '—'),
            ]);

            $metrics->addField('updated_at_note', 'note', [
                'label' => __('Updated At'),
                'text' => (string)($model->getData('updated_at') ?: '—'),
            ]);
        }

        $values = $model ? $model->getData() : [];
        $persistedData = $this->dataPersistor->get('pynarae_verify_code');
        if (is_array($persistedData) && !empty($persistedData)) {
            $values = array_merge($values, $persistedData);
            $this->dataPersistor->clear('pynarae_verify_code');
        }

        $form->setValues($values);
        $this->setForm($form);

        return parent::_prepareForm();
    }
}
