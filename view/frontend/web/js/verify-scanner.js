define([], function () {
    'use strict';

    return function (config) {
        var scannerRoot = document.querySelector(config.rootSelector || '[data-role="qr-scanner"]');
        if (!scannerRoot) {
            return;
        }

        var scanTrigger = scannerRoot.querySelector('[data-role="scan-trigger"]');
        var scanMessage = scannerRoot.querySelector('[data-role="scan-message"]');
        var scanCamera = scannerRoot.querySelector('[data-role="scan-camera"]');
        var scanVideo = scannerRoot.querySelector('[data-role="scan-video"]');
        var scanStop = scannerRoot.querySelector('[data-role="scan-stop"]');
        var codeInput = document.querySelector('#verify-code');
        var form = document.querySelector('.pynarae-verify__form');

        if (!scanTrigger || !scanMessage || !scanCamera || !scanVideo || !scanStop || !codeInput || !form) {
            return;
        }

        var stream;
        var scanTimer;

        var messages = config.messages || {};

        var setMessage = function (message, isError) {
            scanMessage.textContent = message || '';
            scanMessage.classList.toggle('pynarae-verify__scanner-message--error', Boolean(isError));
        };

        var stopScanner = function () {
            if (scanTimer) {
                window.clearInterval(scanTimer);
                scanTimer = null;
            }

            if (stream) {
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                stream = null;
            }

            scanVideo.srcObject = null;
            scanCamera.hidden = true;
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

        var safeDecode = function (value) {
            try {
                return decodeURIComponent(value);
            } catch (e) {
                return value;
            }
        };

        scanTrigger.addEventListener('click', async function () {
            stopScanner();

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

            scanVideo.srcObject = stream;
            scanCamera.hidden = false;
            setMessage(messages.scanning, false);

            try {
                await scanVideo.play();
            } catch (e) {
                stopScanner();
                setMessage(messages.previewFailed, true);
                return;
            }

            scanTimer = window.setInterval(async function () {
                if (!stream) {
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

                    stopScanner();

                    var scannedText = safeDecode(qrValue);
                    var codeValue = scannedText;

                    if (/^https?:\/\//i.test(scannedText)) {
                        try {
                            var url = new URL(scannedText);
                            codeValue = url.searchParams.get('code') || scannedText;
                        } catch (e) {
                            codeValue = scannedText;
                        }
                    }

                    codeInput.value = codeValue;
                    setMessage(messages.successSubmitting, false);
                    form.submit();
                } catch (e) {
                    setMessage(messages.keepFocus, false);
                }
            }, 600);
        });

        scanStop.addEventListener('click', function () {
            stopScanner();
            setMessage(messages.cameraStopped, false);
        });

        window.addEventListener('beforeunload', stopScanner);
    };
});
