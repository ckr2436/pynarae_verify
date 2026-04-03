<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Perform;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\CsrfAwareActionInterface;
use Magento\Framework\App\Request\InvalidRequestException;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use Pynarae\Verify\Model\SecondaryVerificationManager;
use Pynarae\Verify\Model\VerificationService;

class Index extends Action implements HttpPostActionInterface, CsrfAwareActionInterface
{
    public function __construct(
        Context $context,
        private JsonFactory $resultJsonFactory,
        private SecondaryVerificationManager $secondaryVerificationManager,
        private VerificationService $verificationService
    ) {
        parent::__construct($context);
    }

    public function execute(): Json
    {
        $request = $this->getRequest();
        $code = trim((string)$request->getParam('code', ''));
        $verificationToken = trim((string)$request->getParam(SecondaryVerificationManager::TOKEN_PARAM, ''));

        if ($code === '' || $verificationToken === '') {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'invalid_request',
                'message' => (string)__('The verification request is incomplete. Please try again.'),
            ], 400);
        }

        $tokenResult = $this->secondaryVerificationManager->consumeVerificationTokenDetailed(
            $verificationToken,
            $code
        );

        if (empty($tokenResult['success'])) {
            return $this->jsonResponse([
                'success' => false,
                'code' => $tokenResult['error_code'] ?? 'secondary_verification_failed',
                'message' => $tokenResult['message'] ?? (string)__('Secondary verification failed. Please try again.'),
            ], 422);
        }

        try {
            $verificationResult = $this->verificationService->verify($code);

            return $this->jsonResponse([
                'success' => true,
                'result' => $verificationResult,
            ]);
        } catch (LocalizedException $e) {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'verification_unavailable',
                'message' => (string)$e->getMessage(),
            ], 503);
        } catch (\Throwable $e) {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'verification_unavailable',
                'message' => (string)__('We could not complete verification. Please try again later.'),
            ], 503);
        }
    }

    public function createCsrfValidationException(RequestInterface $request): ?InvalidRequestException
    {
        return null;
    }

    public function validateForCsrf(RequestInterface $request): ?bool
    {
        return true;
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
