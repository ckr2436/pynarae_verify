define([
    'pynaraeQrScanner'
], function (QrScannerModule) {
    'use strict';

    return QrScannerModule && (
        QrScannerModule.default ||
        QrScannerModule ||
        window.QrScanner ||
        null
    );
});
