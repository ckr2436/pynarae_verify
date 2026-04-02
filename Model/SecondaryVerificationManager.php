<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Session\SessionManagerInterface;

class SecondaryVerificationManager
{
    public const TOKEN_PARAM = '_svt';

    private const SESSION_CHALLENGES_KEY = 'pynarae_verify_secondary_challenges';
    private const SESSION_TOKENS_KEY = 'pynarae_verify_secondary_tokens';
    private const SESSION_CHALLENGE_ISSUE_LOG_KEY = 'pynarae_verify_secondary_issue_log';
    private const SESSION_CHALLENGE_VERIFY_LOG_KEY = 'pynarae_verify_secondary_verify_log';

    private const CHALLENGE_TTL_SECONDS = 300;
    private const TOKEN_TTL_SECONDS = 300;

    private const CHALLENGE_ISSUE_WINDOW_SECONDS = 300;
    private const CHALLENGE_ISSUE_LIMIT = 15;

    private const CHALLENGE_VERIFY_WINDOW_SECONDS = 300;
    private const CHALLENGE_VERIFY_LIMIT = 25;

    public function __construct(
        private SessionManagerInterface $sessionManager
    ) {
    }

    /**
     * @return array{id:string,code:string,expires_at:int}
     * @throws LocalizedException
     */
    public function issueChallenge(): array
    {
        $this->cleanup();

        if (!$this->registerRateEvent(
            self::SESSION_CHALLENGE_ISSUE_LOG_KEY,
            self::CHALLENGE_ISSUE_WINDOW_SECONDS,
            self::CHALLENGE_ISSUE_LIMIT
        )) {
            throw new LocalizedException(
                __('Too many verification requests were submitted. Please wait a moment and try again.')
            );
        }

        $id = $this->generateRandomString(12);
        $code = (string)random_int(100000, 999999);
        $expiresAt = time() + self::CHALLENGE_TTL_SECONDS;

        $challenges = $this->getChallenges();
        $challenges[$id] = [
            'code' => $code,
            'expires_at' => $expiresAt,
        ];
        $this->sessionManager->setData(self::SESSION_CHALLENGES_KEY, $challenges);

        return [
            'id' => $id,
            'code' => $code,
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * @return array{success:bool,token?:string,error_code?:string,message?:string}
     */
    public function validateChallengeDetailed(
        string $challengeId,
        string $providedCode,
        string $verificationCode
    ): array {
        $this->cleanup();

        if (!$this->registerRateEvent(
            self::SESSION_CHALLENGE_VERIFY_LOG_KEY,
            self::CHALLENGE_VERIFY_WINDOW_SECONDS,
            self::CHALLENGE_VERIFY_LIMIT
        )) {
            return [
                'success' => false,
                'error_code' => 'rate_limited',
                'message' => (string)__('Too many verification attempts were submitted. Please wait a moment and try again.'),
            ];
        }

        $challengeId = trim($challengeId);
        $providedCode = trim($providedCode);
        $verificationCode = trim($verificationCode);

        if ($challengeId === '' || $providedCode === '' || $verificationCode === '') {
            return [
                'success' => false,
                'error_code' => 'invalid_request',
                'message' => (string)__('The verification request is incomplete. Please try again.'),
            ];
        }

        $challenges = $this->getChallenges();
        $challenge = $challenges[$challengeId] ?? null;

        if (!is_array($challenge)) {
            return [
                'success' => false,
                'error_code' => 'challenge_expired',
                'message' => (string)__('The secondary verification session has expired. Please try again.'),
            ];
        }

        $expectedCode = trim((string)($challenge['code'] ?? ''));
        $expiresAt = (int)($challenge['expires_at'] ?? 0);

        if ($expectedCode === '' || $expiresAt < time()) {
            unset($challenges[$challengeId]);
            $this->sessionManager->setData(self::SESSION_CHALLENGES_KEY, $challenges);

            return [
                'success' => false,
                'error_code' => 'challenge_expired',
                'message' => (string)__('The secondary verification session has expired. Please try again.'),
            ];
        }

        if (!hash_equals($expectedCode, $providedCode)) {
            return [
                'success' => false,
                'error_code' => 'challenge_code_mismatch',
                'message' => (string)__('The verification code you entered is incorrect. Please try again.'),
            ];
        }

        unset($challenges[$challengeId]);
        $this->sessionManager->setData(self::SESSION_CHALLENGES_KEY, $challenges);

        $token = $this->generateRandomString(24);
        $tokens = $this->getTokens();
        $tokens[$token] = [
            'verification_code' => $verificationCode,
            'expires_at' => time() + self::TOKEN_TTL_SECONDS,
        ];
        $this->sessionManager->setData(self::SESSION_TOKENS_KEY, $tokens);

        return [
            'success' => true,
            'token' => $token,
        ];
    }

    public function validateChallenge(
        string $challengeId,
        string $providedCode,
        string $verificationCode
    ): ?string {
        $result = $this->validateChallengeDetailed($challengeId, $providedCode, $verificationCode);
        return !empty($result['success']) ? (string)$result['token'] : null;
    }

    /**
     * @return array{success:bool,error_code?:string,message?:string}
     */
    public function consumeVerificationTokenDetailed(string $token, string $verificationCode): array
    {
        $this->cleanup();

        $token = trim($token);
        $verificationCode = trim($verificationCode);

        if ($token === '' || $verificationCode === '') {
            return [
                'success' => false,
                'error_code' => 'invalid_request',
                'message' => (string)__('The verification request is incomplete. Please try again.'),
            ];
        }

        $tokens = $this->getTokens();
        $tokenData = $tokens[$token] ?? null;

        unset($tokens[$token]);
        $this->sessionManager->setData(self::SESSION_TOKENS_KEY, $tokens);

        if (!is_array($tokenData)) {
            return [
                'success' => false,
                'error_code' => 'secondary_verification_expired',
                'message' => (string)__('Secondary verification expired. Please complete verification again.'),
            ];
        }

        $expectedCode = trim((string)($tokenData['verification_code'] ?? ''));
        $expiresAt = (int)($tokenData['expires_at'] ?? 0);

        if ($expectedCode === '' || $expiresAt < time()) {
            return [
                'success' => false,
                'error_code' => 'secondary_verification_expired',
                'message' => (string)__('Secondary verification expired. Please complete verification again.'),
            ];
        }

        if (!hash_equals($expectedCode, $verificationCode)) {
            return [
                'success' => false,
                'error_code' => 'secondary_verification_invalid',
                'message' => (string)__('Secondary verification is invalid. Please complete verification again.'),
            ];
        }

        return [
            'success' => true,
        ];
    }

    public function consumeVerificationToken(string $token, string $verificationCode): bool
    {
        $result = $this->consumeVerificationTokenDetailed($token, $verificationCode);
        return !empty($result['success']);
    }

    private function cleanup(): void
    {
        $now = time();

        $challenges = array_filter(
            $this->getChallenges(),
            static fn(array $challenge): bool => (int)($challenge['expires_at'] ?? 0) >= $now
        );
        $this->sessionManager->setData(self::SESSION_CHALLENGES_KEY, $challenges);

        $tokens = array_filter(
            $this->getTokens(),
            static fn(array $tokenData): bool => (int)($tokenData['expires_at'] ?? 0) >= $now
        );
        $this->sessionManager->setData(self::SESSION_TOKENS_KEY, $tokens);

        $this->cleanupRateLog(self::SESSION_CHALLENGE_ISSUE_LOG_KEY, self::CHALLENGE_ISSUE_WINDOW_SECONDS);
        $this->cleanupRateLog(self::SESSION_CHALLENGE_VERIFY_LOG_KEY, self::CHALLENGE_VERIFY_WINDOW_SECONDS);
    }

    private function cleanupRateLog(string $sessionKey, int $windowSeconds): void
    {
        $now = time();
        $timestamps = array_filter(
            $this->getRateLog($sessionKey),
            static fn(int $timestamp): bool => $timestamp >= ($now - $windowSeconds)
        );

        $this->sessionManager->setData($sessionKey, array_values($timestamps));
    }

    private function registerRateEvent(string $sessionKey, int $windowSeconds, int $limit): bool
    {
        $now = time();
        $timestamps = array_filter(
            $this->getRateLog($sessionKey),
            static fn(int $timestamp): bool => $timestamp >= ($now - $windowSeconds)
        );

        if (count($timestamps) >= $limit) {
            $this->sessionManager->setData($sessionKey, array_values($timestamps));
            return false;
        }

        $timestamps[] = $now;
        $this->sessionManager->setData($sessionKey, array_values($timestamps));
        return true;
    }

    /**
     * @return array<string,array{code:string,expires_at:int}>
     */
    private function getChallenges(): array
    {
        $value = $this->sessionManager->getData(self::SESSION_CHALLENGES_KEY);
        return is_array($value) ? $value : [];
    }

    /**
     * @return array<string,array{verification_code:string,expires_at:int}>
     */
    private function getTokens(): array
    {
        $value = $this->sessionManager->getData(self::SESSION_TOKENS_KEY);
        return is_array($value) ? $value : [];
    }

    /**
     * @return int[]
     */
    private function getRateLog(string $sessionKey): array
    {
        $value = $this->sessionManager->getData($sessionKey);
        if (!is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, static fn($item): bool => is_int($item) || ctype_digit((string)$item)));
    }

    private function generateRandomString(int $byteLength): string
    {
        try {
            return bin2hex(random_bytes($byteLength));
        } catch (\Throwable $e) {
            return str_replace('.', '', uniqid('', true)) . mt_rand();
        }
    }
}
