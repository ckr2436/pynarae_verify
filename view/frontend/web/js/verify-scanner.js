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
        var resultPanel = document.querySelector('[data-role="verify-result"]');
        var codeInput = document.querySelector('#verify-code');
        var form = document.querySelector('.pynarae-verify__form');

        if (!scanTrigger || !scanMessage || !scanModal || !scanVideo || !scanStop || !codeInput || !form) {
            return;
        }

        var stream;
        var scanTimer;
        var successDelayTimer;
        var isFinishingScan = false;
        var isScannerOpen = false;
        var scannerHistoryActive = false;
        var messages = config.messages || {};

        var setMessage = function (message, isError) {
            scanMessage.textContent = message || '';
            scanMessage.classList.toggle('pynarae-verify__scanner-message--error', Boolean(isError));
        };

        var closeScanner = function (options) {
            var closeOptions = options || {};

            if (scanTimer) {
                window.clearInterval(scanTimer);
                scanTimer = null;
            }

            if (successDelayTimer) {
                window.clearTimeout(successDelayTimer);
                successDelayTimer = null;
            }

            isFinishingScan = false;
            isScannerOpen = false;

            if (stream) {
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });
                stream = null;
            }

            scanVideo.srcObject = null;
            scanModal.hidden = true;
            document.body.classList.remove('pynarae-verify--scanner-open');

            if (closeOptions.syncHistory !== false && scannerHistoryActive) {
                scannerHistoryActive = false;
                window.history.back();
            }
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

        var parseAndValidateScannedCode = function (rawValue, allowedHosts) {
            var codeValue = parseScannedCode(rawValue);
            if (!codeValue) {
                return {
                    isValid: false,
                    errorMessage: messages.scanFailedRetry
                };
            }

            var scannedText = (rawValue || '').trim();
            var decodedText = scannedText;
            try {
                decodedText = decodeURIComponent(scannedText);
            } catch (e) {
                // Keep original value.
            }

            if (!/^https?:\/\//i.test(decodedText)) {
                return {
                    isValid: true,
                    code: codeValue
                };
            }

            try {
                var scannedUrl = new URL(decodedText);
                if (allowedHosts.indexOf(scannedUrl.host) === -1) {
                    return {
                        isValid: false,
                        errorMessage: messages.invalidQrDomain
                    };
                }
            } catch (e) {
                return {
                    isValid: false,
                    errorMessage: messages.scanFailedRetry
                };
            }

            return {
                isValid: true,
                code: codeValue
            };
        };

        var submitScannedCode = function (qrValue, allowedHosts) {
            var parsedResult = parseAndValidateScannedCode(qrValue, allowedHosts);
            if (!parsedResult.isValid) {
                setMessage(parsedResult.errorMessage, true);
                return;
            }

            codeInput.value = parsedResult.code;
            setMessage(messages.successSubmitting, false);
            form.submit();
        };

        var isMobile = window.matchMedia('(pointer: coarse)').matches ||
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        if (!isMobile) {
            setMessage(messages.desktopGuide, false);
        }

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            scanTrigger.hidden = true;
            setMessage(messages.noCameraApi, true);
            return;
        }

        var detector = null;
        var jsQrDecode = null;
        var jsQrLoader = null;
        var qrCanvas = null;
        var qrContext = null;

        var loadJsQrDecoder = function () {
            if (jsQrDecode) {
                return Promise.resolve(jsQrDecode);
            }

            if (window.jsQR && typeof window.jsQR === 'function') {
                jsQrDecode = window.jsQR;
                return Promise.resolve(jsQrDecode);
            }

            if (jsQrLoader) {
                return jsQrLoader;
            }

            jsQrLoader = new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
                script.async = true;
                script.onload = function () {
                    if (window.jsQR && typeof window.jsQR === 'function') {
                        jsQrDecode = window.jsQR;
                        resolve(jsQrDecode);
                        return;
                    }

                    reject(new Error('jsQR loaded without window.jsQR'));
                };
                script.onerror = function () {
                    reject(new Error('Failed to load jsQR'));
                };

                document.head.appendChild(script);
            });

            return jsQrLoader;
        };

        if (typeof window.BarcodeDetector === 'function') {
            detector = new window.BarcodeDetector({formats: ['qr_code']});
        }
        var allowedHosts = [window.location.host];

        try {
            var resolvedFormAction = new URL(form.getAttribute('action'), window.location.origin);
            if (allowedHosts.indexOf(resolvedFormAction.host) === -1) {
                allowedHosts.push(resolvedFormAction.host);
            }
        } catch (e) {
            // Ignore URL parsing failures and fall back to current host only.
        }

        var scrollToResultIfPresent = function () {
            var url = new URL(window.location.href);
            if (!url.searchParams.get(codeParamName) || !resultPanel) {
                return;
            }

            resultPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
            if (typeof resultPanel.focus === 'function') {
                resultPanel.focus({preventScroll: true});
            }
        };

        scrollToResultIfPresent();

        var detectQrCode = async function () {
            if (detector) {
                var nativeCodes = await detector.detect(scanVideo);
                if (nativeCodes.length && nativeCodes[0].rawValue) {
                    return nativeCodes[0].rawValue;
                }

                return '';
            }

            if (!jsQrDecode) {
                await loadJsQrDecoder();
            }

            if (!qrCanvas) {
                qrCanvas = document.createElement('canvas');
                qrContext = qrCanvas.getContext('2d', {willReadFrequently: true});
            }

            var width = scanVideo.videoWidth;
            var height = scanVideo.videoHeight;
            if (!width || !height || !qrContext) {
                return '';
            }

            qrCanvas.width = width;
            qrCanvas.height = height;
            qrContext.drawImage(scanVideo, 0, 0, width, height);

            var frame = qrContext.getImageData(0, 0, width, height);
            var decoded = jsQrDecode(frame.data, width, height, {
                inversionAttempts: 'dontInvert'
            });

            return decoded && decoded.data ? decoded.data : '';
        };

        scanTrigger.addEventListener('click', async function () {
            closeScanner();

            if (!detector) {
                setMessage(messages.loadingFallback, false);
                try {
                    await loadJsQrDecoder();
                } catch (decoderError) {
                    setMessage(messages.noBarcodeDetector, true);
                    return;
                }
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: {ideal: 'environment'}
                    },
                    audio: false
                });
            } catch (e) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                } catch (fallbackError) {
                    setMessage(messages.cameraDenied, true);
                    return;
                }
            }

            if (!stream) {
                setMessage(messages.cameraDenied, true);
                return;
            }

            isFinishingScan = false;
            scanVideo.srcObject = stream;
            scanModal.hidden = false;
            isScannerOpen = true;
            document.body.classList.add('pynarae-verify--scanner-open');
            window.history.pushState({pynaraeScanner: true}, document.title, window.location.href);
            scannerHistoryActive = true;
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
                    var qrValue = (await detectQrCode() || '').trim();
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
                        submitScannedCode(qrValue, allowedHosts);
                    }, 650);
                } catch (e) {
                    setMessage(messages.keepFocus, false);
                }
            }, 500);
        });

        scanStop.addEventListener('click', function () {
            closeScanner({syncHistory: true});
            setMessage(messages.scanFailedRetry, true);
        });

        window.addEventListener('popstate', function () {
            if (!isScannerOpen) {
                return;
            }

            scannerHistoryActive = false;
            closeScanner({syncHistory: false});
            setMessage(messages.scanFailedRetry, true);
        });

        window.addEventListener('beforeunload', function () {
            closeScanner({syncHistory: false});
        });
    };
});
