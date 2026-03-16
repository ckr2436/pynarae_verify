<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Adminhtml\Generate;

use Magento\Backend\App\Action;
use Magento\Framework\App\Filesystem\DirectoryList;
use Magento\Framework\App\Response\Http\FileFactory;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Filesystem;

use Magento\Framework\App\Action\HttpGetActionInterface;

class Download extends Action implements HttpGetActionInterface
{
    public const ADMIN_RESOURCE = 'Pynarae_Verify::generate';

    public function __construct(
        Action\Context $context,
        private FileFactory $fileFactory,
        private Filesystem $filesystem
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $encodedPath = (string)$this->getRequest()->getParam('path', '');
        $relativePath = (string)base64_decode($encodedPath, true);

        if ($relativePath === '' || str_contains($relativePath, '..') || !str_starts_with($relativePath, 'export/pynarae_verify_packages/')) {
            throw new LocalizedException(__('Invalid download path.'));
        }

        $varDirectory = $this->filesystem->getDirectoryRead(DirectoryList::VAR_DIR);
        if (!$varDirectory->isExist($relativePath)) {
            throw new LocalizedException(__('Requested file does not exist.'));
        }

        $filename = basename($relativePath);

        return $this->fileFactory->create(
            $filename,
            ['type' => 'filename', 'value' => $relativePath, 'rm' => false],
            DirectoryList::VAR_DIR
        );
    }
}
