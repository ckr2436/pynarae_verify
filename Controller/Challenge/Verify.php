<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Challenge;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\Controller\Result\JsonFactory;
use Pynarae\Verify\Model\SecondaryVerificationManager;

class Verify extends Action implements HttpGetActionInterface
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
        $request = $this->getRequest();

        $challengeId = trim((string)$request->getParam('challenge_id', ''));
        $challengeCode = trim((string)$request->getParam('challenge_code', ''));
        $verificationCode = trim((string)$request->getParam('verification_code', ''));

        if ($challengeId === '' || $challengeCode === '' || $verificationCode === '') {
            return $result->setData([
                'success' => false,
            ]);
        }

        $token = $this->secondaryVerificationManager->validateChallenge($challengeId, $challengeCode, $verificationCode);

        if ($token === null) {
            return $result->setData([
                'success' => false,
            ]);
        }

        return $result->setData([
            'success' => true,
            'token' => $token,
        ]);
    }
}
