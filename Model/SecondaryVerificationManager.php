<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\Session\SessionManagerInterface;

class SecondaryVerificationManager
{
    public const TOKEN_PARAM = '_svt';

    private const SESSION_CHALLENGES_KEY = 'pynarae_verify_secondary_challenges';
    private const SESSION_TOKENS_KEY = 'pynarae_verify_secondary_tokens';
    private const CHALLENGE_TTL_SECONDS = 300;
    private const TOKEN_TTL_SECONDS = 300;

    public function __construct(private SessionManagerInterface $sessionManager)
    {
    }

    /**
     * @return array{id:string,code:string,expires_at:int}
     */
    public function issueChallenge(): array
    {
        $this->cleanup();

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

    public function validateChallenge(string $challengeId, string $providedCode, string $verificationCode): ?string
    {
        $this->cleanup();

        $challengeId = trim($challengeId);
        if ($challengeId === '') {
            return null;
        }

        $challenges = $this->getChallenges();
        $challenge = $challenges[$challengeId] ?? null;
        if (!is_array($challenge)) {
            return null;
        }

        $expectedCode = trim((string)($challenge['code'] ?? ''));
        $expiresAt = (int)($challenge['expires_at'] ?? 0);
        if ($expectedCode === '' || $expiresAt < time() || !hash_equals($expectedCode, trim($providedCode))) {
            return null;
        }

        unset($challenges[$challengeId]);
        $this->sessionManager->setData(self::SESSION_CHALLENGES_KEY, $challenges);

        $token = $this->generateRandomString(24);
        $tokens = $this->getTokens();
        $tokens[$token] = [
            'verification_code' => trim($verificationCode),
            'expires_at' => time() + self::TOKEN_TTL_SECONDS,
        ];
        $this->sessionManager->setData(self::SESSION_TOKENS_KEY, $tokens);

        return $token;
    }

    public function consumeVerificationToken(string $token, string $verificationCode): bool
    {
        $this->cleanup();

        $token = trim($token);
        if ($token === '') {
            return false;
        }

        $tokens = $this->getTokens();
        $tokenData = $tokens[$token] ?? null;
        unset($tokens[$token]);
        $this->sessionManager->setData(self::SESSION_TOKENS_KEY, $tokens);

        if (!is_array($tokenData)) {
            return false;
        }

        $expectedCode = trim((string)($tokenData['verification_code'] ?? ''));
        $expiresAt = (int)($tokenData['expires_at'] ?? 0);

        return $expiresAt >= time()
            && $expectedCode !== ''
            && hash_equals($expectedCode, trim($verificationCode));
    }

    private function cleanup(): void
    {
        $now = time();

        $challenges = array_filter(
            $this->getChallenges(),
            static fn (array $challenge): bool => (int)($challenge['expires_at'] ?? 0) >= $now
        );
        $this->sessionManager->setData(self::SESSION_CHALLENGES_KEY, $challenges);

        $tokens = array_filter(
            $this->getTokens(),
            static fn (array $tokenData): bool => (int)($tokenData['expires_at'] ?? 0) >= $now
        );
        $this->sessionManager->setData(self::SESSION_TOKENS_KEY, $tokens);
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

    private function generateRandomString(int $byteLength): string
    {
        try {
            return bin2hex(random_bytes($byteLength));
        } catch (\Throwable $e) {
            return str_replace('.', '', uniqid('', true)) . mt_rand();
        }
    }
}
