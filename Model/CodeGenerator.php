<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

class CodeGenerator
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(
        private readonly CodeFormatter $codeFormatter
    ) {
    }

    public function generateBatch(int $count, int $length, string $prefix, callable $existsCallback): array
    {
        $count = max(1, $count);
        $length = max(6, $length);
        $prefix = strtoupper($prefix);

        $codes = [];

        while (count($codes) < $count) {
            $code = $this->generateOne($length, $prefix);

            if (isset($codes[$code])) {
                continue;
            }

            if ($existsCallback($code) === true) {
                continue;
            }

            $codes[$code] = $code;
        }

        return array_values($codes);
    }

    public function generateOne(int $length, string $prefix = ''): string
    {
        $alphabetLength = strlen(self::ALPHABET);
        $random = '';

        for ($i = 0; $i < $length; $i++) {
            $index = random_int(0, $alphabetLength - 1);
            $random .= self::ALPHABET[$index];
        }

        return $this->codeFormatter->normalize($prefix . $random);
    }
}
