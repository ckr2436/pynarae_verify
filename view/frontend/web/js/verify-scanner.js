define(['require'], function (require) {
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

        var stream = null;
        var scanLoopTimer = null;
        var successDelayTimer = null;
        var isFinishingScan = false;
        var isScannerOpen = false;
        var scannerHistoryActive = false;
        var isDetectingFrame = false;
        var openSessionId = 0;
        var messages = config.messages || {};

        var detector = null;
        var activeFallback = null;
        var fallbackLoader = null;
        var qrCanvas = null;
        var qrContext = null;
        var fallbackStatusMessageShown = false;
        var scriptLoadPromises = {};
        var detectorLoadFailures = {
            'qr-scanner': false,
            'html5-qrcode': false,
            'zxing': false
        };
        var isAppleMobileDevice = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var preferHtml5QrcodeFallback = false;
        var sessionFallbackFailures = {
            'qr-scanner': 0,
            'html5-qrcode': 0,
            'zxing': 0
        };
        var sessionDisabledFallbacks = {
            'qr-scanner': false,
            'html5-qrcode': false,
            'zxing': false
        };
        var runtimeFallbackFailureLimit = 2;

        var assetUrls = {
            qrScanner: require.toUrl('Pynarae_Verify/lib/qr-scanner/qr-scanner.umd.min.js'),
            qrScannerWorker: require.toUrl('Pynarae_Verify/lib/qr-scanner/qr-scanner-worker.min.js'),
            html5Qrcode: require.toUrl('Pynarae_Verify/lib/html5-qrcode/html5-qrcode.min.js'),
            zxing: require.toUrl('Pynarae_Verify/lib/zxing/index.min.js')
        };

        var setMessage = function (message, isError) {
            scanMessage.textContent = message || '';
            scanMessage.classList.toggle('pynarae-verify__scanner-message--error', Boolean(isError));
        };

        var stopMediaStream = function (mediaStream) {
            if (!mediaStream) {
                return;
            }

            try {
                mediaStream.getTracks().forEach(function (track) {
                    track.stop();
                });
            } catch (e) {
                // Ignore stop errors.
            }
        };

        var invalidateOpenSession = function () {
            openSessionId += 1;
            return openSessionId;
        };

        var clearTimers = function () {
            if (scanLoopTimer) {
                window.clearTimeout(scanLoopTimer);
                scanLoopTimer = null;
            }

            if (successDelayTimer) {
                window.clearTimeout(successDelayTimer);
                successDelayTimer = null;
            }
        };

        var closeScanner = function (options) {
            var closeOptions = options || {};

            if (closeOptions.invalidateSession) {
                invalidateOpenSession();
            }

            clearTimers();

            isFinishingScan = false;
            isScannerOpen = false;
            isDetectingFrame = false;

            stopMediaStream(stream);
            stream = null;

            try {
                scanVideo.pause();
            } catch (e) {
                // Ignore pause errors.
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
            var scannedText = (rawValue || '').trim();

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

        var loadScript = function (src) {
            if (scriptLoadPromises[src]) {
                return scriptLoadPromises[src];
            }

            scriptLoadPromises[src] = new Promise(function (resolve, reject) {
                var existing = document.querySelector('script[src="' + src + '"]');

                if (existing) {
                    if (existing.getAttribute('data-loaded') === '1') {
                        resolve();
                        return;
                    }

                    existing.addEventListener('load', function () {
                        existing.setAttribute('data-loaded', '1');
                        resolve();
                    }, {once: true});

                    existing.addEventListener('error', function () {
                        reject(new Error('Failed to load script: ' + src));
                    }, {once: true});

                    return;
                }

                var script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = function () {
                    script.setAttribute('data-loaded', '1');
                    resolve();
                };
                script.onerror = function () {
                    reject(new Error('Failed to load script: ' + src));
                };
                document.head.appendChild(script);
            });

            return scriptLoadPromises[src];
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

        var markDetectorLoadFailure = function (name) {
            detectorLoadFailures[name] = true;

            if (activeFallback && activeFallback.name === name) {
                activeFallback = null;
            }

            fallbackLoader = null;
        };

        var isFallbackAvailable = function (name) {
            return detectorLoadFailures[name] !== true &&
                sessionDisabledFallbacks[name] !== true;
        };

        var resetFallbackSessionState = function () {
            sessionFallbackFailures['qr-scanner'] = 0;
            sessionFallbackFailures['html5-qrcode'] = 0;
            sessionFallbackFailures['zxing'] = 0;

            sessionDisabledFallbacks['qr-scanner'] = false;
            sessionDisabledFallbacks['html5-qrcode'] = false;
            sessionDisabledFallbacks['zxing'] = false;

            activeFallback = null;
            fallbackLoader = null;
        };

        var rotateFallbackOnRuntimeError = function (name, error) {
            if (isNoCodeDetectionError(error)) {
                return;
            }

            sessionFallbackFailures[name] = (sessionFallbackFailures[name] || 0) + 1;
            if (sessionFallbackFailures[name] < runtimeFallbackFailureLimit) {
                return;
            }

            sessionDisabledFallbacks[name] = true;

            if (activeFallback && activeFallback.name === name) {
                activeFallback = null;
            }

            fallbackLoader = null;
        };

        var ensureQrScannerLoaded = async function () {
            if (!isFallbackAvailable('qr-scanner')) {
                throw new Error('qr-scanner disabled because of prior load/init failure');
            }

            if (!window.QrScanner || typeof window.QrScanner.scanImage !== 'function') {
                await loadScript(assetUrls.qrScanner);
            }

            if (!window.QrScanner || typeof window.QrScanner.scanImage !== 'function') {
                throw new Error('QrScanner did not initialize correctly');
            }

            window.QrScanner.WORKER_PATH = assetUrls.qrScannerWorker;

            activeFallback = {
                name: 'qr-scanner'
            };

            return activeFallback;
        };

        var ensureHtml5QrcodeLoaded = async function () {
            if (!isFallbackAvailable('html5-qrcode')) {
                throw new Error('html5-qrcode disabled because of prior load/init failure');
            }

            if (!window.Html5Qrcode || typeof window.Html5Qrcode.prototype.scanFile !== 'function') {
                await loadScript(assetUrls.html5Qrcode);
            }

            if (!window.Html5Qrcode || typeof window.Html5Qrcode.prototype.scanFile !== 'function') {
                throw new Error('Html5Qrcode did not initialize correctly');
            }

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
        };

        var ensureZxingLoaded = async function () {
            if (!isFallbackAvailable('zxing')) {
                throw new Error('zxing disabled because of prior load/init failure');
            }

            if (!window.ZXing || typeof window.ZXing.BrowserQRCodeReader !== 'function') {
                await loadScript(assetUrls.zxing);
            }

            if (!window.ZXing || typeof window.ZXing.BrowserQRCodeReader !== 'function') {
                throw new Error('ZXing did not initialize correctly');
            }

            activeFallback = {
                name: 'zxing',
                detector: new window.ZXing.BrowserQRCodeReader()
            };

            return activeFallback;
        };

        var loadFallbackDetector = function () {
            if (activeFallback) {
                return Promise.resolve(activeFallback);
            }

            if (fallbackLoader) {
                return fallbackLoader;
            }

            fallbackLoader = (async function () {
                var orderedFallbacks = (isAppleMobileDevice && !preferHtml5QrcodeFallback) ? [
                    {name: 'qr-scanner', load: ensureQrScannerLoaded},
                    {name: 'zxing', load: ensureZxingLoaded},
                    {name: 'html5-qrcode', load: ensureHtml5QrcodeLoaded}
                ] : [
                    {name: 'qr-scanner', load: ensureQrScannerLoaded},
                    {name: 'html5-qrcode', load: ensureHtml5QrcodeLoaded},
                    {name: 'zxing', load: ensureZxingLoaded}
                ];

                for (var i = 0; i < orderedFallbacks.length; i++) {
                    var item = orderedFallbacks[i];

                    try {
                        return await item.load();
                    } catch (e) {
                        markDetectorLoadFailure(item.name);
                    }
                }

                throw new Error('No fallback QR library available');
            })();

            return fallbackLoader;
        };

        if (!isAppleMobileDevice && typeof window.BarcodeDetector === 'function') {
            try {
                detector = new window.BarcodeDetector({formats: ['qr_code']});
            } catch (e) {
                detector = null;
            }
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

        var waitForVideoReady = function (timeoutMs, sessionId) {
            var maxWait = typeof timeoutMs === 'number' ? timeoutMs : 5000;

            return new Promise(function (resolve, reject) {
                var start = Date.now();
                var settled = false;

                var cleanup = function () {
                    scanVideo.removeEventListener('loadedmetadata', onReadyCheck);
                    scanVideo.removeEventListener('loadeddata', onReadyCheck);
                    scanVideo.removeEventListener('canplay', onReadyCheck);
                };

                var finishResolve = function () {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    resolve();
                };

                var finishReject = function (error) {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    cleanup();
                    reject(error);
                };

                var onReadyCheck = function () {
                    if (sessionId !== openSessionId) {
                        finishReject(new Error('Scanner session changed'));
                        return;
                    }

                    if (scanVideo.readyState >= 2 && scanVideo.videoWidth > 0 && scanVideo.videoHeight > 0) {
                        finishResolve();
                        return;
                    }

                    if ((Date.now() - start) >= maxWait) {
                        finishReject(new Error('Timed out waiting for video readiness'));
                    }
                };

                scanVideo.addEventListener('loadedmetadata', onReadyCheck);
                scanVideo.addEventListener('loadeddata', onReadyCheck);
                scanVideo.addEventListener('canplay', onReadyCheck);

                var poll = function () {
                    if (settled) {
                        return;
                    }

                    if (sessionId !== openSessionId) {
                        finishReject(new Error('Scanner session changed'));
                        return;
                    }

                    if (scanVideo.readyState >= 2 && scanVideo.videoWidth > 0 && scanVideo.videoHeight > 0) {
                        finishResolve();
                        return;
                    }

                    if ((Date.now() - start) >= maxWait) {
                        finishReject(new Error('Timed out waiting for video readiness'));
                        return;
                    }

                    window.setTimeout(poll, 120);
                };

                poll();
            });
        };

        var detectQrCode = async function () {
            if (detector) {
                try {
                    var nativeCodes = await detector.detect(scanVideo);

                    if (nativeCodes.length && nativeCodes[0].rawValue) {
                        return nativeCodes[0].rawValue;
                    }

                    return '';
                } catch (nativeError) {
                    detector = null;
                }
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

                    return qrScannerResult && qrScannerResult.data ? qrScannerResult.data : (qrScannerResult || '');
                } catch (e) {
                    rotateFallbackOnRuntimeError('qr-scanner', e);
                    return '';
                }
            }

            if (fallback.name === 'html5-qrcode' && fallback.detector) {
                try {
                    var html5Blob = await toBlob(frameCanvas);
                    if (!html5Blob) {
                        return '';
                    }

                    var html5File = new File([html5Blob], 'frame.png', {type: 'image/png'});
                    return await fallback.detector.scanFile(html5File, false);
                } catch (e) {
                    rotateFallbackOnRuntimeError('html5-qrcode', e);
                    return '';
                }
            }

            if (fallback.name === 'zxing' && fallback.detector) {
                try {
                    var zxingBlob = await toBlob(frameCanvas);
                    if (!zxingBlob) {
                        return '';
                    }

                    var objectUrl = URL.createObjectURL(zxingBlob);

                    try {
                        var image = await loadImageFromObjectUrl(objectUrl);
                        var zxingResult = await fallback.detector.decodeFromImageElement(image);

                        return zxingResult && zxingResult.text ? zxingResult.text : '';
                    } finally {
                        URL.revokeObjectURL(objectUrl);
                    }
                } catch (e) {
                    rotateFallbackOnRuntimeError('zxing', e);
                    return '';
                }
            }

            return '';
        };

        var scheduleNextScan = function (sessionId, delay) {
            if (!isScannerOpen || isFinishingScan || sessionId !== openSessionId) {
                return;
            }

            scanLoopTimer = window.setTimeout(function () {
                runScanLoop(sessionId);
            }, typeof delay === 'number' ? delay : 220);
        };

        var runScanLoop = async function (sessionId) {
            if (sessionId !== openSessionId || !isScannerOpen || !stream || isFinishingScan) {
                return;
            }

            if (isDetectingFrame) {
                scheduleNextScan(sessionId, 180);
                return;
            }

            isDetectingFrame = true;

            try {
                var qrValue = (await detectQrCode() || '').trim();

                if (sessionId !== openSessionId) {
                    return;
                }

                if (qrValue) {
                    isFinishingScan = true;
                    clearTimers();
                    setMessage(messages.successDetected, false);

                    successDelayTimer = window.setTimeout(function () {
                        if (sessionId !== openSessionId) {
                            return;
                        }

                        closeScanner({syncHistory: true, invalidateSession: true});
                        submitScannedCode(qrValue, allowedHosts);
                    }, 650);

                    return;
                }
            } catch (e) {
                if (sessionId === openSessionId) {
                    setMessage(messages.keepFocus, false);
                }
            } finally {
                isDetectingFrame = false;
            }

            if (sessionId !== openSessionId) {
                return;
            }

            scheduleNextScan(sessionId, 220);
        };

        scanTrigger.addEventListener('click', async function () {
            closeScanner({syncHistory: false, invalidateSession: true});
            resetFallbackSessionState();
            var sessionId = openSessionId;
            var sessionStream = null;

            if (!detector) {
                if (!fallbackStatusMessageShown) {
                    setMessage(messages.loadingFallback, false);
                    fallbackStatusMessageShown = true;
                }

                try {
                    await loadFallbackDetector();
                } catch (decoderError) {
                    if (sessionId !== openSessionId) {
                        return;
                    }

                    setMessage(messages.noFallbackScanner, true);
                    return;
                }
            }

            try {
                sessionStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: {ideal: 'environment'}
                    },
                    audio: false
                });
            } catch (e) {
                try {
                    sessionStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                } catch (fallbackError) {
                    if (sessionId !== openSessionId) {
                        return;
                    }

                    setMessage(messages.cameraDenied, true);
                    return;
                }
            }

            if (sessionId !== openSessionId) {
                stopMediaStream(sessionStream);
                return;
            }

            if (!sessionStream) {
                setMessage(messages.cameraDenied, true);
                return;
            }

            stream = sessionStream;
            isFinishingScan = false;
            isDetectingFrame = false;

            scanVideo.srcObject = sessionStream;
            scanModal.hidden = false;
            isScannerOpen = true;
            document.body.classList.add('pynarae-verify--scanner-open');
            window.history.pushState({pynaraeScanner: true}, document.title, window.location.href);
            scannerHistoryActive = true;
            setMessage(messages.scanning, false);

            try {
                await scanVideo.play();

                if (sessionId !== openSessionId) {
                    stopMediaStream(sessionStream);
                    return;
                }

                await waitForVideoReady(5000, sessionId);

                if (sessionId !== openSessionId) {
                    stopMediaStream(sessionStream);
                    return;
                }
            } catch (e) {
                if (sessionId !== openSessionId) {
                    stopMediaStream(sessionStream);
                    return;
                }

                closeScanner({syncHistory: true, invalidateSession: true});
                setMessage(messages.previewFailed, true);
                return;
            }

            if (sessionId !== openSessionId) {
                stopMediaStream(sessionStream);
                return;
            }

            scheduleNextScan(sessionId, 250);
        });

        scanStop.addEventListener('click', function () {
            closeScanner({syncHistory: true, invalidateSession: true});
            setMessage(messages.scanFailedRetry, true);
        });

        window.addEventListener('popstate', function () {
            if (!isScannerOpen) {
                return;
            }

            scannerHistoryActive = false;
            closeScanner({syncHistory: false, invalidateSession: true});
            setMessage(messages.scanFailedRetry, true);
        });

        window.addEventListener('beforeunload', function () {
            closeScanner({syncHistory: false, invalidateSession: true});
        });
    };
});
