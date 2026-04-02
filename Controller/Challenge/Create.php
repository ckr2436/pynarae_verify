<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Challenge;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\JsonFactory;
use Pynarae\Verify\Model\SecondaryVerificationManager;

class Create extends Action implements HttpGetActionInterface
{
    public function __construct(
        Context $context,
        private JsonFactory $resultJsonFactory,
        private SecondaryVerificationManager $secondaryVerificationManager
    ) {
        parent::__construct($context);
    }

    public function execute()
    {
        $result = $this->resultJsonFactory->create();

        try {
            $challenge = $this->secondaryVerificationManager->issueChallenge();

            return $result->setData([
                'success' => true,
                'challenge_id' => $challenge['id'],
                'challenge_code' => $challenge['code'],
                'expires_at' => $challenge['expires_at'],
            ]);
        } catch (\Throwable $e) {
            return $result->setData([
                'success' => false,
            ]);
        }
    }
}
