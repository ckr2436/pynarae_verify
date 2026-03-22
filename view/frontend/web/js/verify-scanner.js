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
        var activeFallback = null;
        var fallbackLoader = null;
        var fallbackFailureCounts = {};
        var disabledFallbacks = {};
        var qrCanvas = null;
        var qrContext = null;
        var fallbackStatusMessageShown = false;

        var loadScript = function (src) {
            return new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = function () {
                    resolve();
                };
                script.onerror = function () {
                    reject(new Error('Failed to load script: ' + src));
                };
                document.head.appendChild(script);
            });
        };

        var createFrameCanvas = function () {
            if (!qrCanvas) {
                qrCanvas = document.createElement('canvas');
                qrContext = qrCanvas.getContext('2d', {willReadFrequently: true});
            }

            var width = scanVideo.videoWidth;
            var height = scanVideo.videoHeight;
            if (!width || !height || !qrContext) {
                return null;
            }

            qrCanvas.width = width;
            qrCanvas.height = height;
            qrContext.drawImage(scanVideo, 0, 0, width, height);
            return qrCanvas;
        };

        var toBlob = function (canvas) {
            return new Promise(function (resolve) {
                canvas.toBlob(function (blob) {
                    resolve(blob || null);
                }, 'image/png');
            });
        };

        var loadImageFromObjectUrl = function (objectUrl) {
            return new Promise(function (resolve, reject) {
                var image = new Image();
                image.onload = function () {
                    if (typeof image.decode === 'function') {
                        image.decode().then(function () {
                            resolve(image);
                        }).catch(function () {
                            resolve(image);
                        });
                        return;
                    }

                    resolve(image);
                };
                image.onerror = function () {
                    reject(new Error('Failed to decode frame image'));
                };
                image.src = objectUrl;
            });
        };

        var isNoCodeDetectionError = function (error) {
            var details = [];
            var addDetail = function (value) {
                if (typeof value === 'string' && value) {
                    details.push(value.toLowerCase());
                }
            };

            addDetail(error);
            if (error && typeof error === 'object') {
                addDetail(error.message);
                addDetail(error.name);
                addDetail(error.code);
                if (error.constructor && typeof error.constructor.name === 'string') {
                    addDetail(error.constructor.name);
                }
            }

            return details.some(function (detail) {
                return detail.indexOf('no qr') !== -1 ||
                    detail.indexOf('notfound') !== -1 ||
                    detail.indexOf('not found') !== -1 ||
                    detail.indexOf('no code') !== -1 ||
                    detail.indexOf('no barcode') !== -1 ||
                    detail.indexOf('qr_parse_error') !== -1 ||
                    detail.indexOf('notfoundexception') !== -1;
            });
        };

        var handleFallbackDecodeError = function (fallbackName, error) {
            if (isNoCodeDetectionError(error)) {
                return;
            }

            fallbackFailureCounts[fallbackName] = (fallbackFailureCounts[fallbackName] || 0) + 1;
            if (fallbackFailureCounts[fallbackName] < 2) {
                return;
            }

            disabledFallbacks[fallbackName] = true;
            if (activeFallback && activeFallback.name === fallbackName) {
                activeFallback = null;
            }
            fallbackLoader = null;
        };

        var isFallbackAvailable = function (fallbackName) {
            return !disabledFallbacks[fallbackName];
        };

        var loadFallbackDetector = function () {
            if (activeFallback) {
                return Promise.resolve(activeFallback);
            }

            if (fallbackLoader) {
                return fallbackLoader;
            }

            fallbackLoader = (async function () {
                if (isFallbackAvailable('qr-scanner') &&
                    window.QrScanner && typeof window.QrScanner.scanImage === 'function') {
                    if (typeof window.QrScanner.WORKER_PATH === 'undefined') {
                        window.QrScanner.WORKER_PATH = 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner-worker.min.js';
                    }

                    activeFallback = {name: 'qr-scanner'};
                    return activeFallback;
                }

                try {
                    if (!isFallbackAvailable('qr-scanner')) {
                        throw new Error('qr-scanner fallback disabled');
                    }
                    await loadScript('https://unpkg.com/qr-scanner@1.4.2/qr-scanner.umd.min.js');
                    if (window.QrScanner && typeof window.QrScanner.scanImage === 'function') {
                        window.QrScanner.WORKER_PATH = 'https://unpkg.com/qr-scanner@1.4.2/qr-scanner-worker.min.js';
                        activeFallback = {name: 'qr-scanner'};
                        return activeFallback;
                    }
                } catch (e) {
                    // Try next fallback.
                }

                try {
                    if (!isFallbackAvailable('html5-qrcode')) {
                        throw new Error('html5-qrcode fallback disabled');
                    }
                    await loadScript('https://unpkg.com/html5-qrcode@2.3.8/minified/html5-qrcode.min.js');
                    if (window.Html5Qrcode && typeof window.Html5Qrcode.prototype.scanFile === 'function') {
                        if (!document.getElementById('pynarae-html5qrcode-offscreen')) {
                            var html5Root = document.createElement('div');
                            html5Root.id = 'pynarae-html5qrcode-offscreen';
                            html5Root.hidden = true;
                            document.body.appendChild(html5Root);
                        }
                        activeFallback = {
                            name: 'html5-qrcode',
                            detector: new window.Html5Qrcode('pynarae-html5qrcode-offscreen')
                        };
                        return activeFallback;
                    }
                } catch (e) {
                    // Try next fallback.
                }

                try {
                    if (!isFallbackAvailable('zxing')) {
                        throw new Error('zxing fallback disabled');
                    }
                    await loadScript('https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js');
                    if (window.ZXing && typeof window.ZXing.BrowserQRCodeReader === 'function') {
                        activeFallback = {
                            name: 'zxing',
                            detector: new window.ZXing.BrowserQRCodeReader()
                        };
                        return activeFallback;
                    }
                } catch (e) {
                    // Give up.
                }

                throw new Error('No fallback QR library available');
            })();

            return fallbackLoader;
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

            var fallback = await loadFallbackDetector();
            var frameCanvas = createFrameCanvas();
            if (!frameCanvas) {
                return '';
            }

            if (fallback.name === 'qr-scanner') {
                try {
                    var qrScannerResult = await window.QrScanner.scanImage(frameCanvas, {
                        returnDetailedScanResult: true
                    });
                    return qrScannerResult && qrScannerResult.data ? qrScannerResult.data : qrScannerResult || '';
                } catch (e) {
                    handleFallbackDecodeError(fallback.name, e);
                    return '';
                }
            }

            if (fallback.name === 'html5-qrcode' && fallback.detector) {
                try {
                    var html5Blob = await toBlob(frameCanvas);
                    if (!html5Blob) {
                        throw new Error('Failed to convert frame to blob');
                    }

                    var html5File = new File([html5Blob], 'frame.png', {type: 'image/png'});
                    return await fallback.detector.scanFile(html5File, false);
                } catch (e) {
                    handleFallbackDecodeError(fallback.name, e);
                    return '';
                }
            }

            if (fallback.name === 'zxing' && fallback.detector) {
                var zxingBlob = await toBlob(frameCanvas);
                if (!zxingBlob) {
                    return '';
                }

                var objectUrl = URL.createObjectURL(zxingBlob);
                try {
                    var image = await loadImageFromObjectUrl(objectUrl);
                    var zxingResult = await fallback.detector.decodeFromImageElement(image);
                    return zxingResult && zxingResult.text ? zxingResult.text : '';
                } catch (e) {
                    handleFallbackDecodeError(fallback.name, e);
                    return '';
                } finally {
                    URL.revokeObjectURL(objectUrl);
                }
            }

            return '';
        };

        scanTrigger.addEventListener('click', async function () {
            closeScanner();

            if (!detector) {
                if (!fallbackStatusMessageShown) {
                    setMessage(messages.loadingFallback, false);
                    fallbackStatusMessageShown = true;
                }
                try {
                    await loadFallbackDetector();
                } catch (decoderError) {
                    setMessage(messages.noFallbackScanner, true);
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
