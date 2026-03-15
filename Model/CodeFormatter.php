<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

class CodeFormatter
{
    public function normalize(string $code): string
    {
        $code = strtoupper(trim($code));
        $code = preg_replace('/\s+/', '', $code) ?? '';
        return $code;
    }

    public function isValidFormat(string $code): bool
    {
        return (bool)preg_match('/^[A-Z0-9\-]{6,64}$/', $code);
    }
}
