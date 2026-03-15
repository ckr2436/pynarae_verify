define([], function () {
    'use strict';

    return function (config) {
        var scannerRoot = document.querySelector(config.rootSelector || '[data-role="qr-scanner"]');
        if (!scannerRoot) {
            return;
        }

        var scanTrigger = scannerRoot.querySelector('[data-role="scan-trigger"]');
        var codeParamName = (scannerRoot.getAttribute('data-code-param') || 'code').trim() || 'code';
        var scanMessage = scannerRoot.querySelector('[data-role="scan-message"]');
        var scanModal = scannerRoot.querySelector('[data-role="scan-modal"]');
        var scanVideo = scannerRoot.querySelector('[data-role="scan-video"]');
        var scanStop = scannerRoot.querySelector('[data-role="scan-stop"]');
        var codeInput = document.querySelector('#verify-code');
        var form = document.querySelector('.pynarae-verify__form');

        if (!scanTrigger || !scanMessage || !scanModal || !scanVideo || !scanStop || !codeInput || !form) {
            return;
        }

        var stream;
        var scanTimer;
        var successDelayTimer;
        var isFinishingScan = false;
        var messages = config.messages || {};

        var setMessage = function (message, isError) {
            scanMessage.textContent = message || '';
            scanMessage.classList.toggle('pynarae-verify__scanner-message--error', Boolean(isError));
        };

        var closeScanner = function () {
            if (scanTimer) {
                window.clearInterval(scanTimer);
                scanTimer = null;
            }

            if (successDelayTimer) {
                window.clearTimeout(successDelayTimer);
                successDelayTimer = null;
            }

            isFinishingScan = false;

            if (stream) {
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                stream = null;
            }

            scanVideo.srcObject = null;
            scanModal.hidden = true;
            document.body.classList.remove('pynarae-verify--scanner-open');
        };

        var parseScannedCode = function (rawValue) {
            var scannedText = rawValue.trim();

            try {
                scannedText = decodeURIComponent(scannedText);
            } catch (e) {
                // Keep original value when decoding fails.
            }

            if (!/^https?:\/\//i.test(scannedText)) {
                return scannedText;
            }

            try {
                var url = new URL(scannedText);
                var codeFromQuery = url.searchParams.get(codeParamName) || url.searchParams.get('code');
                if (codeFromQuery) {
                    return codeFromQuery;
                }

                var pathParts = url.pathname.split('/').filter(Boolean);
                if (pathParts.length > 1 && pathParts[0].toLowerCase() === 'verify') {
                    return pathParts[pathParts.length - 1];
                }
            } catch (e) {
                return scannedText;
            }

            return scannedText;
        };

        var submitScannedCode = function (qrValue) {
            var codeValue = parseScannedCode(qrValue);
            if (!codeValue) {
                return;
            }

            codeInput.value = codeValue;
            setMessage(messages.successSubmitting, false);
            form.submit();
        };

        var isMobile = window.matchMedia('(pointer: coarse)').matches ||
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        if (!isMobile) {
            scanTrigger.hidden = true;
            setMessage(messages.desktopGuide, false);
            return;
        }

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            scanTrigger.hidden = true;
            setMessage(messages.noCameraApi, true);
            return;
        }

        if (typeof window.BarcodeDetector !== 'function') {
            scanTrigger.hidden = true;
            setMessage(messages.noBarcodeDetector, true);
            return;
        }

        var detector = new window.BarcodeDetector({formats: ['qr_code']});

        scanTrigger.addEventListener('click', async function () {
            closeScanner();

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: {ideal: 'environment'}
                    },
                    audio: false
                });
            } catch (e) {
                setMessage(messages.cameraDenied, true);
                return;
            }

            isFinishingScan = false;
            scanVideo.srcObject = stream;
            scanModal.hidden = false;
            document.body.classList.add('pynarae-verify--scanner-open');
            setMessage(messages.scanning, false);

            try {
                await scanVideo.play();
            } catch (e) {
                closeScanner();
                setMessage(messages.previewFailed, true);
                return;
            }

            scanTimer = window.setInterval(async function () {
                if (!stream || isFinishingScan) {
                    return;
                }

                try {
                    var codes = await detector.detect(scanVideo);
                    if (!codes.length) {
                        return;
                    }

                    var qrValue = (codes[0].rawValue || '').trim();
                    if (!qrValue) {
                        return;
                    }

                    isFinishingScan = true;
                    if (scanTimer) {
                        window.clearInterval(scanTimer);
                        scanTimer = null;
                    }

                    setMessage(messages.successDetected, false);
                    successDelayTimer = window.setTimeout(function () {
                        closeScanner();
                        submitScannedCode(qrValue);
                    }, 650);
                } catch (e) {
                    setMessage(messages.keepFocus, false);
                }
            }, 500);
        });

        scanStop.addEventListener('click', function () {
            closeScanner();
            setMessage(messages.scanFailedRetry, true);
        });

        window.addEventListener('beforeunload', closeScanner);
    };
});
