define(['require'], function (require) {
    'use strict';

    return function (config) {
        var scannerRoot = document.querySelector(config.rootSelector || '[data-role="qr-scanner"]');
        if (!scannerRoot) {
            return;
        }

        var scanTrigger = scannerRoot.querySelector('[data-role="scan-trigger"]');
        var scanMessage = scannerRoot.querySelector('[data-role="scan-message"]');
        var scanModal = scannerRoot.querySelector('[data-role="scan-modal"]');
        var scanVideo = scannerRoot.querySelector('[data-role="scan-video"]');
        var scanStop = scannerRoot.querySelector('[data-role="scan-stop"]');
        var confirmModal = scannerRoot.querySelector('[data-role="confirm-modal"]');
        var confirmGuide = scannerRoot.querySelector('[data-role="confirm-guide"]');
        var confirmCode = scannerRoot.querySelector('[data-role="confirm-code"]');
        var confirmInput = scannerRoot.querySelector('[data-role="confirm-input"]');
        var confirmError = scannerRoot.querySelector('[data-role="confirm-error"]');
        var confirmSubmit = scannerRoot.querySelector('[data-role="confirm-submit"]');
        var confirmCancel = scannerRoot.querySelector('[data-role="confirm-cancel"]');

        var startSecondaryButton = scannerRoot.querySelector('[data-role="start-secondary-verification"]');
        var pendingPanel = document.querySelector('[data-role="pending-panel"]');
        var pendingDetails = document.querySelector('[data-role="pending-details"]');

        var resultPanel = document.querySelector('[data-role="verify-result"]');
        var resultTitle = document.querySelector('[data-role="verify-result-title"]');
        var resultText = document.querySelector('[data-role="verify-result-text"]');
        var detailsContainer = document.querySelector('[data-role="verify-details"]');
        var detailsBody = document.querySelector('[data-role="verify-details-body"]');

        var codeParamName = (scannerRoot.getAttribute('data-code-param') || 'code').trim() || 'code';
        var submittedCode = (scannerRoot.getAttribute('data-submitted-code') || '').trim();
        var currentUrl = new URL(window.location.href);
        var codeFromUrl = (
            currentUrl.searchParams.get(codeParamName) ||
            currentUrl.searchParams.get('code') ||
            ''
        ).trim();
        var activeVerificationCode = codeFromUrl || submittedCode;
        var verifyUrl = (scannerRoot.getAttribute('data-verify-url') || window.location.pathname).trim();
        var debugEnabled = currentUrl.searchParams.get('verify_debug') === '1';
        var debugPanel = null;
        var debugPanelBody = null;
        var debugMaxChars = 60000;

        var debugSessionCounter = 0;
        var currentScanDebugSessionId = null;
        var currentScanDebugStartedAt = 0;
        var currentScanDecodeSource = null;
        var currentScanFallbackAttempts = 0;
        var currentScanHtml5SuccessCount = 0;

        var debugSerialize = function (payload) {
            if (typeof payload === 'undefined') {
                return '';
            }

            if (payload === null) {
                return 'null';
            }

            if (typeof payload === 'string') {
                return payload;
            }

            try {
                return JSON.stringify(payload, null, 2);
            } catch (e) {
                try {
                    return String(payload);
                } catch (stringifyError) {
                    return '[unserializable payload]';
                }
            }
        };

        var ensureDebugPanel = function () {
            if (!debugEnabled || debugPanel) {
                return;
            }

            debugPanel = document.createElement('details');
            debugPanel.open = true;
            debugPanel.style.marginTop = '16px';
            debugPanel.style.padding = '12px';
            debugPanel.style.border = '1px solid #d9d9d9';
            debugPanel.style.borderRadius = '12px';
            debugPanel.style.background = '#fff';
            debugPanel.style.boxShadow = '0 4px 12px rgba(0,0,0,.05)';

            var summary = document.createElement('summary');
            summary.textContent = 'Verify Debug Panel';
            summary.style.cursor = 'pointer';
            summary.style.fontWeight = '700';
            summary.style.marginBottom = '10px';

            debugPanelBody = document.createElement('pre');
            debugPanelBody.style.margin = '10px 0 0';
            debugPanelBody.style.whiteSpace = 'pre-wrap';
            debugPanelBody.style.wordBreak = 'break-word';
            debugPanelBody.style.fontSize = '12px';
            debugPanelBody.style.lineHeight = '1.45';
            debugPanelBody.style.maxHeight = '45vh';
            debugPanelBody.style.overflow = 'auto';
            debugPanelBody.style.background = '#0f172a';
            debugPanelBody.style.color = '#e2e8f0';
            debugPanelBody.style.padding = '12px';
            debugPanelBody.style.borderRadius = '10px';

            debugPanel.appendChild(summary);
            debugPanel.appendChild(debugPanelBody);
            scannerRoot.appendChild(debugPanel);
        };

        var debugLog = function (label, payload) {
            if (!debugEnabled) {
                return;
            }

            ensureDebugPanel();

            var now = new Date();
            var message = '[' + now.toISOString() + '] ' + label;
            var serialized = debugSerialize(payload);

            if (serialized) {
                message += '\n' + serialized;
            }

            if (debugPanelBody) {
                debugPanelBody.textContent += (debugPanelBody.textContent ? '\n\n' : '') + message;

                if (debugPanelBody.textContent.length > debugMaxChars) {
                    debugPanelBody.textContent = debugPanelBody.textContent.slice(-debugMaxChars);
                }

                debugPanelBody.scrollTop = debugPanelBody.scrollHeight;
            }
        };

        var beginScanDebugSession = function (context) {
            debugSessionCounter += 1;
            currentScanDebugSessionId = 'scan-' + debugSessionCounter;
            currentScanDebugStartedAt = Date.now();
            currentScanDecodeSource = null;
            currentScanFallbackAttempts = 0;
            currentScanHtml5SuccessCount = 0;

            debugLog('scanSession:begin', {
                sessionId: currentScanDebugSessionId,
                context: context || null,
                href: window.location.href,
                userAgent: navigator.userAgent
            });
        };

        var getCurrentScanElapsedMs = function () {
            if (!currentScanDebugStartedAt) {
                return null;
            }

            return Date.now() - currentScanDebugStartedAt;
        };

        var challengeCreateUrl = (scannerRoot.getAttribute('data-challenge-create-url') || '').trim();
        var challengeVerifyUrl = (scannerRoot.getAttribute('data-challenge-verify-url') || '').trim();
        var performUrl = (scannerRoot.getAttribute('data-perform-url') || '').trim();
        var secondaryTokenParamName = (scannerRoot.getAttribute('data-secondary-token-param') || '_svt').trim() || '_svt';

        var showProductSku = (scannerRoot.getAttribute('data-show-product-sku') || '') === '1';
        var showBatchNo = (scannerRoot.getAttribute('data-show-batch-no') || '') === '1';
        var showScanCount = (scannerRoot.getAttribute('data-show-scan-count') || '') === '1';

        if (!scanTrigger || !scanMessage || !scanModal || !scanVideo || !scanStop) {
            return;
        }

        var stream = null;
        var scanLoopTimer = null;
        var successDelayTimer = null;
        var isFinishingScan = false;
        var isScannerOpen = false;
        var scannerHistoryActive = false;
        var scannerHistoryStateToken = 'pynarae-scanner-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        var isDetectingFrame = false;
        var openSessionId = 0;
        var messages = config.messages || {};
        var startSecondaryInProgress = false;
        var hasAutoStartedSecondaryVerification = false;
        var pendingSuccessfulScanPayload = null;

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
        var IOS_QRBOX_RATIO = 0.72;
        var IOS_QRBOX_MIN = 240;
        var IOS_QRBOX_MAX = 380;
        var IOS_FALLBACK_FRAME_MAX_EDGE = 960;
        var IOS_FALLBACK_START_DELAY_MS = 3500;
        var IOS_FALLBACK_INTERVAL_MS = 900;
        var IOS_FALLBACK_HINT_DELAY_MS = 2500;
        var IOS_FALLBACK_MAX_ATTEMPTS = 8;

        var isAppleMobileDevice = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (debugEnabled) {
            ensureDebugPanel();
            debugLog('init', {
                href: window.location.href,
                codeFromUrl: codeFromUrl,
                submittedCode: submittedCode,
                activeVerificationCode: activeVerificationCode,
                isAppleMobileDevice: isAppleMobileDevice
            });
        }

        var assetUrls = {
            qrScanner: require.toUrl('Pynarae_Verify/lib/qr-scanner/qr-scanner.umd.min.js'),
            qrScannerWorker: require.toUrl('Pynarae_Verify/lib/qr-scanner/qr-scanner-worker.min.js'),
            html5Qrcode: require.toUrl('Pynarae_Verify/lib/html5-qrcode/html5-qrcode.min.js'),
            zxing: require.toUrl('Pynarae_Verify/lib/zxing/index.min.js')
        };

        var iosOverlay = null;
        var iosOverlayCameraRoot = null;
        var iosOverlayGuide = null;
        var iosOverlayStopButton = null;
        var iosOverlayTitle = null;
        var html5Scanner = null;
        var html5StartPromise = null;
        var html5ScannerState = 'idle';
        var html5PatchTimers = [];
        var iosFallbackScanTimer = null;
        var iosFallbackHintTimer = null;
        var iosFallbackScanActive = false;
        var iosPinchActive = false;
        var iosPinchStartDistance = 0;
        var iosPinchStartZoom = 1;
        var iosCurrentZoomFactor = 1;
        var iosPendingZoomFactor = null;
        var iosZoomApplyInFlight = false;
        var iosPinchListenersBound = false;
        var scanModalPinchListenersBound = false;

        var setMessage = function (message, isError) {
            scanMessage.textContent = message || '';
            scanMessage.classList.toggle('pynarae-verify__scanner-message--error', Boolean(isError));
        };

        var hideSecondaryVerificationEntry = function () {
            if (startSecondaryButton) {
                startSecondaryButton.hidden = true;
                startSecondaryButton.disabled = false;
                startSecondaryButton.style.display = 'none';
                startSecondaryButton.setAttribute('aria-hidden', 'true');
            }

            if (pendingPanel) {
                pendingPanel.hidden = true;
                pendingPanel.style.display = 'none';
                pendingPanel.setAttribute('aria-hidden', 'true');
            }

            if (pendingDetails) {
                pendingDetails.hidden = true;
                pendingDetails.style.display = 'none';
                pendingDetails.setAttribute('aria-hidden', 'true');
            }
        };

        var showSecondaryVerificationEntry = function () {
            if (!activeVerificationCode) {
                return;
            }

            if (startSecondaryButton) {
                startSecondaryButton.hidden = false;
                startSecondaryButton.disabled = false;
                startSecondaryButton.style.display = '';
                startSecondaryButton.removeAttribute('aria-hidden');
            }

            if (pendingPanel) {
                pendingPanel.hidden = false;
                pendingPanel.style.display = '';
                pendingPanel.removeAttribute('aria-hidden');
            }

            if (pendingDetails) {
                pendingDetails.hidden = false;
                pendingDetails.style.display = '';
                pendingDetails.removeAttribute('aria-hidden');
            }
        };

        var setResultCssClass = function (status) {
            var cssClass = 'pynarae-verify__result pynarae-verify__result--notice';

            if (status === 'success') {
                cssClass = 'pynarae-verify__result pynarae-verify__result--success';
            } else if (status === 'error') {
                cssClass = 'pynarae-verify__result pynarae-verify__result--error';
            }

            if (resultPanel) {
                resultPanel.className = cssClass;
            }
        };

        var clearRenderedDetails = function () {
            if (detailsBody) {
                detailsBody.innerHTML = '';
            }
        };

        var appendDetailRow = function (label, value) {
            if (!detailsBody) {
                return;
            }

            if (typeof value === 'undefined' || value === null || value === '') {
                return;
            }

            var tr = document.createElement('tr');
            var th = document.createElement('th');
            var td = document.createElement('td');

            th.textContent = label;
            td.textContent = String(value);

            tr.appendChild(th);
            tr.appendChild(td);
            detailsBody.appendChild(tr);
        };

        var focusResultPanel = function () {
            if (!resultPanel) {
                return;
            }

            resultPanel.hidden = false;
            resultPanel.scrollIntoView({behavior: 'smooth', block: 'start'});

            if (typeof resultPanel.focus === 'function') {
                resultPanel.focus({preventScroll: true});
            }
        };

        var renderRecoverableError = function (title, message) {
            if (!resultPanel || !resultTitle || !resultText) {
                return;
            }

            setResultCssClass('error');
            resultTitle.textContent = title || '';
            resultText.textContent = message || '';
            resultPanel.hidden = false;

            if (detailsContainer) {
                detailsContainer.hidden = true;
            }

            showSecondaryVerificationEntry();

            focusResultPanel();
        };

        var renderVerificationResult = function (result) {
            if (!resultPanel || !resultTitle || !resultText) {
                return;
            }

            clearRenderedDetails();
            setResultCssClass(result.status || 'notice');

            resultTitle.textContent = String(result.title || '');
            resultText.textContent = String(result.message || '');
            resultPanel.hidden = false;

            appendDetailRow('Verification Code', result.code || '');
            appendDetailRow('Authenticity Status', result.matched ? 'Verified' : 'Unable to Verify');
            appendDetailRow('Product Name', result.product_name || '');

            if (showProductSku) {
                appendDetailRow('Product SKU', result.product_sku || '');
            }

            if (showBatchNo) {
                appendDetailRow('Batch Number', result.batch_no || '');
            }

            if (showScanCount && typeof result.scan_count !== 'undefined' && result.scan_count !== null) {
                appendDetailRow('Total Successful Verifications', result.scan_count);
            }

            appendDetailRow('First Verified', result.first_scanned_at || '');
            appendDetailRow('Last Verified', result.last_scanned_at || '');

            if (detailsContainer) {
                detailsContainer.hidden = false;
            }

            hideSecondaryVerificationEntry();
            setMessage('', false);

            focusResultPanel();
        };

        var buildPostBody = function (payload) {
            var body = new URLSearchParams();

            Object.keys(payload).forEach(function (key) {
                if (typeof payload[key] !== 'undefined' && payload[key] !== null) {
                    body.append(key, String(payload[key]));
                }
            });

            return body;
        };

        var postJson = async function (url, payload) {
            var response = await fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: buildPostBody(payload)
            });

            var data;
            try {
                data = await response.json();
            } catch (e) {
                data = null;
            }

            return {
                ok: response.ok,
                status: response.status,
                data: data
            };
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

        var clearHtml5PatchTimers = function () {
            html5PatchTimers.forEach(function (timerId) {
                window.clearTimeout(timerId);
            });
            html5PatchTimers = [];
        };

        var resetIosPinchState = function () {
            iosPinchActive = false;
            iosPinchStartDistance = 0;
            iosPinchStartZoom = 1;
            iosCurrentZoomFactor = 1;
            iosPendingZoomFactor = null;
            iosZoomApplyInFlight = false;
        };

        var getTouchDistance = function (touchA, touchB) {
            var dx = touchA.clientX - touchB.clientX;
            var dy = touchA.clientY - touchB.clientY;
            return Math.sqrt((dx * dx) + (dy * dy));
        };

        var getActiveScannerVideoElement = function () {
            if (iosOverlayCameraRoot) {
                var iosVideo = iosOverlayCameraRoot.querySelector('video');
                if (iosVideo && iosVideo.readyState >= 2) {
                    return iosVideo;
                }
            }

            if (scanVideo && scanVideo.readyState >= 2) {
                return scanVideo;
            }

            return null;
        };

        var getIosScannerVideoTrack = function () {
            if (!iosOverlayCameraRoot) {
                return null;
            }

            var video = iosOverlayCameraRoot.querySelector('video');
            if (!video || !video.srcObject || typeof video.srcObject.getVideoTracks !== 'function') {
                return null;
            }

            var tracks = video.srcObject.getVideoTracks();
            return tracks && tracks.length ? tracks[0] : null;
        };

        var getDefaultScannerVideoTrack = function () {
            if (!scanVideo || !scanVideo.srcObject || typeof scanVideo.srcObject.getVideoTracks !== 'function') {
                return null;
            }

            var tracks = scanVideo.srcObject.getVideoTracks();
            return tracks && tracks.length ? tracks[0] : null;
        };

        var getActiveScannerVideoTrack = function () {
            return getIosScannerVideoTrack() || getDefaultScannerVideoTrack();
        };

        var getTrackZoomRange = function (track) {
            if (!track || typeof track.getCapabilities !== 'function') {
                return null;
            }

            try {
                var capabilities = track.getCapabilities();
                if (!capabilities || typeof capabilities.zoom === 'undefined') {
                    return null;
                }

                if (typeof capabilities.zoom === 'number') {
                    return {
                        min: 1,
                        max: capabilities.zoom,
                        step: 0.1
                    };
                }

                return {
                    min: typeof capabilities.zoom.min === 'number' ? capabilities.zoom.min : 1,
                    max: typeof capabilities.zoom.max === 'number' ? capabilities.zoom.max : 1,
                    step: typeof capabilities.zoom.step === 'number' ? capabilities.zoom.step : 0.1
                };
            } catch (e) {
                return null;
            }
        };

        var clampZoomFactor = function (range, factor) {
            var min = range && typeof range.min === 'number' ? range.min : 1;
            var max = range && typeof range.max === 'number' ? range.max : min;
            var step = range && typeof range.step === 'number' && range.step > 0 ? range.step : 0.1;

            var target = Math.min(max, Math.max(min, factor));

            if (step > 0) {
                target = Math.round(target / step) * step;
                target = Math.min(max, Math.max(min, target));
            }

            return Number(target.toFixed(2));
        };

        var getCurrentTrackZoomFactor = function () {
            var track = getActiveScannerVideoTrack();
            var zoomRange = getTrackZoomRange(track);

            if (!track || !zoomRange) {
                return 1;
            }

            try {
                if (typeof track.getSettings === 'function') {
                    var settings = track.getSettings();
                    if (settings && typeof settings.zoom === 'number') {
                        return clampZoomFactor(zoomRange, settings.zoom);
                    }
                }
            } catch (e) {
                // Ignore settings read errors.
            }

            return clampZoomFactor(zoomRange, iosCurrentZoomFactor || 1);
        };

        var applyIosTrackZoomFactor = function (factor) {
            var track = getActiveScannerVideoTrack();
            var zoomRange = getTrackZoomRange(track);

            if (!track || !zoomRange || typeof track.applyConstraints !== 'function') {
                return Promise.resolve(false);
            }

            var targetZoom = clampZoomFactor(zoomRange, factor);

            if (iosZoomApplyInFlight) {
                iosPendingZoomFactor = targetZoom;
                return Promise.resolve(true);
            }

            iosZoomApplyInFlight = true;

            return track.applyConstraints({
                advanced: [{zoom: targetZoom}]
            }).catch(function () {
                return track.applyConstraints({
                    zoom: targetZoom
                });
            }).then(function () {
                iosCurrentZoomFactor = targetZoom;
                iosPendingZoomFactor = null;
                return true;
            }).catch(function () {
                return false;
            }).finally(function () {
                iosZoomApplyInFlight = false;

                if (iosPendingZoomFactor !== null &&
                    Math.abs(iosPendingZoomFactor - iosCurrentZoomFactor) >= 0.05) {
                    var nextZoom = iosPendingZoomFactor;
                    iosPendingZoomFactor = null;
                    applyIosTrackZoomFactor(nextZoom);
                }
            });
        };

        var handleIosPinchTouchStart = function (event) {
            if (!isScannerOpen) {
                return;
            }

            if (!event.touches || event.touches.length < 2) {
                return;
            }

            var track = getActiveScannerVideoTrack();
            var zoomRange = getTrackZoomRange(track);
            if (!track || !zoomRange) {
                return;
            }

            event.preventDefault();

            iosPinchActive = true;
            iosPinchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
            iosPinchStartZoom = getCurrentTrackZoomFactor();
            iosCurrentZoomFactor = iosPinchStartZoom;
        };

        var handleIosPinchTouchMove = function (event) {
            if (!iosPinchActive || !event.touches || event.touches.length < 2) {
                return;
            }

            var track = getActiveScannerVideoTrack();
            var zoomRange = getTrackZoomRange(track);
            if (!track || !zoomRange) {
                return;
            }

            event.preventDefault();

            var currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
            if (!currentDistance || !iosPinchStartDistance) {
                return;
            }

            var ratio = currentDistance / iosPinchStartDistance;
            var nextZoom = clampZoomFactor(zoomRange, iosPinchStartZoom * ratio);

            if (Math.abs(nextZoom - iosCurrentZoomFactor) < 0.08) {
                return;
            }

            applyIosTrackZoomFactor(nextZoom);
        };

        var handleIosPinchTouchEnd = function (event) {
            if (event.touches && event.touches.length >= 2) {
                iosPinchStartDistance = getTouchDistance(event.touches[0], event.touches[1]);
                iosPinchStartZoom = getCurrentTrackZoomFactor();
                iosCurrentZoomFactor = iosPinchStartZoom;
                return;
            }

            iosPinchActive = false;
            iosPinchStartDistance = 0;
            iosPinchStartZoom = getCurrentTrackZoomFactor();
            iosCurrentZoomFactor = iosPinchStartZoom;
        };

        var bindIosPinchZoomListeners = function () {
            if (!iosOverlayCameraRoot || iosPinchListenersBound) {
                return;
            }

            iosOverlayCameraRoot.style.touchAction = 'none';

            iosOverlayCameraRoot.addEventListener('touchstart', handleIosPinchTouchStart, {
                passive: false
            });
            iosOverlayCameraRoot.addEventListener('touchmove', handleIosPinchTouchMove, {
                passive: false
            });
            iosOverlayCameraRoot.addEventListener('touchend', handleIosPinchTouchEnd, {
                passive: true
            });
            iosOverlayCameraRoot.addEventListener('touchcancel', handleIosPinchTouchEnd, {
                passive: true
            });

            iosPinchListenersBound = true;
        };

        var bindScanModalPinchZoomListeners = function () {
            if (!scanModal || scanModalPinchListenersBound) {
                return;
            }

            scanModal.style.touchAction = 'none';

            scanModal.addEventListener('touchstart', handleIosPinchTouchStart, {
                passive: false
            });
            scanModal.addEventListener('touchmove', handleIosPinchTouchMove, {
                passive: false
            });
            scanModal.addEventListener('touchend', handleIosPinchTouchEnd, {
                passive: true
            });
            scanModal.addEventListener('touchcancel', handleIosPinchTouchEnd, {
                passive: true
            });

            scanModalPinchListenersBound = true;
        };

        var ensureIosOverlay = function () {
            if (iosOverlay) {
                return iosOverlay;
            }

            iosOverlay = document.createElement('div');
            iosOverlay.id = 'pynarae-ios-scanner-overlay';
            iosOverlay.style.position = 'fixed';
            iosOverlay.style.left = '0';
            iosOverlay.style.top = '0';
            iosOverlay.style.right = '0';
            iosOverlay.style.bottom = '0';
            iosOverlay.style.width = '100vw';
            iosOverlay.style.height = '100vh';
            iosOverlay.style.background = '#000';
            iosOverlay.style.zIndex = '999999';
            iosOverlay.style.display = 'none';
            iosOverlay.style.overflow = 'hidden';

            iosOverlayCameraRoot = document.createElement('div');
            iosOverlayCameraRoot.id = 'pynarae-ios-html5-camera';
            iosOverlayCameraRoot.style.position = 'absolute';
            iosOverlayCameraRoot.style.left = '0';
            iosOverlayCameraRoot.style.top = '0';
            iosOverlayCameraRoot.style.right = '0';
            iosOverlayCameraRoot.style.bottom = '0';
            iosOverlayCameraRoot.style.width = '100%';
            iosOverlayCameraRoot.style.height = '100%';
            iosOverlayCameraRoot.style.background = '#000';
            iosOverlayCameraRoot.style.overflow = 'hidden';
            iosOverlayCameraRoot.style.touchAction = 'none';

            iosOverlayGuide = document.createElement('div');
            iosOverlayGuide.style.position = 'absolute';
            iosOverlayGuide.style.left = '50%';
            iosOverlayGuide.style.top = '50%';
            iosOverlayGuide.style.width = (IOS_QRBOX_RATIO * 100) + 'vw';
            iosOverlayGuide.style.height = (IOS_QRBOX_RATIO * 100) + 'vw';
            iosOverlayGuide.style.maxWidth = IOS_QRBOX_MAX + 'px';
            iosOverlayGuide.style.maxHeight = IOS_QRBOX_MAX + 'px';
            iosOverlayGuide.style.minWidth = IOS_QRBOX_MIN + 'px';
            iosOverlayGuide.style.minHeight = IOS_QRBOX_MIN + 'px';
            iosOverlayGuide.style.transform = 'translate(-50%, -50%)';
            iosOverlayGuide.style.border = '6px solid rgba(255,255,255,0.92)';
            iosOverlayGuide.style.borderRadius = '28px';
            iosOverlayGuide.style.boxShadow = '0 0 0 200vmax rgba(0,0,0,0.18)';
            iosOverlayGuide.style.pointerEvents = 'none';
            iosOverlayGuide.style.zIndex = '3';

            iosOverlayTitle = document.createElement('div');
            iosOverlayTitle.style.position = 'absolute';
            iosOverlayTitle.style.left = '20px';
            iosOverlayTitle.style.right = '20px';
            iosOverlayTitle.style.top = 'calc(env(safe-area-inset-top, 0px) + 18px)';
            iosOverlayTitle.style.textAlign = 'center';
            iosOverlayTitle.style.color = '#fff';
            iosOverlayTitle.style.fontSize = '16px';
            iosOverlayTitle.style.fontWeight = '600';
            iosOverlayTitle.style.letterSpacing = '0.02em';
            iosOverlayTitle.style.zIndex = '4';
            iosOverlayTitle.textContent = messages.iosOverlayTitle || '';

            iosOverlayStopButton = document.createElement('button');
            iosOverlayStopButton.type = 'button';
            iosOverlayStopButton.textContent = messages.iosStopButton || '';
            iosOverlayStopButton.style.position = 'absolute';
            iosOverlayStopButton.style.left = '50%';
            iosOverlayStopButton.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 28px)';
            iosOverlayStopButton.style.transform = 'translateX(-50%)';
            iosOverlayStopButton.style.zIndex = '4';
            iosOverlayStopButton.style.minWidth = '180px';
            iosOverlayStopButton.style.padding = '14px 20px';
            iosOverlayStopButton.style.border = '0';
            iosOverlayStopButton.style.borderRadius = '14px';
            iosOverlayStopButton.style.background = '#fff';
            iosOverlayStopButton.style.color = '#444';
            iosOverlayStopButton.style.fontSize = '15px';
            iosOverlayStopButton.style.fontWeight = '600';
            iosOverlayStopButton.style.letterSpacing = '0.08em';
            iosOverlayStopButton.style.textTransform = 'uppercase';

            iosOverlayStopButton.addEventListener('click', function () {
                closeScanner({syncHistory: true, invalidateSession: true});
                setMessage(messages.scanFailedRetry, true);
            });

            iosOverlay.appendChild(iosOverlayCameraRoot);
            iosOverlay.appendChild(iosOverlayGuide);
            iosOverlay.appendChild(iosOverlayTitle);
            iosOverlay.appendChild(iosOverlayStopButton);
            document.body.appendChild(iosOverlay);
            bindIosPinchZoomListeners();

            return iosOverlay;
        };

        var setIosGuideState = function (state) {
            if (!iosOverlayGuide) {
                return;
            }

            if (state === 'success') {
                iosOverlayGuide.style.borderColor = '#34c759';
                iosOverlayGuide.style.boxShadow = '0 0 0 200vmax rgba(0,0,0,0.18), 0 0 0 3px rgba(52,199,89,0.18)';
                return;
            }

            iosOverlayGuide.style.borderColor = 'rgba(255,255,255,0.92)';
            iosOverlayGuide.style.boxShadow = '0 0 0 200vmax rgba(0,0,0,0.18)';
        };

        var stripIosHtml5QrcodeVisuals = function () {
            if (!iosOverlayCameraRoot) {
                return;
            }

            var scanRegion = document.getElementById(iosOverlayCameraRoot.id + '__scan_region');
            if (!scanRegion) {
                return;
            }

            scanRegion.style.background = 'transparent';
            scanRegion.style.border = '0';
            scanRegion.style.boxShadow = 'none';
            scanRegion.style.outline = '0';

            Array.prototype.forEach.call(scanRegion.querySelectorAll('*'), function (node) {
                var tag = (node.tagName || '').toLowerCase();

                if (tag === 'video' || tag === 'canvas') {
                    node.style.background = 'transparent';
                    node.style.border = '0';
                    node.style.boxShadow = 'none';
                    node.style.outline = '0';
                    return;
                }

                node.style.display = 'none';
                node.style.background = 'transparent';
                node.style.border = '0';
                node.style.boxShadow = 'none';
                node.style.outline = '0';
            });
        };

        var showIosOverlay = function () {
            ensureIosOverlay();
            iosOverlay.style.display = 'block';
        };

        var hideIosOverlay = function () {
            clearHtml5PatchTimers();
            resetIosPinchState();
            setIosGuideState('idle');

            if (iosOverlayCameraRoot) {
                iosOverlayCameraRoot.innerHTML = '';
            }

            if (iosOverlay) {
                iosOverlay.style.display = 'none';
            }
        };

        var patchIosHtml5Preview = function () {
            if (!iosOverlayCameraRoot) {
                return;
            }

            var video = iosOverlayCameraRoot.querySelector('video');
            if (video) {
                video.setAttribute('playsinline', 'true');
                video.setAttribute('webkit-playsinline', 'true');
                video.setAttribute('autoplay', 'true');
                video.setAttribute('muted', 'true');
                video.playsInline = true;
                video.muted = true;
                video.autoplay = true;
                video.controls = false;
                video.style.position = 'absolute';
                video.style.left = '0';
                video.style.top = '0';
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.style.background = '#000';
                video.style.display = 'block';
                video.style.visibility = 'visible';
                video.style.opacity = '1';

                try {
                    video.play();
                } catch (e) {
                    // Ignore play errors.
                }
            }

            var canvases = iosOverlayCameraRoot.querySelectorAll('canvas');
            Array.prototype.forEach.call(canvases, function (canvas) {
                canvas.style.position = 'absolute';
                canvas.style.left = '0';
                canvas.style.top = '0';
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.objectFit = 'cover';
            });

            stripIosHtml5QrcodeVisuals();
        };

        var scheduleIosHtml5Patches = function () {
            clearHtml5PatchTimers();

            [0, 80, 180, 320, 600, 1000, 1600].forEach(function (delay) {
                var timerId = window.setTimeout(function () {
                    patchIosHtml5Preview();
                }, delay);

                html5PatchTimers.push(timerId);
            });
        };

        var stopHtml5Scanner = function () {
            debugLog('iosScan:stopHtml5Scanner', {
                sessionId: currentScanDebugSessionId,
                html5ScannerState: html5ScannerState,
                hasScanner: !!html5Scanner
            });

            clearIosFallbackScan();
            clearHtml5PatchTimers();
            resetIosPinchState();

            if (!html5Scanner) {
                hideIosOverlay();
                html5ScannerState = 'idle';
                html5StartPromise = null;
                return Promise.resolve();
            }

            var scannerToStop = html5Scanner;
            var pendingStart = html5StartPromise;

            if (html5ScannerState === 'starting' && pendingStart) {
                return pendingStart.catch(function () {
                    // Ignore start errors.
                }).then(function () {
                    if (!scannerToStop || html5ScannerState !== 'running') {
                        try {
                            if (scannerToStop && typeof scannerToStop.clear === 'function') {
                                scannerToStop.clear();
                            }
                        } catch (e) {
                            // Ignore clear errors.
                        }

                        html5Scanner = null;
                        html5ScannerState = 'idle';
                        html5StartPromise = null;
                        hideIosOverlay();
                        return;
                    }

                    return scannerToStop.stop().catch(function () {
                        // Ignore stop errors.
                    }).then(function () {
                        try {
                            if (typeof scannerToStop.clear === 'function') {
                                scannerToStop.clear();
                            }
                        } catch (e) {
                            // Ignore clear errors.
                        }

                        html5Scanner = null;
                        html5ScannerState = 'idle';
                        html5StartPromise = null;
                        hideIosOverlay();
                    });
                });
            }

            if (html5ScannerState !== 'running') {
                try {
                    if (typeof scannerToStop.clear === 'function') {
                        scannerToStop.clear();
                    }
                } catch (e) {
                    // Ignore clear errors.
                }

                html5Scanner = null;
                html5ScannerState = 'idle';
                html5StartPromise = null;
                hideIosOverlay();
                return Promise.resolve();
            }

            return scannerToStop.stop().catch(function () {
                // Ignore stop errors.
            }).then(function () {
                try {
                    if (typeof scannerToStop.clear === 'function') {
                        scannerToStop.clear();
                    }
                } catch (e) {
                    // Ignore clear errors.
                }

                html5Scanner = null;
                html5ScannerState = 'idle';
                html5StartPromise = null;
                hideIosOverlay();
            });
        };

        var closeScanner = function (options) {
            var closeOptions = options || {};
            debugLog('scan:closeScanner', {
                sessionId: currentScanDebugSessionId,
                options: closeOptions,
                scannerHistoryActive: scannerHistoryActive,
                isScannerOpen: isScannerOpen,
                decodeSource: currentScanDecodeSource,
                fallbackAttempts: currentScanFallbackAttempts
            });

            clearIosFallbackScan();

            if (closeOptions.invalidateSession) {
                invalidateOpenSession();
            }

            clearTimers();

            isFinishingScan = false;
            isScannerOpen = false;
            isDetectingFrame = false;

            stopMediaStream(stream);
            stream = null;

            stopHtml5Scanner();

            try {
                scanVideo.pause();
            } catch (e) {
                // Ignore pause errors.
            }

            scanVideo.srcObject = null;
            scanVideo.hidden = false;
            scanModal.hidden = true;
            document.body.classList.remove('pynarae-verify--scanner-open');
            hideIosOverlay();

            if (closeOptions.syncHistory !== false && scannerHistoryActive) {
                scannerHistoryActive = false;
                window.history.back();
            }
        };

        var syncScannerHistoryFlag = function () {
            scannerHistoryActive = !!(
                window.history &&
                window.history.state &&
                window.history.state.pynaraeScanner === true &&
                window.history.state.pynaraeScannerToken === scannerHistoryStateToken
            );
        };

        var requestServerChallenge = async function () {
            if (!challengeCreateUrl) {
                return {
                    success: false,
                    message: messages.secondVerifyUnavailable || messages.scanFailedRetry
                };
            }

            try {
                var response = await postJson(challengeCreateUrl, {});

                if (
                    !response.data ||
                    response.data.success !== true ||
                    !response.data.challenge_id ||
                    !response.data.challenge_code
                ) {
                    return {
                        success: false,
                        code: response.data && response.data.code ? response.data.code : 'challenge_unavailable',
                        message: response.data && response.data.message
                            ? response.data.message
                            : (messages.secondVerifyUnavailable || messages.scanFailedRetry)
                    };
                }

                return {
                    success: true,
                    challengeId: String(response.data.challenge_id),
                    challengeCode: String(response.data.challenge_code)
                };
            } catch (e) {
                return {
                    success: false,
                    message: messages.secondVerifyUnavailable || messages.scanFailedRetry
                };
            }
        };

        var verifyServerChallenge = async function (challengeId, challengeCode, scannedCode) {
            if (!challengeVerifyUrl || !challengeId || !challengeCode || !scannedCode) {
                return {
                    success: false,
                    message: messages.secondVerifyUnavailable || messages.scanFailedRetry
                };
            }

            try {
                var response = await postJson(challengeVerifyUrl, {
                    challenge_id: challengeId,
                    challenge_code: challengeCode,
                    verification_code: scannedCode
                });

                if (!response.data || response.data.success !== true || !response.data.token) {
                    return {
                        success: false,
                        code: response.data && response.data.code ? response.data.code : 'challenge_failed',
                        message: response.data && response.data.message
                            ? response.data.message
                            : (messages.secondVerifyInvalid || messages.scanFailedRetry)
                    };
                }

                return {
                    success: true,
                    token: String(response.data.token)
                };
            } catch (e) {
                return {
                    success: false,
                    message: messages.secondVerifyUnavailable || messages.scanFailedRetry
                };
            }
        };

        var performVerification = async function (code, verificationToken) {
            if (!performUrl || !code || !verificationToken) {
                return {
                    success: false,
                    code: 'invalid_request',
                    message: messages.verificationTryAgain || messages.scanFailedRetry
                };
            }

            try {
                var response = await postJson(performUrl, {
                    code: code,
                    _svt: verificationToken
                });

                if (!response.data) {
                    return {
                        success: false,
                        code: 'verification_unavailable',
                        message: messages.verificationTryAgain || messages.scanFailedRetry
                    };
                }

                return response.data;
            } catch (e) {
                return {
                    success: false,
                    code: 'verification_unavailable',
                    message: messages.verificationTryAgain || messages.scanFailedRetry
                };
            }
        };

        var requestSecondVerification = async function (scannedCode) {
            if (
                !confirmModal || !confirmGuide || !confirmCode || !confirmInput ||
                !confirmError || !confirmSubmit || !confirmCancel
            ) {
                setMessage(messages.secondVerifyUnavailable || messages.scanFailedRetry, true);
                return {
                    success: false,
                    message: messages.secondVerifyUnavailable || messages.scanFailedRetry
                };
            }

            var challenge = await requestServerChallenge();

            if (!challenge.success) {
                setMessage(challenge.message || messages.secondVerifyUnavailable || messages.scanFailedRetry, true);
                return challenge;
            }

            return new Promise(function (resolve) {
                confirmGuide.textContent = messages.secondVerifyPrompt || '';
                confirmCode.textContent = String(challenge.challengeCode || '').trim();
                confirmCode.hidden = confirmCode.textContent === '';
                confirmInput.value = '';
                confirmError.textContent = '';
                confirmError.hidden = true;
                confirmModal.hidden = false;

                var cleanup = function () {
                    confirmSubmit.removeEventListener('click', onSubmit);
                    confirmCancel.removeEventListener('click', onCancel);
                    confirmInput.removeEventListener('keydown', onInputKeyDown);
                    confirmInput.value = '';
                    confirmError.textContent = '';
                    confirmError.hidden = true;
                    confirmGuide.textContent = '';
                    confirmCode.textContent = '';
                    confirmCode.hidden = true;
                    confirmModal.hidden = true;
                };

                var onCancel = function () {
                    cleanup();
                    setMessage(messages.secondVerifyCancelled || messages.scanFailedRetry, true);
                    resolve({
                        success: false,
                        code: 'cancelled',
                        message: messages.secondVerifyCancelled || messages.scanFailedRetry
                    });
                };

                var onSubmit = async function () {
                    var value = String(confirmInput.value || '').trim();

                    if (value === '') {
                        confirmError.textContent = messages.secondVerifyInvalid || '';
                        confirmError.hidden = false;
                        confirmInput.focus();
                        return;
                    }

                    var tokenResult = await verifyServerChallenge(challenge.challengeId, value, scannedCode);
                    if (!tokenResult.success) {
                        confirmError.textContent = tokenResult.message || messages.secondVerifyInvalid || '';
                        confirmError.hidden = false;
                        confirmInput.focus();
                        return;
                    }

                    cleanup();
                    resolve(tokenResult);
                };

                var onInputKeyDown = function (event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        onSubmit();
                    } else if (event.key === 'Escape') {
                        event.preventDefault();
                        onCancel();
                    }
                };

                confirmSubmit.addEventListener('click', onSubmit);
                confirmCancel.addEventListener('click', onCancel);
                confirmInput.addEventListener('keydown', onInputKeyDown);
                confirmInput.focus();
            });
        };

        var getVerificationFailureMessage = function (responseData) {
            if (!responseData) {
                return messages.verificationTryAgain || messages.scanFailedRetry;
            }

            if (
                responseData.code === 'secondary_verification_expired' ||
                responseData.code === 'secondary_verification_invalid'
            ) {
                return responseData.message || messages.verificationExpired || messages.scanFailedRetry;
            }

            return responseData.message || messages.verificationTryAgain || messages.scanFailedRetry;
        };

        var startSecondaryVerificationFlow = async function (code) {
            var normalizedCode = String(code || '').trim();
            if (!normalizedCode) {
                setMessage(messages.secondVerifyUnavailable || messages.scanFailedRetry, true);
                return;
            }

            if (startSecondaryInProgress) {
                return;
            }

            startSecondaryInProgress = true;

            if (startSecondaryButton) {
                startSecondaryButton.disabled = true;
            }

            try {
                setMessage(messages.pendingVerification || '', false);

                var secondaryVerificationResult = await requestSecondVerification(normalizedCode);

                if (!secondaryVerificationResult.success || !secondaryVerificationResult.token) {
                    return;
                }

                setMessage(messages.performingVerification || messages.successSubmitting || '', false);

                var performResponse = await performVerification(normalizedCode, secondaryVerificationResult.token);

                if (performResponse.success === true && performResponse.result) {
                    setMessage('', false);
                    renderVerificationResult(performResponse.result);
                    return;
                }

                renderRecoverableError(
                    'Verification required',
                    getVerificationFailureMessage(performResponse)
                );
            } finally {
                startSecondaryInProgress = false;

                if (startSecondaryButton && !startSecondaryButton.hidden) {
                    startSecondaryButton.disabled = false;
                }
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
            var scannedText = (rawValue || '').trim();
            var decodedText = scannedText;
            var normalizedAllowedHosts = (allowedHosts || []).map(function (host) {
                return String(host || '').toLowerCase();
            }).filter(function (host) {
                return host !== '';
            });

            try {
                decodedText = decodeURIComponent(scannedText);
            } catch (e) {
                // Keep original value.
            }

            if (!/^https?:\/\//i.test(decodedText)) {
                return {
                    isValid: false,
                    errorMessage: messages.invalidQrDomain
                };
            }

            try {
                var scannedUrl = new URL(decodedText);
                var scannedHost = String(scannedUrl.host || '').toLowerCase();
                if (!scannedHost || normalizedAllowedHosts.indexOf(scannedHost) === -1) {
                    return {
                        isValid: false,
                        errorMessage: messages.invalidQrDomain
                    };
                }

                var codeValue = parseScannedCode(decodedText);
                if (!codeValue) {
                    return {
                        isValid: false,
                        errorMessage: messages.invalidQrDomain
                    };
                }

                return {
                    isValid: true,
                    code: codeValue
                };
            } catch (e) {
                return {
                    isValid: false,
                    errorMessage: messages.invalidQrDomain
                };
            }
        };

        var submitScannedCode = async function (qrValue, allowedHosts) {
            var parsedResult = parseAndValidateScannedCode(qrValue, allowedHosts);
            if (!parsedResult.isValid) {
                setMessage(parsedResult.errorMessage, true);
                return;
            }

            activeVerificationCode = String(parsedResult.code || '').trim();
            await startSecondaryVerificationFlow(activeVerificationCode);
        };

        var continuePendingSuccessfulScan = function () {
            if (!pendingSuccessfulScanPayload) {
                return;
            }

            var payload = pendingSuccessfulScanPayload;
            pendingSuccessfulScanPayload = null;

            submitScannedCode(payload.qrValue, payload.allowedHosts);
        };

        var autoStartSecondaryVerificationIfNeeded = function () {
            if (!activeVerificationCode || !codeFromUrl || hasAutoStartedSecondaryVerification) {
                return;
            }

            hasAutoStartedSecondaryVerification = true;

            window.setTimeout(function () {
                startSecondaryVerificationFlow(activeVerificationCode);
            }, 150);
        };

        var isMobile = window.matchMedia('(pointer: coarse)').matches ||
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        if (codeFromUrl) {
            setMessage(messages.pendingVerification || '', false);
            autoStartSecondaryVerificationIfNeeded();
        } else if (!isMobile) {
            setMessage(messages.desktopGuide, false);
        }

        if (startSecondaryButton) {
            startSecondaryButton.addEventListener('click', async function () {
                await startSecondaryVerificationFlow(activeVerificationCode);
            });
        }

        var hasAnyVideoInput = async function () {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
                return true;
            }

            try {
                var devices = await navigator.mediaDevices.enumerateDevices();
                return devices.some(function (device) {
                    return device.kind === 'videoinput';
                });
            } catch (e) {
                return true;
            }
        };

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            scanTrigger.hidden = true;

            if (!submittedCode) {
                setMessage(messages.noCameraApi, true);
            }

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

            var activeVideo = getActiveScannerVideoElement();
            if (!activeVideo || !qrContext) {
                return null;
            }

            var width = activeVideo.videoWidth;
            var height = activeVideo.videoHeight;

            if (!width || !height) {
                return null;
            }

            var sourceX = 0;
            var sourceY = 0;
            var sourceWidth = width;
            var sourceHeight = height;

            if (isAppleMobileDevice) {
                var cropEdge = Math.floor(Math.min(width, height) * IOS_QRBOX_RATIO);
                cropEdge = Math.max(
                    Math.min(IOS_QRBOX_MIN, Math.min(width, height)),
                    Math.min(IOS_QRBOX_MAX, cropEdge)
                );

                sourceX = Math.floor((width - cropEdge) / 2);
                sourceY = Math.floor((height - cropEdge) / 2);
                sourceWidth = cropEdge;
                sourceHeight = cropEdge;
            }

            var targetWidth = sourceWidth;
            var targetHeight = sourceHeight;
            var maxEdge = IOS_FALLBACK_FRAME_MAX_EDGE;

            if (Math.max(targetWidth, targetHeight) > maxEdge) {
                var scale = maxEdge / Math.max(targetWidth, targetHeight);
                targetWidth = Math.max(1, Math.round(targetWidth * scale));
                targetHeight = Math.max(1, Math.round(targetHeight * scale));
            }

            qrCanvas.width = targetWidth;
            qrCanvas.height = targetHeight;
            qrContext.clearRect(0, 0, targetWidth, targetHeight);
            qrContext.drawImage(
                activeVideo,
                sourceX,
                sourceY,
                sourceWidth,
                sourceHeight,
                0,
                0,
                targetWidth,
                targetHeight
            );

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
            return detectorLoadFailures[name] !== true;
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

            if (!window.Html5Qrcode || typeof window.Html5Qrcode !== 'function') {
                await loadScript(assetUrls.html5Qrcode);
            }

            if (!window.Html5Qrcode || typeof window.Html5Qrcode !== 'function') {
                throw new Error('Html5Qrcode did not initialize correctly');
            }

            return true;
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
                var orderedFallbacks = [
                    {name: 'qr-scanner', load: ensureQrScannerLoaded},
                    {name: 'html5-qrcode', load: ensureHtml5QrcodeLoaded},
                    {name: 'zxing', load: ensureZxingLoaded}
                ];

                for (var i = 0; i < orderedFallbacks.length; i++) {
                    var item = orderedFallbacks[i];

                    if (sessionDisabledFallbacks[item.name] === true) {
                        continue;
                    }

                    try {
                        var loaded = await item.load();
                        if (item.name === 'html5-qrcode') {
                            activeFallback = {
                                name: 'html5-qrcode'
                            };

                            return activeFallback;
                        }

                        return loaded;
                    } catch (e) {
                        if (sessionDisabledFallbacks[item.name] === true) {
                            continue;
                        }

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

        var allowedHosts = [String(window.location.host || '').toLowerCase()];

        try {
            var resolvedFormAction = new URL(verifyUrl, window.location.origin);
            var verifyHost = String(resolvedFormAction.host || '').toLowerCase();
            if (verifyHost && allowedHosts.indexOf(verifyHost) === -1) {
                allowedHosts.push(verifyHost);
            }
        } catch (e) {
            // Ignore URL parsing failures and fall back to current host only.
        }

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

            if (fallback.name === 'html5-qrcode') {
                return '';
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

        var finalizeSuccessfulScan = function (qrValue, sessionId) {
            debugLog('scan:finalizeSuccessfulScan', {
                sessionId: currentScanDebugSessionId,
                elapsedMs: getCurrentScanElapsedMs(),
                decodeSource: currentScanDecodeSource,
                fallbackAttempts: currentScanFallbackAttempts,
                qrValue: qrValue
            });

            if (sessionId !== openSessionId || isFinishingScan) {
                return;
            }

            var normalizedValue = String(qrValue || '').trim();
            if (!normalizedValue) {
                return;
            }

            isFinishingScan = true;
            clearTimers();
            setIosGuideState('success');
            setMessage(messages.successDetected, false);

            successDelayTimer = window.setTimeout(function () {
                if (sessionId !== openSessionId) {
                    return;
                }

                var shouldSyncHistory = scannerHistoryActive === true;

                pendingSuccessfulScanPayload = {
                    qrValue: normalizedValue,
                    allowedHosts: Array.isArray(allowedHosts) ? allowedHosts.slice() : allowedHosts
                };

                closeScanner({syncHistory: shouldSyncHistory, invalidateSession: true});

                if (!shouldSyncHistory) {
                    continuePendingSuccessfulScan();
                }
            }, 650);
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
                    finalizeSuccessfulScan(qrValue, sessionId);
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

        var clearIosFallbackScan = function () {
            debugLog('iosScan:clearFallbackLoop', {
                sessionId: currentScanDebugSessionId,
                hadTimer: !!iosFallbackScanTimer,
                hadHintTimer: !!iosFallbackHintTimer,
                wasActive: iosFallbackScanActive
            });

            iosFallbackScanActive = false;

            if (iosFallbackScanTimer) {
                window.clearTimeout(iosFallbackScanTimer);
                iosFallbackScanTimer = null;
            }

            if (iosFallbackHintTimer) {
                window.clearTimeout(iosFallbackHintTimer);
                iosFallbackHintTimer = null;
            }
        };

        var startIosFallbackFrameDecodeLoop = function (sessionId) {
            clearIosFallbackScan();
            iosFallbackScanActive = true;

            iosFallbackHintTimer = window.setTimeout(function () {
                if (
                    iosFallbackScanActive &&
                    sessionId === openSessionId &&
                    isScannerOpen &&
                    !isFinishingScan &&
                    !currentScanDecodeSource
                ) {
                    setMessage(
                        messages.iosFallbackHint || messages.keepFocus || '',
                        false
                    );
                }
            }, IOS_FALLBACK_HINT_DELAY_MS);

            var run = async function () {
                if (
                    !iosFallbackScanActive ||
                    sessionId !== openSessionId ||
                    !isScannerOpen ||
                    isFinishingScan ||
                    currentScanDecodeSource
                ) {
                    return;
                }

                if (html5ScannerState !== 'running') {
                    iosFallbackScanTimer = window.setTimeout(run, IOS_FALLBACK_INTERVAL_MS);
                    return;
                }

                currentScanFallbackAttempts += 1;

                if (currentScanFallbackAttempts <= 5 || currentScanFallbackAttempts % 5 === 0) {
                    debugLog('iosScan:fallbackAttempt', {
                        sessionId: currentScanDebugSessionId,
                        elapsedMs: getCurrentScanElapsedMs(),
                        attempt: currentScanFallbackAttempts
                    });
                }

                if (currentScanFallbackAttempts > IOS_FALLBACK_MAX_ATTEMPTS) {
                    debugLog('iosScan:fallbackStop:maxAttemptsReached', {
                        sessionId: currentScanDebugSessionId,
                        elapsedMs: getCurrentScanElapsedMs(),
                        attempt: currentScanFallbackAttempts
                    });

                    iosFallbackScanActive = false;
                    return;
                }

                try {
                    var qrValue = (await detectQrCode() || '').trim();

                    if (
                        iosFallbackScanActive &&
                        sessionId === openSessionId &&
                        qrValue
                    ) {
                        currentScanDecodeSource = 'fallback-frame-decode';

                        debugLog('iosScan:fallbackDecodeSuccess', {
                            sessionId: currentScanDebugSessionId,
                            elapsedMs: getCurrentScanElapsedMs(),
                            attempt: currentScanFallbackAttempts,
                            qrValue: qrValue
                        });

                        finalizeSuccessfulScan(qrValue, sessionId);
                        return;
                    }
                } catch (e) {
                    debugLog('iosScan:fallbackDecodeError', {
                        sessionId: currentScanDebugSessionId,
                        elapsedMs: getCurrentScanElapsedMs(),
                        attempt: currentScanFallbackAttempts,
                        message: e && e.message ? e.message : String(e)
                    });
                }

                iosFallbackScanTimer = window.setTimeout(run, IOS_FALLBACK_INTERVAL_MS);
            };

            iosFallbackScanTimer = window.setTimeout(run, IOS_FALLBACK_START_DELAY_MS);
        };

        var getIosCameraScore = function (camera) {
            var label = String((camera && camera.label) || '').toLowerCase();
            var score = 0;

            if (/^back camera$/.test(label)) {
                score += 220;
            }

            if (/back|rear|environment/.test(label)) {
                score += 100;
            }

            if (/main|1x/.test(label)) {
                score += 80;
            }

            if (/dual/.test(label)) {
                score -= 30;
            }

            if (/wide/.test(label) && !/^back camera$/.test(label) && !/main|1x/.test(label)) {
                score -= 20;
            }

            if (/ultra|macro|tele|zoom|front|selfie|continuity/.test(label)) {
                score -= 100;
            }

            return score;
        };

        var selectPreferredHtml5CameraId = function (cameras) {
            if (!cameras || !cameras.length) {
                debugLog('iosCamera:select:none', {
                    sessionId: currentScanDebugSessionId
                });
                return null;
            }

            var scoredCameras = cameras.map(function (camera) {
                return {
                    id: camera && camera.id,
                    label: String((camera && camera.label) || ''),
                    score: getIosCameraScore(camera)
                };
            });

            var topScore = scoredCameras.reduce(function (best, camera) {
                return Math.max(best, camera.score);
            }, -Infinity);

            debugLog('iosCamera:available', {
                sessionId: currentScanDebugSessionId,
                cameras: scoredCameras,
                topScore: topScore
            });

            // When labels are missing/ambiguous, camera scores are often 0.
            // Returning null preserves the facingMode:"environment" fallback.
            if (!isFinite(topScore) || topScore <= 0) {
                debugLog('iosCamera:fallbackToFacingModeEnvironment', {
                    sessionId: currentScanDebugSessionId
                });
                return null;
            }

            scoredCameras.sort(function (a, b) {
                return b.score - a.score;
            });

            debugLog('iosCamera:selectedByScore', {
                sessionId: currentScanDebugSessionId,
                selected: scoredCameras[0] || null
            });

            return scoredCameras[0] ? scoredCameras[0].id : null;
        };

        var getHtml5CameraSource = async function () {
            await ensureHtml5QrcodeLoaded();

            if (typeof window.Html5Qrcode.getCameras === 'function') {
                try {
                    var cameras = await window.Html5Qrcode.getCameras();
                    var preferredCameraId = selectPreferredHtml5CameraId(cameras);

                    if (preferredCameraId) {
                        debugLog('iosCamera:source', {
                            sessionId: currentScanDebugSessionId,
                            source: preferredCameraId
                        });
                        return preferredCameraId;
                    }
                } catch (e) {
                    // Fall through.
                }
            }

            debugLog('iosCamera:source', {
                sessionId: currentScanDebugSessionId,
                source: {facingMode: 'environment'}
            });

            return {
                facingMode: 'environment'
            };
        };

        var getHtml5QrcodeConfig = function () {
            var qrConfig = {
                fps: 14,
                rememberLastUsedCamera: false,
                disableFlip: true
            };

            if (isAppleMobileDevice) {
                qrConfig.fps = 15;
                qrConfig.qrbox = function (viewfinderWidth, viewfinderHeight) {
                    var edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * IOS_QRBOX_RATIO);
                    edge = Math.max(IOS_QRBOX_MIN, Math.min(IOS_QRBOX_MAX, edge));

                    return {
                        width: edge,
                        height: edge
                    };
                };
            }

            return qrConfig;
        };

        var startIosHtml5QrcodeScanner = async function (sessionId) {
            await ensureHtml5QrcodeLoaded();

            if (sessionId !== openSessionId) {
                return;
            }

            await stopHtml5Scanner();

            if (sessionId !== openSessionId) {
                return;
            }

            ensureIosOverlay();
            showIosOverlay();
            loadFallbackDetector().catch(function () {
                // Ignore preload failures; fallback loop will retry if possible.
            });

            html5Scanner = new window.Html5Qrcode(iosOverlayCameraRoot.id);
            html5ScannerState = 'starting';

            var onScanSuccess = function (decodedText) {
                if (sessionId !== openSessionId || isFinishingScan) {
                    return;
                }

                var qrValue = (decodedText || '').trim();
                if (!qrValue) {
                    return;
                }

                currentScanHtml5SuccessCount += 1;
                currentScanDecodeSource = 'html5-qrcode';

                debugLog('iosScan:html5DecodeSuccess', {
                    sessionId: currentScanDebugSessionId,
                    elapsedMs: getCurrentScanElapsedMs(),
                    qrValue: qrValue,
                    html5SuccessCount: currentScanHtml5SuccessCount
                });

                finalizeSuccessfulScan(qrValue, sessionId);
            };

            var onScanFailure = function () {
                // Ignore per-frame misses.
            };

            var cameraSource = await getHtml5CameraSource();

            if (sessionId !== openSessionId) {
                return;
            }

            var iosScannerStartAt = Date.now();
            debugLog('iosScan:html5Start:begin', {
                sessionId: currentScanDebugSessionId
            });

            html5StartPromise = html5Scanner.start(
                cameraSource,
                getHtml5QrcodeConfig(),
                onScanSuccess,
                onScanFailure
            ).then(function () {
                debugLog('iosScan:html5Start:success', {
                    sessionId: currentScanDebugSessionId,
                    elapsedMs: Date.now() - iosScannerStartAt
                });
                html5ScannerState = 'running';
                setIosGuideState('idle');
                patchIosHtml5Preview();
                scheduleIosHtml5Patches();
                resetIosPinchState();
                startIosFallbackFrameDecodeLoop(sessionId);

                window.setTimeout(function () {
                    if (sessionId !== openSessionId || html5ScannerState !== 'running') {
                        return;
                    }

                    applyIosTrackZoomFactor(1);
                }, 180);
            }).catch(function (startError) {
                debugLog('iosScan:html5Start:error', {
                    sessionId: currentScanDebugSessionId,
                    elapsedMs: Date.now() - iosScannerStartAt,
                    message: startError && startError.message ? startError.message : String(startError)
                });
                html5ScannerState = 'idle';
                html5Scanner = null;
                html5StartPromise = null;
                hideIosOverlay();
                throw startError;
            });

            return html5StartPromise;
        };

        scanTrigger.addEventListener('click', async function () {
            closeScanner({syncHistory: false, invalidateSession: true});
            resetFallbackSessionState();
            await stopHtml5Scanner();
            beginScanDebugSession({
                source: 'scanTrigger.click',
                previousScannerHistoryActive: scannerHistoryActive
            });

            var sessionId = openSessionId;
            var sessionStream = null;

            if (!(await hasAnyVideoInput())) {
                setMessage(messages.noCameraApi, true);
                return;
            }

            if (isAppleMobileDevice) {
                debugLog('iosScan:openRequested', {
                    sessionId: currentScanDebugSessionId
                });
                scanModal.hidden = true;
                scanVideo.hidden = true;
                isScannerOpen = true;
                document.body.classList.add('pynarae-verify--scanner-open');
                syncScannerHistoryFlag();
                if (!scannerHistoryActive) {
                    window.history.pushState(
                        {pynaraeScanner: true, pynaraeScannerToken: scannerHistoryStateToken},
                        document.title,
                        window.location.href
                    );
                    scannerHistoryActive = true;
                }
                setMessage(messages.scanning, false);

                try {
                    await startIosHtml5QrcodeScanner(sessionId);
                } catch (iosStartError) {
                    if (sessionId !== openSessionId) {
                        return;
                    }

                    closeScanner({syncHistory: true, invalidateSession: true});
                    setMessage(messages.previewFailed, true);
                }

                return;
            }

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

            scanVideo.hidden = false;
            scanVideo.srcObject = sessionStream;
            scanModal.hidden = false;
            bindScanModalPinchZoomListeners();
            isScannerOpen = true;
            document.body.classList.add('pynarae-verify--scanner-open');
            syncScannerHistoryFlag();
            if (!scannerHistoryActive) {
                window.history.pushState(
                    {pynaraeScanner: true, pynaraeScannerToken: scannerHistoryStateToken},
                    document.title,
                    window.location.href
                );
                scannerHistoryActive = true;
            }
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

                resetIosPinchState();

                window.setTimeout(function () {
                    if (sessionId !== openSessionId || !isScannerOpen) {
                        return;
                    }

                    applyIosTrackZoomFactor(1);
                }, 120);
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
            if (pendingSuccessfulScanPayload) {
                continuePendingSuccessfulScan();
                return;
            }

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
