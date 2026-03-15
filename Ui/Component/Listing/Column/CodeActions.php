<?php

declare(strict_types=1);

namespace Pynarae\Verify\Ui\Component\Listing\Column;

use Magento\Framework\Escaper;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\UiComponent\ContextInterface;
use Magento\Framework\View\Element\UiComponentFactory;
use Magento\Ui\Component\Listing\Columns\Column;

class CodeActions extends Column
{
    private const URL_PATH_EDIT = 'pynarae_verify/code/edit';
    private const URL_PATH_DELETE = 'pynarae_verify/code/delete';

    public function __construct(
        ContextInterface $context,
        UiComponentFactory $uiComponentFactory,
        private readonly UrlInterface $urlBuilder,
        private readonly Escaper $escaper,
        array $components = [],
        array $data = []
    ) {
        parent::__construct($context, $uiComponentFactory, $components, $data);
    }

    public function prepareDataSource(array $dataSource): array
    {
        if (!isset($dataSource['data']['items'])) {
            return $dataSource;
        }

        foreach ($dataSource['data']['items'] as &$item) {
            if (!isset($item['entity_id'])) {
                continue;
            }

            $name = $this->getData('name');
            $code = (string)($item['code'] ?? '');

            $item[$name]['edit'] = [
                'href' => $this->urlBuilder->getUrl(self::URL_PATH_EDIT, ['entity_id' => $item['entity_id']]),
                'label' => __('Edit'),
            ];

            $item[$name]['delete'] = [
                'href' => $this->urlBuilder->getUrl(self::URL_PATH_DELETE, ['entity_id' => $item['entity_id']]),
                'label' => __('Delete'),
                'confirm' => [
                    'title' => __('Delete code'),
                    'message' => __('Are you sure you want to delete the code "%1"?', $this->escaper->escapeHtml($code)),
                ],
                'post' => true,
            ];
        }

        return $dataSource;
    }
}
