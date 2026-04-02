<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Challenge;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Data\Form\FormKey\Validator as FormKeyValidator;
use Pynarae\Verify\Model\SecondaryVerificationManager;

class Verify extends Action implements HttpPostActionInterface
{
    public function __construct(
        Context $context,
        private JsonFactory $resultJsonFactory,
        private FormKeyValidator $formKeyValidator,
        private SecondaryVerificationManager $secondaryVerificationManager
    ) {
        parent::__construct($context);
    }

    public function execute(): Json
    {
        if (!$this->formKeyValidator->validate($this->getRequest())) {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'invalid_csrf',
                'message' => (string)__('Your session has expired. Please refresh the page and try again.'),
            ], 400);
        }

        $request = $this->getRequest();

        $challengeId = trim((string)$request->getParam('challenge_id', ''));
        $challengeCode = trim((string)$request->getParam('challenge_code', ''));
        $verificationCode = trim((string)$request->getParam('verification_code', ''));

        if ($challengeId === '' || $challengeCode === '' || $verificationCode === '') {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'invalid_request',
                'message' => (string)__('The verification request is incomplete. Please try again.'),
            ], 400);
        }

        $result = $this->secondaryVerificationManager->validateChallengeDetailed(
            $challengeId,
            $challengeCode,
            $verificationCode
        );

        if (empty($result['success'])) {
            $statusCode = (($result['error_code'] ?? '') === 'rate_limited') ? 429 : 422;

            return $this->jsonResponse([
                'success' => false,
                'code' => $result['error_code'] ?? 'challenge_failed',
                'message' => $result['message'] ?? (string)__('Secondary verification failed. Please try again.'),
            ], $statusCode);
        }

        return $this->jsonResponse([
            'success' => true,
            'token' => $result['token'],
        ]);
    }

    private function jsonResponse(array $data, int $statusCode = 200): Json
    {
        $result = $this->resultJsonFactory->create();
        $result->setHttpResponseCode($statusCode);
        $result->setData($data);

        $response = $this->getResponse();
        $response->setNoCacheHeaders();
        $response->setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0', true);
        $response->setHeader('Pragma', 'no-cache', true);
        $response->setHeader('Expires', '0', true);

        return $result;
    }
}
