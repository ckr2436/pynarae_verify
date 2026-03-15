<?php

declare(strict_types=1);

namespace Pynarae\Verify\Model;

use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

class QrSvgGenerator
{
    public function generate(string $content, int $size = 300, int $margin = 2): string
    {
        $renderer = new ImageRenderer(
            new RendererStyle(max(80, $size), max(0, $margin)),
            new SvgImageBackEnd()
        );

        $writer = new Writer($renderer);
        return $writer->writeString($content);
    }
}
