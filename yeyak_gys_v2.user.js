// ==UserScript==
// @name         고양도시관리공사 성저파크골프장 Quick 예약도우미 V2
// @namespace    http://tampermonkey.net/
// @version      0.5.87
// @description  renderReservationStatusMap 스코프 위치 조정 및 에러 해결 완료
// @author       SS2225
// @match        https://yeyak.gys.or.kr/fmcs/102
// @match        https://yeyak.gys.or.kr/fmcs/102?*
// @match        https://yeyak.gys.or.kr/fmcs/27*
// @grant        window.close
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    let serverTimeOffsetMs = 0;
    let cachedMemberInfo = { name: '', barcode: '', facility: '고양체육관' };

    // 로컬 스토리지 기본값 상수 맵 정의
    const LOCAL_DEFAULT_VALUES = {
        'gys_local_env_resve_day': '15',
        'gys_local_env_resve_time_seq': '',
        'gys_local_env_program_cd': 'I000221'
    };

    // 스토리지 입출력 통합 함수
    const loadSessionData = (key) => { try { return win.sessionStorage.getItem(key); } catch (e) { return null; } };
    const saveSessionData = (key, val) => { try { win.sessionStorage.setItem(key, val); } catch (e) {} };
    const removeSessionData = (key) => { try { win.sessionStorage.removeItem(key); } catch (e) {} };

    const loadLocalData = (key) => {
        try {
            let val = win.localStorage.getItem(key);
            if (!val) {
                val = LOCAL_DEFAULT_VALUES[key] !== undefined ? LOCAL_DEFAULT_VALUES[key] : '';
                win.localStorage.setItem(key, val);
            }
            return val;
        } catch (e) { return LOCAL_DEFAULT_VALUES[key] || ''; }
    };
    const saveLocalData = (key, val) => { try { win.localStorage.setItem(key, val); } catch (e) {} };

    function getSessionReservationsMap() {
        const jsonStr = loadSessionData('gys_session_reservations_map');
        if (!jsonStr) return {};
        try {
            const parsed = JSON.parse(jsonStr);
            return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
        } catch (e) { return {}; }
    }

    function setSessionReservationsMap(mapObj) {
        saveSessionData('gys_session_reservations_map', JSON.stringify(mapObj));
    }

    function clearSessionReservationsMap() {
        removeSessionData('gys_session_reservations_map');
        removeSessionData('gys_session_mem_no');
        removeSessionData('gys_session_mem_nm');
        removeSessionData('gys_session_mem_barcode');
    }

    if (window.location.pathname === '/fmcs/27' || window.location.pathname.includes('/fmcs/31')) {
        clearSessionReservationsMap();
    }

    function parseTimeTo4Lines(rawText) {
        if (!rawText) return { part: '', startTime: '', endTime: '' };

        let cleanText = rawText.replace(/<br>/g, ' ').trim();
        let partName = '';
        let timeRange = '';

        if (cleanText.includes('|')) {
            const parts = cleanText.split('|');
            partName = parts[0] ? parts[0].trim() : '';
            timeRange = parts[1] ? parts[1].trim() : '';
        } else {
            const timeMatch = cleanText.match(/(\d{2}:\d{2}~\d{2}:\d{2})/);
            if (timeMatch) {
                timeRange = timeMatch[1];
                partName = cleanText.replace(timeMatch[1], '').trim();
            } else {
                timeRange = cleanText;
            }
        }

        if (partName) {
            partName = partName.replace(/^\(/, '').replace(/\)$/, '').trim();
            partName = `(${partName})`;
        }

        let startTime = '', endTime = '';
        if (timeRange && timeRange.includes('~')) {
            const tParts = timeRange.split('~');
            startTime = tParts[0].trim();
            endTime = tParts[1].trim();
        } else {
            startTime = timeRange || cleanText;
        }

        return { part: partName, startTime, endTime };
    }

    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    const isFromPanelParam = urlParams.get('from_panel') === 'true';

    const formatProgramName = (name) => name ? name.replace(/^온라인\s*/, '') : '';
    const getTodayYMD = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };
    const getTodayYMDHyphen = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const getFormattedYMDHM = () => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    };
    const formatMMDD = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
        if (dateStr.length === 8) return `${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        return dateStr;
    };
    const getCurrentYM = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const addMonthsToYM = (ymStr, offset) => {
        if (!ymStr || ymStr.length !== 6) return ymStr;
        const targetDate = new Date(parseInt(ymStr.substring(0, 4), 10), parseInt(ymStr.substring(4, 6), 10) - 1 + offset, 1);
        return `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
    };
    const formatYMWithDot = (ymStr) => ymStr && ymStr.length === 6 ? `${ymStr.substring(0, 4)}.${ymStr.substring(4, 6)}` : ymStr;
    const parseYMFromDot = (ymDotStr) => ymDotStr ? ymDotStr.replace(/\./g, '') : getCurrentYM();
    const getValidTargetDate = (dateStr) => (dateStr || '').replace(/-/g, '') || getTodayYMD();

    function loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            if (win.html2canvas) { resolve(win.html2canvas); return; }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = () => resolve(win.html2canvas);
            script.onerror = () => reject(new Error('html2canvas 로드 실패'));
            document.head.appendChild(script);
        });
    }

    async function capturePanelToPng() {
        const panel = document.getElementById('gys-custom-panel');
        if (!panel) { alert('캡처할 패널을 찾을 수 없습니다.'); return; }

        try {
            const h2c = await loadHtml2Canvas();
            const canvas = await h2c(panel, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
                onclone: (clonedDoc) => {
                    clonedDoc.querySelectorAll('#gys-user-name-btn, #gys-refresh-res-btn, #gys-capture-btn, #gys-menu-btn').forEach(btn => {
                        btn.style.display = 'inline-flex'; btn.style.alignItems = 'center'; btn.style.justifyContent = 'center'; btn.style.transform = 'translateY(-1px)';
                    });
                    clonedDoc.querySelectorAll('.gys-holiday-text').forEach(span => { span.style.transform = 'translateY(-1px)'; });
                }
            });

            const ymBtn = document.getElementById('gys-ym-reload-btn');
            const selectedYM = ymBtn ? parseYMFromDot(ymBtn.textContent.trim()) : getCurrentYM();
            const fileName = `${selectedYM}_${cachedMemberInfo.name || '미로그인'}_${getFormattedYMDHM()}.png`;

            canvas.toBlob(async (blob) => {
                if (!blob) { alert('이미지 생성에 실패했습니다.'); return; }
                let shareSuccess = false;
                try {
                    if (navigator.share && navigator.canShare) {
                        const file = new File([blob], fileName, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({ files: [file], title: '성저파크골프장 예약 캡쳐', text: `[${cachedMemberInfo.name}] 성저파크골프장 Quick 예약 현황` });
                            shareSuccess = true;
                        }
                    }
                } catch (e) {}
                if (!shareSuccess) {
                    const a = document.createElement('a'); a.download = fileName; a.href = URL.createObjectURL(blob);
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                }
            }, 'image/png');
        } catch (err) {
            alert('캡쳐 생성 중 오류가 발생했습니다.');
        }
    }

    if (actionParam) {
        const isQuickAutoTab = isFromPanelParam || loadSessionData('gys_session_quick_auto') === 'true';
        if (actionParam === 'paymentResult' && isQuickAutoTab) {
            saveSessionData('gys_session_change_resve', 'true');
            try { if (win.opener) win.opener = null; } catch (e) {}
            win.alert = (msg) => {
                removeSessionData('gys_session_quick_auto');
                if (confirm("🎉 예약 및 결제가 정상 완료되었습니다!\n\n현재 탭을 닫으시겠습니까?")) win.close();
                else win.stop && win.stop();
            };
            return;
        }
        if (actionParam === 'reg_read') {
            saveSessionData('gys_session_change_resve', 'true');
            if (isQuickAutoTab) {
                removeSessionData('gys_session_quick_auto');

                const isRefundPath = currentPath.includes('/fmcs/122');
                const alertMsg = isRefundPath
                    ? "🗑️ 환불이 정상 처리되었습니다!\n\n현재 탭을 닫으시겠습니까?"
                    : "🎉 예약이 정상 처리되었습니다!\n\n현재 탭을 닫으시겠습니까?";

                const handleRegReadConfirm = () => setTimeout(() => {
                    if (confirm(alertMsg)) win.close();
                }, 350);

                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleRegReadConfirm);
                else handleRegReadConfirm();
            }
            return;
        }
        if (actionParam === 'write') {
            if (isFromPanelParam) saveSessionData('gys_session_quick_auto', 'true');
            if (isQuickAutoTab) {
                const handlePaymentAutoClick = () => setTimeout(() => {
                    const refundCheckbox = document.querySelector('input[name="agree_refund"]');
                    if (refundCheckbox && !refundCheckbox.checked) {
                        refundCheckbox.checked = true;
                        refundCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                        refundCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                    }
                    const applyPayBtn = document.getElementById('apply_payment');
                    if (applyPayBtn) applyPayBtn.click();
                }, 400);
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handlePaymentAutoClick);
                else handlePaymentAutoClick();
            }
            return;
        }
        if (actionParam === 'refund') {
            if (isFromPanelParam) saveSessionData('gys_session_quick_auto', 'true');
            return;
        }
        return;
    }

    if (currentPath === '/fmcs/27') {
        const rawReferer = urlParams.get('referer');
        const decodedReferer = rawReferer ? decodeURIComponent(rawReferer) : '';
        if (decodedReferer.includes('autologin=true') || decodedReferer.includes('/fmcs/102')) {
            window.addEventListener('load', () => {
                const userIdInput = document.getElementById('userId');
                if (userIdInput) {
                    const rect = userIdInput.getBoundingClientRect();
                    window.scrollTo({ top: (rect.top + window.pageYOffset) - (window.innerHeight / 2) + (rect.height / 2), behavior: 'instant' });
                    userIdInput.focus({ preventScroll: true }); userIdInput.click();
                }
            });
        }
    } else if (currentPath === '/fmcs/102') {

        function handleLoginRedirect(isAuto = false) {
            clearSessionReservationsMap();
            const currentUrl = new URL(window.location.href);
            if (isAuto) currentUrl.searchParams.set('autologin', 'true');
            window.location.href = '/fmcs/27?referer=' + encodeURIComponent(currentUrl.toString());
            return true;
        }

        function updateUserNameBtnLabel() {
            const userNameBtn = document.getElementById('gys-user-name-btn');
            if (!userNameBtn) return;
            if (cachedMemberInfo.name && win.ISLOGIN) {
                userNameBtn.innerHTML = `👤 <span style="color: #274081; line-height: 1.0;">${cachedMemberInfo.name}</span>`;
                userNameBtn.title = "클릭 시 로그아웃 후 자동로그인";
            } else {
                userNameBtn.innerHTML = `🔑 로그인`;
                userNameBtn.title = "로그인 페이지로 이동";
            }
        }

        async function fetchWithServerTime(url, responseType = 'json') {
            const startReqTime = Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                updateServerTimeOffset(res, startReqTime);
                if (!res.ok) return null;
                return responseType === 'text' ? await res.text() : await res.json();
            } catch (err) {
                return null;
            }
        }

        async function checkTabSessionStatus(isFirstLoad = false) {
            try {
                const cachedMemNo = loadSessionData('gys_session_mem_no');
                const cachedMemNm = loadSessionData('gys_session_mem_nm');
                const cachedBarcode = loadSessionData('gys_session_mem_barcode');

                if (win.MEM_NO && cachedMemNo === win.MEM_NO && cachedMemNm && cachedBarcode) {
                    win.ISLOGIN = true;
                    cachedMemberInfo = { name: cachedMemNm, barcode: cachedBarcode, facility: '고양체육관' };
                    updateUserNameBtnLabel();
                    return true;
                }

                let memNo = String(win.MEM_NO || '').trim();
                if (!isFirstLoad) {
                    const responseText = await fetchWithServerTime('/rest/common/memNoSearch?_=' + Date.now(), 'text');
                    memNo = responseText ? responseText.trim() : '';
                }

                if (!memNo || memNo.includes('login') || memNo.includes('로그인')) {
                    resetLoginState();
                    return false;
                }

                win.ISLOGIN = true;
                win.MEM_NO = memNo;

                if (cachedMemNo === memNo && cachedMemNm && cachedBarcode) {
                    cachedMemberInfo = { name: cachedMemNm, barcode: cachedBarcode, facility: '고양체육관' };
                    updateUserNameBtnLabel();
                    return true;
                }

                const htmlText = await fetchWithServerTime('/fmcs/221?_=' + Date.now(), 'text');
                if (htmlText) {
                    const nameMatch = htmlText.match(/<dt>([^<]+)<\/dt>/);
                    const barcodeMatch = htmlText.match(/JsBarcode\("#barcode_pop_[^"]+",\s*"([^"]+)"/);
                    const facilityMatch = htmlText.match(/<dd class="tt">([^<]+)<\/dd>/);

                    const extractedName = nameMatch ? nameMatch[1].trim() : '회원';
                    const extractedBarcode = barcodeMatch ? barcodeMatch[1].trim() : memNo;
                    const extractedFacility = facilityMatch ? facilityMatch[1].trim() : '고양체육관';

                    if (extractedName && extractedBarcode) {
                        cachedMemberInfo = { name: extractedName, barcode: extractedBarcode, facility: extractedFacility };
                        saveSessionData('gys_session_mem_no', memNo);
                        saveSessionData('gys_session_mem_nm', extractedName);
                        saveSessionData('gys_session_mem_barcode', extractedBarcode);
                        updateUserNameBtnLabel();
                        return true;
                    }
                }
            } catch (err) {}

            resetLoginState();
            return false;
        }

        function resetLoginState() {
            win.ISLOGIN = false;
            win.MEM_NO = '';
            clearSessionReservationsMap();
            cachedMemberInfo = { name: '', barcode: '', facility: '고양체육관' };
            updateUserNameBtnLabel();
        }

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                const isLoggedIn = await checkTabSessionStatus(false);
                if (isLoggedIn && loadSessionData('gys_session_change_resve') === 'true') {
                    removeSessionData('gys_session_change_resve');
                    await refreshUserReservationsAsync();
                }
            }
        });

        const PROGRAM_LIST_DEFAULT = [
            {"item_nm":"온라인 일일입장(경로/복지)","sale_amt":1650,"item_cd":"I000221"},
            {"item_nm":"온라인 일일입장(일반)","sale_amt":3300,"item_cd":"I000222"},
            {"item_nm":"온라인 일일입장(청소년/군인)","sale_amt":2200,"item_cd":"I000227"},
            {"item_nm":"온라인 관외할증(경로/복지)","sale_amt":2470,"item_cd":"I000225"},
            {"item_nm":"온라인 관외할증(일반)","sale_amt":4950,"item_cd":"I000224"},
            {"item_nm":"온라인 관외할증(군인/청소년)","sale_amt":3300,"item_cd":"I000226"}
        ];

        function openPaymentInNewTab(url) {
            const form = document.createElement('form');
            form.method = 'GET'; form.action = url.split('?')[0]; form.target = '_blank';
            url.split('?')[1]?.split('&').forEach(param => {
                const [k, v] = param.split('=');
                const input = document.createElement('input'); input.type = 'hidden'; input.name = k; input.value = decodeURIComponent(v);
                form.appendChild(input);
            });
            const panelParamInput = document.createElement('input'); panelParamInput.type = 'hidden'; panelParamInput.name = 'from_panel'; panelParamInput.value = 'true';
            form.appendChild(panelParamInput);
            document.body.appendChild(form); form.submit(); document.body.removeChild(form);
        }

        function openRefundInNewTab(url) {
            const form = document.createElement('form');
            form.method = 'GET'; form.action = url.split('?')[0]; form.target = '_blank';
            url.split('?')[1]?.split('&').forEach(param => {
                const [k, v] = param.split('=');
                const input = document.createElement('input'); input.type = 'hidden'; input.name = k; input.value = decodeURIComponent(v);
                form.appendChild(input);
            });
            const panelParamInput = document.createElement('input'); panelParamInput.type = 'hidden'; panelParamInput.name = 'from_panel'; panelParamInput.value = 'true';
            form.appendChild(panelParamInput);
            document.body.appendChild(form); form.submit(); document.body.removeChild(form);
        }

        function custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink = false, retryCount = 0) {
            return new Promise((resolve) => {
                if (typeof win.ISLOGIN !== 'undefined' && !win.ISLOGIN) {
                    alert('로그인이 필요한 서비스입니다.');
                    isAutoLink ? handleLoginRedirect(true) : handleLoginRedirect();
                    resolve(false); return;
                }

                const targetApiUrl = `/rest/dailyuse/set_ticket_resve?company_code=GYS10&program_code=${program_code || "I000221"}&part_code=03&resve_date=${resve_date}&time_seq=${time_seq}&mem_no=${win.MEM_NO || ''}&user_cnt=1&_=` + Date.now();

                const handleResponseData = (data) => {
                    if (data.result_code != 0 && retryCount < 2) {
                        setTimeout(() => custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink, retryCount + 1).then(resolve), 300);
                        return;
                    }
                    if (data.result_code != 0) {
                        alert(data.result_message || '예약에 실패했습니다.');
                        resolve(false); return;
                    }
                    const targetUrl = `/fmcs/102?action=write&comcd=GYS10&resve_no=${data.r_num}&from_panel=true`;
                    if (isAutoLink) window.location.href = targetUrl;
                    else openPaymentInNewTab(targetUrl);
                    resolve(true);
                };

                const startReqTime = Date.now();
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: "GET", url: win.location.origin + targetApiUrl, headers: { "X-Requested-With": "XMLHttpRequest" },
                        onload: (response) => {
                            updateServerTimeOffset(response, startReqTime);
                            try { handleResponseData(JSON.parse(response.responseText)); } catch (e) { handleError(); }
                        },
                        onerror: handleError
                    });
                } else {
                    fetchWithServerTime(targetApiUrl).then(data => { if (data) handleResponseData(data); else handleError(); });
                }

                function handleError() {
                    if (retryCount < 2) setTimeout(() => custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink, retryCount + 1).then(resolve), 300);
                    else { alert('예약 요청 중 오류가 발생했습니다.'); resolve(false); }
                }
            });
        }

        function updateServerTimeOffset(response, startReqTime) {
            let serverDateHeader = response.headers?.get ? response.headers.get('date') : response.responseHeaders?.match(/^date:\s*(.+)$/im)?.[1];
            if (serverDateHeader) {
                serverTimeOffsetMs = (new Date(serverDateHeader).getTime() + Math.floor((Date.now() - startReqTime) / 2)) - Date.now();
            }
        }

        const fetchMonthStateList = (ym) => fetchWithServerTime(`/rest/dailyuse/mon_state_list?company_code=GYS10&part_code=03&resve_mon=${ym}&_=` + Date.now());
        const fetchTimeSlots = (targetDate) => fetchWithServerTime(`/rest/dailyuse/time_state_list?company_code=GYS10&part_code=03&resve_mon=${getValidTargetDate(targetDate)}&_=` + Date.now());
        const fetchItemList = async (targetDate) => {
            if (!win.ISLOGIN) return null;
            const data = await fetchWithServerTime(`/rest/dailyuse/item_list?company_code=GYS10&resve_part_code=03&resve_date=${getValidTargetDate(targetDate)}&member_code=&_=` + Date.now());
            return Array.isArray(data) && data.length > 0 ? data : null;
        };
        const fetchUserReservations = () => win.ISLOGIN ? fetchWithServerTime(`/rest/dailyuse/use_list?company_code=&member_code=${win.MEM_NO || ''}&status_code=1&_=` + Date.now()) : Promise.resolve(null);

        function scrollToPanelTop() {
            const panel = document.getElementById('gys-custom-panel');
            if (panel) window.scrollTo({ top: Math.max(0, window.pageYOffset + panel.getBoundingClientRect().top - 7), behavior: 'smooth' });
        }

        function initRealtimeClock() {
            const clockEl = document.getElementById('gys-realtime-clock');
            const clockContainerEl = document.getElementById('gys-realtime-clock-container');
            if (!clockEl || !clockContainerEl) return;
            const renderClockAndGauge = () => {
                const now = new Date(Date.now() + serverTimeOffsetMs);
                clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
                clockContainerEl.style.background = `linear-gradient(to right, #e2e8f0 ${(now.getMilliseconds() / 1000) * 100}%, #ffffff 0%)`;
                requestAnimationFrame(renderClockAndGauge);
            };
            requestAnimationFrame(renderClockAndGauge);
        }

        function applyResponsiveStyles() {
            if (document.getElementById('gys-responsive-style')) return;
            const style = document.createElement('style');
            style.id = 'gys-responsive-style';
            style.textContent = `
                #gys-custom-panel { position: relative !important; margin: 12px 0 130px 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; }
                div[class*="chatbot"], div[id*="chatbot"], div[class*="happyment"], div[id*="happyment"], iframe[src*="chatbot"] { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
                @media (min-width: 769px) {
                    #gys-pc-layout-wrapper { display: flex !important; justify-content: center !important; align-items: flex-start !important; gap: 20px !important; margin: 0 auto !important; width: fit-content !important; max-width: 100% !important; }
                    div.reservation.empty.pdtb, #resveList { float: none !important; margin: 0 !important; }
                    #gys-custom-panel { position: relative !important; width: 420px !important; margin-top: 80px !important; flex-shrink: 0 !important; z-index: 999 !important; }
                }`;
            document.head.appendChild(style);
        }

        async function createCustomPanel() {
            if (document.getElementById('gys-custom-panel')) return;

            await checkTabSessionStatus(true);

            applyResponsiveStyles();

            const settingResveDay = loadLocalData('gys_local_env_resve_day');
            const nowForCheck = new Date(Date.now() + serverTimeOffsetMs);
            const todayDayNum = String(nowForCheck.getDate()).padStart(2, '0');
            const isTargetDay = (todayDayNum === settingResveDay);

            const defaultYM = isTargetDay ? addMonthsToYM(getCurrentYM(), 1) : getCurrentYM();
            const defaultYMDot = formatYMWithDot(defaultYM);
            const todayHyphen = getTodayYMDHyphen();
            const todayMMDD = formatMMDD(todayHyphen);

            const userNameBtnLabel = (cachedMemberInfo.name && win.ISLOGIN)
                ? `👤 <span style="color: #274081; line-height: 1.0;">${cachedMemberInfo.name}</span>`
                : `🔑 로그인`;

            const panel = document.createElement('div');
            panel.id = 'gys-custom-panel';
            Object.assign(panel.style, { backgroundColor: '#ffffff', border: '1px solid #e0e0e0', padding: '8px 2px', fontFamily: 'Malgun Gothic, sans-serif', boxSizing: 'border-box', position: 'relative' });

            panel.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #274081; padding-bottom: 6px; margin-bottom: 8px; padding-left: 2px; padding-right: 2px;">
                    <span style="font-weight: bold; font-size: 17.5px; color: #274081; line-height: 1.1; display: flex; align-items: center; height: 35px;">⛳ 성저파크골프장 Quick 예약</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <div id="gys-realtime-clock-container" style="display: ${isTargetDay ? 'flex' : 'none'}; align-items: center; justify-content: center; width: 75px; height: 35px; border: 1.5px solid #28a745; border-radius: 4px; overflow: hidden; background: #ffffff; box-sizing: border-box;">
                            <span id="gys-realtime-clock" style="font-size: 13.5px; color: #0056b3; font-family: monospace; font-weight: bold; line-height: 1;">00:00:00</span>
                        </div>
                        <button id="gys-menu-btn" title="설정" style="width: 35px; height: 35px; background: transparent; border: none; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; padding: 0;">⚙️</button>
                    </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 3px; margin-bottom: 10px; padding: 0 1px;">
                    <div style="display: flex; gap: 2px; align-items: center; flex-shrink: 0;">
                        <button id="gys-prev-month-btn" style="width: 38px; height: 35px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0;">&lt;</button>
                        <button id="gys-ym-reload-btn" style="width: 70px; height: 35px; border: 1.5px solid #274081; border-radius: 4px; font-weight: bold; font-size: 13px; background-color: #e8f4ff; color: #274081; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-sizing: border-box; line-height: 1.0;">${defaultYMDot}</button>
                        <button id="gys-next-month-btn" style="width: 38px; height: 35px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0;">&gt;</button>
                    </div>
                    <div style="display: flex; gap: 3px; align-items: center; flex-shrink: 0; position: relative;">
                        <button id="gys-user-name-btn" style="height: 35px; padding: 0 6px; background-color: #f8f9fa; border: 1.5px solid #274081; border-radius: 4px; cursor: pointer; font-size: 11.5px; font-weight: bold; color: #333333; display: flex; align-items: center; justify-content: center; line-height: 1.0;">${userNameBtnLabel}</button>
                        <button id="gys-refresh-res-btn" title="예약현황 새로고침" style="height: 35px; padding: 0 8px; background-color: #f8f9fa; border: 1.5px solid #28a745; border-radius: 4px; cursor: pointer; font-size: 11.5px; font-weight: bold; color: #28a745; display: flex; align-items: center; justify-content: center; gap: 4px; line-height: 1.0;">🔄 예약현황</button>
                        <button id="gys-capture-btn" title="캡쳐" style="width: 35px; height: 35px; background-color: #f8f9fa; border: 1.5px solid #6c757d; border-radius: 4px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; padding: 0;">📸</button>
                    </div>
                </div>
                <div style="margin-bottom: 8px; padding: 0 1px;">
                    <div style="display: grid; grid-template-columns: 0.93fr 1.37fr auto; gap: 4px; align-items: center;">
                        <select id="gys-time-select" style="width: 100%; height: 34px; padding: 2px 2px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11px; font-weight: bold; color: #333333; background-color: #ffffff;"><option value="">시간대 로딩 중...</option></select>
                        <select id="gys-program-select" style="width: 100%; height: 34px; padding: 2px 4px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11px; font-weight: bold; color: #333333; background-color: #ffffff;"><option value="">상품 로딩 중...</option></select>
                        <div style="display: flex; align-items: center; position: relative; flex-shrink: 0;">
                            <input type="date" id="gys-base-date-input" value="${todayHyphen}" style="position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none;">
                            <button id="gys-base-date-btn" title="기준일 선택 (시간표/상품)" style="height: 34px; padding: 0 8px; background-color: #ffffff; border: 1px solid #cccccc; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; color: #333333; line-height: 1.0;"><span id="gys-base-date-label">${todayMMDD}</span></button>
                        </div>
                    </div>
                </div>
                <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 8px 0;">
                <div id="gys-calendar-wrapper" style="width: 100%; box-sizing: border-box;">
                    <div style="display: grid; grid-template-columns: repeat(7, minmax(42px, 1fr)); gap: 1px; text-align: center; font-weight: bold; font-size: 12.5px; margin-bottom: 4px; background-color: #F0F0F0; padding: 4px 0; border-radius: 0px;">
                        <span style="color: #d9534f;">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style="color: #0275d8;">토</span>
                    </div>
                    <div id="gys-date-buttons-container" style="display: grid; grid-template-columns: repeat(7, minmax(42px, 1fr)); gap: 1px; width: 100%; box-sizing: border-box;"></div>
                </div>`;

            let dayOptionsHtml = '';
            for (let i = 1; i <= 31; i++) {
                const ddStr = String(i).padStart(2, '0');
                dayOptionsHtml += `<option value="${ddStr}" ${ddStr === settingResveDay ? 'selected' : ''}>매월 ${ddStr}일</option>`;
            }

            const popupOverlay = document.createElement('div');
            popupOverlay.id = 'gys-smartphone-modal-overlay';
            Object.assign(popupOverlay.style, {
                position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '99999',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                boxSizing: 'border-box', borderRadius: '0px'
            });

            popupOverlay.innerHTML = `
                <div style="background-color: #f8f9fa; width: 270px; height: 360px; border-radius: 0px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 3px solid #333333; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; position: relative;">
                    <div style="background-color: #333333; color: #ffffff; padding: 9px 14px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; border-radius: 0px;">
                        <span style="font-size: 13px; font-weight: bold;">설정</span>
                        <button id="gys-popup-close-btn" style="background: none; border: none; color: #ffffff; font-size: 16px; cursor: pointer; padding: 0; font-weight: bold;">✕</button>
                    </div>
                    <div style="background-color: #ffffff; padding: 20px 14px; flex: 1; overflow-y: auto;">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <label style="font-size: 12px; font-weight: bold; color: #333333;">예약일 설정</label>
                            <select id="gys-setting-resve-day-select" style="width: 100%; height: 34px; padding: 2px 4px; border: 1px solid #cccccc; border-radius: 4px; font-size: 12px; font-weight: bold; color: #333333; background-color: #ffffff;">
                                ${dayOptionsHtml}
                            </select>
                        </div>
                    </div>
                </div>
            `;
            panel.appendChild(popupOverlay);

            const targetDiv = document.querySelector('div.reservation.empty.pdtb') || document.getElementById('resveList') || document.getElementById('container');
            if (targetDiv && targetDiv.parentNode) {
                let pcWrapper = document.getElementById('gys-pc-layout-wrapper');
                if (!pcWrapper) {
                    pcWrapper = document.createElement('div'); pcWrapper.id = 'gys-pc-layout-wrapper';
                    targetDiv.parentNode.insertBefore(pcWrapper, targetDiv); pcWrapper.appendChild(targetDiv);
                }
                pcWrapper.appendChild(panel);
            } else {
                document.body.appendChild(panel);
            }

            if (isTargetDay) {
                initRealtimeClock();
            }

            // [수정 완료] renderReservationStatusMap 함수를 refreshUserReservationsAsync 보다 상단으로 이동시킴
            function renderReservationStatusMap() {
                const ymBtn = document.getElementById('gys-ym-reload-btn');
                if (!ymBtn) return;
                const currentCalYM = parseYMFromDot(ymBtn.textContent.trim());
                document.querySelectorAll('.gys-dynamic-date-btn .gys-info-badge').forEach(badge => { badge.innerHTML = ''; });
                const reservationsByDate = getSessionReservationsMap();

                Object.keys(reservationsByDate).forEach(pureDate => {
                    if (pureDate.substring(0, 6) === currentCalYM) {
                        const resObj = reservationsByDate[pureDate];
                        const dateBtn = document.querySelector(`.gys-dynamic-date-btn[data-resve-date="${pureDate}"]`);
                        if (dateBtn && resObj?.time_name) {
                            const infoBadge = dateBtn.querySelector('.gys-info-badge');
                            if (infoBadge) {
                                const parsedObj = parseTimeTo4Lines(resObj.time_name);
                                const isServer = resObj.type === 'server';
                                infoBadge.innerHTML = `
                                    <div style="background-color: ${isServer ? '#2e7d32' : '#1565c0'}; border: 1px solid ${isServer ? '#1b5e20' : '#0d47a1'}; color: #ffffff; border-radius: 4px; padding: 4px 0; margin-top: 1px; width: 98%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1;">
                                        ${parsedObj.part ? `<span style="font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">${parsedObj.part}</span>` : ''}
                                        <span style="font-size: 11px; font-weight: 400;">${parsedObj.startTime}</span>
                                        ${parsedObj.endTime ? `<span style="font-size: 8px; font-weight: bold; opacity: 0.8; margin: -2px 0;">~</span><span style="font-size: 11px; font-weight: 400;">${parsedObj.endTime}</span>` : ''}
                                    </div>`;
                            }
                        }
                    }
                });
            }

            async function refreshUserReservationsAsync() {
                clearSessionReservationsMap();
                const resData = await fetchUserReservations();
                let newReservationsMap = {};
                if (Array.isArray(resData)) {
                    resData.forEach(item => {
                        if (String(item.app_type) === "30" && item.use_date && item.time_name) {
                            newReservationsMap[item.use_date.replace(/-/g, '')] = { type: 'server', time_name: item.time_name, data: item };
                        }
                    });
                }
                setSessionReservationsMap(newReservationsMap);
                renderReservationStatusMap();
            }

            const timeSelectEl = document.getElementById('gys-time-select');
            if (timeSelectEl) {
                timeSelectEl.addEventListener('change', function() {
                    if (this.value) saveLocalData('gys_local_env_resve_time_seq', this.value);
                });
            }

            const programSelectEl = document.getElementById('gys-program-select');
            if (programSelectEl) {
                programSelectEl.addEventListener('change', function() {
                    if (this.value) saveLocalData('gys_local_env_program_cd', this.value);
                });
            }

            const menuBtn = document.getElementById('gys-menu-btn');
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                popupOverlay.style.display = popupOverlay.style.display === 'flex' ? 'none' : 'flex';
            });

            document.getElementById('gys-popup-close-btn').addEventListener('click', () => {
                popupOverlay.style.display = 'none';
            });
            popupOverlay.addEventListener('click', (e) => {
                if (e.target === popupOverlay) popupOverlay.style.display = 'none';
            });

            const resveDaySelectEl = document.getElementById('gys-setting-resve-day-select');
            if (resveDaySelectEl) {
                resveDaySelectEl.addEventListener('change', function() {
                    saveLocalData('gys_local_env_resve_day', this.value);
                    alert(`예약일이 매월 ${this.value}일로 설정되었습니다. (페이지를 새로고침하면 시계 노출 여부에 반영됩니다)`);
                });
            }

            document.getElementById('gys-capture-btn').addEventListener('click', () => {
                capturePanelToPng();
            });

            document.getElementById('gys-refresh-res-btn').addEventListener('click', async () => {
                const isLoggedIn = await checkTabSessionStatus(false);
                if (!isLoggedIn) {
                    alert('로그인이 필요한 서비스입니다.');
                    return;
                }

                await refreshUserReservationsAsync();
                alert('예약현황이 새로고침되었습니다.');
            });

            async function updateProgramSelectOptions(targetDate, isManualClick = false) {
                if (!win.ISLOGIN && isManualClick) { alert('로그인이 필요한 서비스입니다.'); handleLoginRedirect(); return; }
                const selectEl = document.getElementById('gys-program-select');
                if (!selectEl) return;
                const currentVal = selectEl.value || loadLocalData('gys_local_env_program_cd');
                const listToUse = (await fetchItemList(targetDate)) || PROGRAM_LIST_DEFAULT;

                const fragment = document.createDocumentFragment();
                listToUse.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.item_cd || p.item_code;
                    option.textContent = formatProgramName(p.item_nm || p.item_name) + (p.sale_amt !== undefined ? ` (${p.sale_amt.toLocaleString()}원)` : '');
                    if (option.value === currentVal) option.selected = true;
                    fragment.appendChild(option);
                });
                selectEl.replaceChildren(fragment);
            }

            async function updateTimeSelectOptions(targetDate) {
                const selectEl = document.getElementById('gys-time-select');
                if (!selectEl) return;
                const currentVal = selectEl.value || loadLocalData('gys_local_env_resve_time_seq');
                const timeData = await fetchTimeSlots(targetDate);

                const fragment = document.createDocumentFragment();
                if (Array.isArray(timeData) && timeData.length > 0) {
                    timeData.forEach(item => {
                        const option = document.createElement('option');
                        option.value = item.seq; option.textContent = `${item.time_nm} | ${item.timep}`;
                        if (String(item.seq) === String(currentVal)) option.selected = true;
                        fragment.appendChild(option);
                    });
                } else {
                    const emptyOpt = document.createElement('option'); emptyOpt.value = ""; emptyOpt.textContent = "조회된 시간대 없음";
                    fragment.appendChild(emptyOpt);
                }
                selectEl.replaceChildren(fragment);
            }

            async function updateAllOptions(targetDate, isManualClick) {
                const formattedHyphen = targetDate.includes('-') ? targetDate : `${targetDate.substring(0, 4)}-${targetDate.substring(4, 6)}-${targetDate.substring(6, 8)}`;
                document.getElementById('gys-base-date-label').textContent = formatMMDD(formattedHyphen);
                document.getElementById('gys-base-date-input').value = formattedHyphen;
                await Promise.all([updateTimeSelectOptions(targetDate), updateProgramSelectOptions(targetDate, isManualClick)]);
            }

            async function loadDateList() {
                const ymBtn = document.getElementById('gys-ym-reload-btn');
                let ymValue = parseYMFromDot(ymBtn.textContent.trim());

                if (!ymValue || ymValue.length !== 6) { ymValue = defaultYM; ymBtn.textContent = formatYMWithDot(ymValue); }

                const btnContainer = document.getElementById('gys-date-buttons-container');
                btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #274081; text-align: center; padding: 15px 0;">날짜 데이터 로딩 중...</div>';

                const monthData = await fetchMonthStateList(ymValue);
                if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
                    btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #d9534f; text-align: center; padding: 15px 0;">조회된 날짜 데이터가 없습니다.</div>';
                    scrollToPanelTop(); return;
                }

                const curYear = parseInt(ymValue.substring(0, 4), 10);
                const curMonth = parseInt(ymValue.substring(4, 6), 10) - 1;
                const startDayOfWeek = new Date(curYear, curMonth, 1).getDay();
                const currentMonthItems = monthData.filter(item => {
                    const parts = item.date.split('-');
                    return parseInt(parts[0], 10) === curYear && parseInt(parts[1], 10) === (curMonth + 1);
                });

                let firstWorkDateHyphen = currentMonthItems.find(item => {
                    const dayOfWeek = new Date(item.date).getDay();
                    const hasClose = item.close_advice && item.close_advice.trim() !== '';
                    const stateText = hasClose ? item.close_advice.trim() : (item.state_nm || '');
                    return !(dayOfWeek === 2 || hasClose || item.state_cd === "30" || stateText.includes('휴관') || stateText.includes('대회'));
                })?.date || currentMonthItems[0]?.date || "";

                if (firstWorkDateHyphen) {
                    await updateAllOptions(firstWorkDateHyphen, false);
                }

                btnContainer.innerHTML = '';
                const prevMonthLastDay = new Date(curYear, curMonth, 0).getDate();
                for (let i = startDayOfWeek - 1; i >= 0; i--) {
                    const prevBtn = document.createElement('button');
                    prevBtn.disabled = true;
                    prevBtn.innerHTML = '<div style="font-size: 14.5px; font-weight: bold; color: #ced4da; text-align: center; line-height: 1.0;">' + (prevMonthLastDay - i) + '</div>';
                    Object.assign(prevBtn.style, {
                        height: '80px', backgroundColor: '#f8f9fa', borderRadius: '0px', border: 'none',
                        boxSizing: 'border-box', cursor: 'not-allowed', width: '100%', padding: '3px 0 0 0', userSelect: 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start'
                    });
                    btnContainer.appendChild(prevBtn);
                }

                currentMonthItems.forEach(function(item) {
                    const rawDate = item.date;
                    const dayNum = parseInt(rawDate.split('-')[2], 10);
                    const formattedResveDate = rawDate.replace(/-/g, '');
                    const dayOfWeek = new Date(rawDate).getDay();

                    let textColor = '#333333';
                    if (dayOfWeek === 0) textColor = '#d9534f';
                    if (dayOfWeek === 6) textColor = '#0275d8';

                    const hasCloseAdvice = item.close_advice && item.close_advice.trim() !== '';
                    const rawStateText = hasCloseAdvice ? item.close_advice.trim() : (item.state_nm || '');
                    const isHolidayReason = (item.state_cd === "30" || hasCloseAdvice);

                    if (isHolidayReason) {
                        const closedBtn = document.createElement('button');
                        closedBtn.disabled = true;

                        const holidayLabel = rawStateText;

                        closedBtn.innerHTML = '' +
                            '<div style="font-size: 14.5px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1.0; pointer-events: none;">' + dayNum + '</div>' +
                            '<div style="flex: 1; display: flex; align-items: flex-end; justify-content: center; width: 100%; pointer-events: none; padding-bottom: 7px;">' +
                                (holidayLabel ?
                                    '<span class="gys-holiday-text" style="' +
                                        'width: 100%; font-size: 10px; color: #d9534f; font-weight: bold; line-height: 1.15; ' +
                                        'text-align: center; word-break: keep-all; overflow-wrap: anywhere; white-space: normal; ' +
                                        'overflow: hidden; pointer-events: none;' +
                                    '">' + holidayLabel + '</span>'
                                    : '') +
                            '</div>';

                        Object.assign(closedBtn.style, {
                            height: '80px', backgroundColor: '#f8f9fa', borderRadius: '0px', border: 'none',
                            boxSizing: 'border-box', cursor: 'not-allowed', width: '100%', padding: '3px 0 0 0', userSelect: 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center'
                        });

                        btnContainer.appendChild(closedBtn);
                        return;
                    }

                    const dateBtn = document.createElement('button');
                    dateBtn.className = 'gys-dynamic-date-btn';
                    dateBtn.dataset.resveDate = formattedResveDate;

                    dateBtn.innerHTML = '' +
                        '<div class="gys-day-number" style="font-size: 14.5px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1.0; pointer-events: none; padding-top: 3px;">' + dayNum + '</div>' +
                        '<div class="gys-info-badge" style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; pointer-events: none; overflow: hidden; padding-bottom: 1px;"></div>';

                    Object.assign(dateBtn.style, {
                        height: '80px', backgroundColor: '#ffffff', border: 'none', borderRadius: '0px',
                        cursor: 'pointer', boxSizing: 'border-box', transition: 'all 0.15s', width: '100%', padding: '0',
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch'
                    });

                    dateBtn.onmouseover = () => { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#e8f4ff'; };
                    dateBtn.onmouseout = () => { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#ffffff'; };

                    let pressTimer = null;
                    let isLongPress = false;

                    const startLongPressCheck = (e) => {
                        if (formattedResveDate < getTodayYMD()) return;
                        isLongPress = false;
                        pressTimer = setTimeout(() => {
                            isLongPress = true;
                            const reservationsMap = getSessionReservationsMap();
                            const resObj = reservationsMap[formattedResveDate];

                            if (!resObj || resObj.type !== 'server' || !resObj.data) {
                                alert('해당 날짜에 연동된 서버 예약 정보가 없습니다.');
                                return;
                            }

                            const d = resObj.data;
                            const slipNo = d.slip_no || '';
                            const comcd = d.comcd || 'GYS10';
                            const resveNo = d.entr_res_idx || '';
                            const requestNo = d.req_no !== undefined ? d.req_no : 0;
                            const timeIdx = d.res_time_idx || 1;
                            const useDate = d.use_date || '';
                            const timeName = d.time_name || '';

                            if (!resveNo || !slipNo) {
                                alert('환불에 필요한 상세 예약 번호가 누락되었습니다.');
                                return;
                            }

                            if (confirm(`${useDate} : ${timeName}\n환불 신청 하시겠습니까?`)) {
                                const refundUrl = `/fmcs/122?slip_no=${slipNo}&comcd=${comcd}&resve_no=${resveNo}&request_no=${requestNo}&action=refund&time_idx=${timeIdx}`;
                                openRefundInNewTab(refundUrl);
                            }
                        }, 700);
                    };

                    const cancelLongPressCheck = () => {
                        if (pressTimer) {
                            clearTimeout(pressTimer);
                            pressTimer = null;
                        }
                    };

                    dateBtn.addEventListener('mousedown', startLongPressCheck);
                    dateBtn.addEventListener('mouseup', cancelLongPressCheck);
                    dateBtn.addEventListener('mouseleave', cancelLongPressCheck);

                    dateBtn.addEventListener('touchstart', startLongPressCheck, { passive: true });
                    dateBtn.addEventListener('touchend', cancelLongPressCheck);
                    dateBtn.addEventListener('touchcancel', cancelLongPressCheck);

                    dateBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (isLongPress) {
                            e.preventDefault();
                            return;
                        }
                        if (formattedResveDate < getTodayYMD()) return;

                        const timeSelectEl = document.getElementById('gys-time-select');
                        const programSelectEl = document.getElementById('gys-program-select');

                        let selectedTimeSeq = timeSelectEl.value;
                        let selectedProgramCode = programSelectEl.value;

                        if (!selectedTimeSeq && timeSelectEl.options.length > 0 && timeSelectEl.options[0].value) {
                            timeSelectEl.selectedIndex = 0;
                            selectedTimeSeq = timeSelectEl.value;
                        }
                        if (!selectedProgramCode && programSelectEl.options.length > 0 && programSelectEl.options[0].value) {
                            programSelectEl.selectedIndex = 0;
                            selectedProgramCode = programSelectEl.value;
                        }

                        const selectedTimeText = timeSelectEl.options[timeSelectEl.selectedIndex]?.textContent || '';

                        if (!selectedTimeSeq || !selectedProgramCode) { alert('로그인이 필요한 서비스입니다.'); return; }

                        dateBtn.disabled = true;
                        if (await custom_set_ticket_resve(formattedResveDate, selectedTimeSeq, selectedProgramCode, false)) {
                            let reservationsMap = getSessionReservationsMap();
                            reservationsMap[formattedResveDate] = { type: 'manual', time_name: selectedTimeText };
                            setSessionReservationsMap(reservationsMap);
                            renderReservationStatusMap();
                        } else {
                            dateBtn.style.backgroundColor = '#f8d7da';
                        }
                        dateBtn.disabled = false;
                    });
                    btnContainer.appendChild(dateBtn);
                });

                const totalCellsSoFar = startDayOfWeek + currentMonthItems.length;
                const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
                for (let nextDayNum = 1; nextDayNum <= remainingCells; nextDayNum++) {
                    const nextBtn = document.createElement('button');
                    nextBtn.disabled = true;
                    nextBtn.innerHTML = '<div style="font-size: 14.5px; font-weight: bold; color: #ced4da; text-align: center; line-height: 1.0;">' + nextDayNum + '</div>';

                    Object.assign(nextBtn.style, {
                        height: '80px', backgroundColor: '#f8f9fa', borderRadius: '0px', border: 'none',
                        boxSizing: 'border-box', cursor: 'not-allowed', width: '100%', padding: '3px 0 0 0', userSelect: 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start'
                    });
                    btnContainer.appendChild(nextBtn);
                }

                renderReservationStatusMap();
                scrollToPanelTop();
            }

            const ymBtn = document.getElementById('gys-ym-reload-btn');
            ymBtn.addEventListener('click', loadDateList);

            document.getElementById('gys-user-name-btn').addEventListener('click', () => {
                if (cachedMemberInfo.name && win.ISLOGIN) {
                    if (confirm(`[${cachedMemberInfo.name}] 님 로그아웃 하시겠습니까?`)) {
                        clearSessionReservationsMap();
                        window.location.href = "/fmcs/31?action=logout_force&login_check=skip&referer=/fmcs/27?referer=/fmcs/102";
                    }
                } else {
                    handleLoginRedirect();
                }
            });

            const baseDateBtn = document.getElementById('gys-base-date-btn');
            const baseDateInput = document.getElementById('gys-base-date-input');
            baseDateBtn.addEventListener('click', () => { if (typeof baseDateInput.showPicker === 'function') baseDateInput.showPicker(); else baseDateInput.click(); });
            baseDateInput.addEventListener('change', function() { updateAllOptions(this.value, false); scrollToPanelTop(); });

            document.getElementById('gys-prev-month-btn').addEventListener('click', () => { ymBtn.textContent = formatYMWithDot(addMonthsToYM(parseYMFromDot(ymBtn.textContent.trim()), -1)); loadDateList(); });
            document.getElementById('gys-next-month-btn').addEventListener('click', () => { ymBtn.textContent = formatYMWithDot(addMonthsToYM(parseYMFromDot(ymBtn.textContent.trim()), 1)); loadDateList(); });

            await loadDateList();

            if (win.ISLOGIN) {
                refreshUserReservationsAsync().catch(e => {});
            }
        }

        window.addEventListener('load', async () => {
            const timeSeq = urlParams.get('time_seq');
            const programCd = urlParams.get('program_cd') || "I000221";
            const resveDateParam = urlParams.get('resve_date');

            if (resveDateParam && timeSeq) {
                if (!(await checkTabSessionStatus(false))) { handleLoginRedirect(true); return; }
                await custom_set_ticket_resve(resveDateParam, timeSeq, programCd, true);
            } else if (Array.from(urlParams.keys()).length === 0) {
                createCustomPanel();
            }
        });
    }
})();