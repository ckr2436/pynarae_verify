<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use Magento\Framework\Exception\LocalizedException;

class SecureTokenService
{
    private const TOKEN_PREFIX = 'PV1';

    public function __construct(
        private readonly Config $config
    ) {
    }

    public function isEnabled(?int $storeId = null): bool
    {
        return $this->config->isSecureTokenEnabled($storeId) && $this->config->getSecureTokenKey($storeId) !== '';
    }

    public function generateToken(array $payload, ?int $storeId = null): string
    {
        $secret = $this->config->getSecureTokenKey($storeId);
        if ($secret === '') {
            throw new LocalizedException(__('Secure token key is empty. Please configure it first.'));
        }

        $ttlDays = $this->config->getSecureTokenTtlDays($storeId);
        $issuedAt = time();
        if ($ttlDays > 0) {
            $payload['exp'] = $issuedAt + ($ttlDays * 86400);
        }

        $payload['iat'] = $issuedAt;
        $payload['v'] = 1;

        $plaintext = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($plaintext)) {
            throw new LocalizedException(__('Could not serialize secure token payload.'));
        }

        $iv = random_bytes(16);
        $encKey = hash('sha256', $secret . '|enc', true);
        $macKey = hash('sha256', $secret . '|mac', true);

        $ciphertext = openssl_encrypt($plaintext, 'AES-256-CBC', $encKey, OPENSSL_RAW_DATA, $iv);
        if (!is_string($ciphertext)) {
            throw new LocalizedException(__('Could not encrypt secure token payload.'));
        }

        $mac = hash_hmac('sha256', $iv . $ciphertext, $macKey, true);

        return self::TOKEN_PREFIX . '.'
            . $this->base64UrlEncode($iv) . '.'
            . $this->base64UrlEncode($ciphertext) . '.'
            . $this->base64UrlEncode($mac);
    }

    public function parseToken(string $token, ?int $storeId = null): ?array
    {
        $parts = explode('.', trim($token));
        if (count($parts) !== 4 || $parts[0] !== self::TOKEN_PREFIX) {
            return null;
        }

        $secret = $this->config->getSecureTokenKey($storeId);
        if ($secret === '') {
            throw new LocalizedException(__('Secure token key is empty.'));
        }

        $iv = $this->base64UrlDecode($parts[1]);
        $ciphertext = $this->base64UrlDecode($parts[2]);
        $mac = $this->base64UrlDecode($parts[3]);

        if (strlen($iv) !== 16 || $ciphertext === '' || strlen($mac) !== 32) {
            throw new LocalizedException(__('Invalid secure token format.'));
        }

        $encKey = hash('sha256', $secret . '|enc', true);
        $macKey = hash('sha256', $secret . '|mac', true);
        $expectedMac = hash_hmac('sha256', $iv . $ciphertext, $macKey, true);

        if (!hash_equals($expectedMac, $mac)) {
            throw new LocalizedException(__('Secure token signature verification failed.'));
        }

        $plaintext = openssl_decrypt($ciphertext, 'AES-256-CBC', $encKey, OPENSSL_RAW_DATA, $iv);
        if (!is_string($plaintext) || $plaintext === '') {
            throw new LocalizedException(__('Could not decrypt secure token payload.'));
        }

        $payload = json_decode($plaintext, true);
        if (!is_array($payload)) {
            throw new LocalizedException(__('Secure token payload is invalid JSON.'));
        }

        if (isset($payload['exp']) && time() > (int)$payload['exp']) {
            throw new LocalizedException(__('Secure token has expired.'));
        }

        return $payload;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $value = strtr($value, '-_', '+/');
        $padding = strlen($value) % 4;
        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        $decoded = base64_decode($value, true);
        return is_string($decoded) ? $decoded : '';
    }
}
