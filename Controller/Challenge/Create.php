<?php

declare(strict_types=1);

namespace Pynarae\Verify\Controller\Challenge;

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

class Create extends Action implements HttpPostActionInterface, CsrfAwareActionInterface
{
    public function __construct(
        Context $context,
        private JsonFactory $resultJsonFactory,
        private SecondaryVerificationManager $secondaryVerificationManager
    ) {
        parent::__construct($context);
    }

    public function execute(): Json
    {
        try {
            $challenge = $this->secondaryVerificationManager->issueChallenge();

            return $this->jsonResponse([
                'success' => true,
                'challenge_id' => $challenge['id'],
                'challenge_code' => $challenge['code'],
                'expires_at' => $challenge['expires_at'],
            ]);
        } catch (LocalizedException $e) {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'rate_limited',
                'message' => (string)$e->getMessage(),
            ], 429);
        } catch (\Throwable $e) {
            return $this->jsonResponse([
                'success' => false,
                'code' => 'challenge_unavailable',
                'message' => (string)__('Secondary verification is currently unavailable. Please try again later.'),
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
