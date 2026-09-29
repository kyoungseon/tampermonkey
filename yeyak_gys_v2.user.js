// ==UserScript==
// @name         고양도시관리공사 성저파크골프장 Quick 예약도우미 V2
// @namespace    http://tampermonkey.net/
// @version      0.5.13
// @description  최초 달력 로딩 시 다음 달 기본 조회 및 텍스트 파싱 안정화 버전
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

    const USER_LIST = [
        { mem_no: '315219', mem_nm: '김균배' },
        { mem_no: '336812', mem_nm: '김소라' },
        { mem_no: '404058', mem_nm: '임경선' }
    ];

    function getUserNameByMemNo(memNo) {
        if (!memNo) return '';
        const targetMemNo = String(memNo).trim();
        const foundUser = USER_LIST.find(user => String(user.mem_no).trim() === targetMemNo);
        return foundUser ? foundUser.mem_nm : '';
    }

    const safeSession = {
        get: function(key) {
            try { return win.sessionStorage.getItem(key); } catch (e) { return null; }
        },
        set: function(key, val) {
            try { win.sessionStorage.setItem(key, val); } catch (e) {}
        },
        remove: function(key) {
            try { win.sessionStorage.removeItem(key); } catch (e) {}
        }
    };

    const safeLocal = {
        get: function(key) {
            try { return win.localStorage.getItem(key); } catch (e) { return null; }
        },
        set: function(key, val) {
            try { win.localStorage.setItem(key, val); } catch (e) {}
        }
    };

    function getLocalClickReservations() {
        const jsonStr = safeSession.get('gys_click_reservations');
        if (!jsonStr) return {};
        try { 
            const parsed = JSON.parse(jsonStr);
            return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
        } catch (e) { 
            return {}; 
        }
    }

    function addLocalClickReservation(pureDate, timeLabel) {
        const list = getLocalClickReservations();
        if (!list[pureDate]) {
            list[pureDate] = [];
        }
        if (!list[pureDate].includes(timeLabel)) {
            list[pureDate].push(timeLabel);
        }
        safeSession.set('gys_click_reservations', JSON.stringify(list));
    }

    function clearLocalClickReservations() {
        safeSession.remove('gys_click_reservations');
    }

    // 텍스트 파싱: 부제(동절기 1부, 1부 등)와 시간대 추출 정돈
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

        let startTime = '';
        let endTime = '';

        if (timeRange && timeRange.includes('~')) {
            const tParts = timeRange.split('~');
            startTime = tParts[0].trim();
            endTime = tParts[1].trim();
        } else {
            startTime = timeRange || cleanText;
        }

        return { part: partName, startTime, endTime };
    }

    function extractStartTime(text) {
        if (!text) return '99:99';
        const match = text.match(/(\d{2}:\d{2})/);
        return match ? match[1] : '99:99';
    }

    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    const isFromPanelParam = urlParams.get('from_panel') === 'true';

    function formatProgramName(name) {
        if (!name) return '';
        return name.replace(/^온라인\s*/, '');
    }

    function getTodayYMD() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return '' + yyyy + mm + dd;
    }

    function getTodayYMDHyphen() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function getFormattedYMDHM() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        return `${yyyy}${mm}${dd}${hh}${mi}`;
    }

    function formatMMDD(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[1]}-${parts[2]}`;
        }
        if (dateStr.length === 8) {
            return `${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
        return dateStr;
    }

    function getCurrentYM() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        return '' + yyyy + mm;
    }

    function addMonthsToYM(ymStr, offset) {
        if (!ymStr || ymStr.length !== 6) return ymStr;
        const year = parseInt(ymStr.substring(0, 4), 10);
        const month = parseInt(ymStr.substring(4, 6), 10) - 1;
        const targetDate = new Date(year, month + offset, 1);
        return '' + targetDate.getFullYear() + String(targetDate.getMonth() + 1).padStart(2, '0');
    }

    function formatYMWithDot(ymStr) {
        if (!ymStr || ymStr.length !== 6) return ymStr;
        return ymStr.substring(0, 4) + '.' + ymStr.substring(4, 6);
    }

    function parseYMFromDot(ymDotStr) {
        if (!ymDotStr) return getCurrentYM();
        return ymDotStr.replace(/\./g, '');
    }

    function getValidTargetDate(dateStr) {
        const pureDate = (dateStr || '').replace(/-/g, '');
        if (!pureDate) return getTodayYMD();
        return pureDate;
    }

    function getLoggedInUserName() {
        const currentMemNo = typeof win.MEM_NO !== 'undefined' ? win.MEM_NO : '';
        const mappedName = getUserNameByMemNo(currentMemNo);
        if (mappedName) {
            return mappedName;
        }
        if (typeof win.MEMBER_NAME !== 'undefined' && win.MEMBER_NAME) {
            return String(win.MEMBER_NAME).trim();
        }
        if (typeof win.MEM_NM !== 'undefined' && win.MEM_NM) {
            return String(win.MEM_NM).trim();
        }
        const userEl = document.querySelector('.user-info, .login_name, .mem_name, .user_name');
        if (userEl && userEl.textContent) {
            return userEl.textContent.replace(/님|반갑습니다|로그아웃/g, '').trim();
        }
        return '';
    }

    function loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            if (win.html2canvas) {
                resolve(win.html2canvas);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = () => resolve(win.html2canvas);
            script.onerror = () => reject(new Error('html2canvas 로드 실패'));
            document.head.appendChild(script);
        });
    }

    async function capturePanelToPng() {
        const panel = document.getElementById('gys-custom-panel');
        if (!panel) {
            alert('캡처할 패널을 찾을 수 없습니다.');
            return;
        }

        try {
            const h2c = await loadHtml2Canvas();

            const canvas = await h2c(panel, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
                onclone: (clonedDoc) => {
                    const btnTexts = clonedDoc.querySelectorAll('#gys-user-name-btn, #gys-status-toggle-btn');
                    btnTexts.forEach(btn => {
                        btn.style.display = 'inline-flex';
                        btn.style.alignItems = 'center';
                        btn.style.justifyContent = 'center';
                        btn.style.transform = 'translateY(-1px)';
                    });

                    const holidaySpans = clonedDoc.querySelectorAll('.gys-holiday-text');
                    holidaySpans.forEach(span => {
                        span.style.transform = 'translateY(-1px)';
                    });
                }
            });

            const ymBtn = document.getElementById('gys-ym-reload-btn');
            const selectedYM = ymBtn ? parseYMFromDot(ymBtn.textContent.trim()) : getCurrentYM();
            const userName = getLoggedInUserName() || '미로그인';
            const currentYMDHM = getFormattedYMDHM();

            const fileName = `${selectedYM}_${userName}_${currentYMDHM}.png`;

            const executeDownload = (blob) => {
                const a = document.createElement('a');
                a.download = fileName;
                a.href = URL.createObjectURL(blob);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            };

            canvas.toBlob(async function(blob) {
                if (!blob) {
                    alert('이미지 생성에 실패했습니다.');
                    return;
                }

                let shareSuccess = false;
                try {
                    if (navigator.share && navigator.canShare) {
                        const file = new File([blob], fileName, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: '성저파크골프장 예약 스크린샷',
                                text: `[${userName}] 성저파크골프장 Quick 예약 현황`
                            });
                            shareSuccess = true;
                        }
                    }
                } catch (shareErr) {
                    console.warn('[Quick] 시스템 공유 취소 또는 미지원 브라우저:', shareErr);
                }

                if (!shareSuccess) {
                    executeDownload(blob);
                }
            }, 'image/png');

        } catch (err) {
            console.error('[Quick] 스크린샷 캡처 중 오류 발생:', err);
            alert('스크린샷 생성 중 오류가 발생했습니다.');
        }
    }

    if (actionParam) {
        const isQuickAutoTab = isFromPanelParam || safeSession.get('gys_quick_auto') === 'true';

        if (actionParam === 'paymentResult') {
            if (isQuickAutoTab) {
                try { if (win.opener) win.opener = null; } catch (e) {}
                win.alert = function(msg) {
                    safeSession.remove('gys_quick_auto');
                    const isConfirmed = confirm("🎉 예약 및 결제가 정상 완료되었습니다!\n\n현재 탭을 닫으시겠습니까?");
                    if (isConfirmed) win.close();
                    else win.stop && win.stop();
                };
            }
            return;
        }

        if (actionParam === 'reg_read') {
            if (isQuickAutoTab) {
                safeSession.remove('gys_quick_auto');
                function handleRegReadConfirm() {
                    setTimeout(function() {
                        const isConfirmed = confirm("🎉 예약 및 결제가 정상 완료되었습니다!\n\n현재 탭을 닫으시겠습니까?");
                        if (isConfirmed) win.close();
                    }, 350);
                }
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleRegReadConfirm);
                else handleRegReadConfirm();
            }
            return;
        }

        if (actionParam === 'write') {
            if (isFromPanelParam) safeSession.set('gys_quick_auto', 'true');
            if (isQuickAutoTab) {
                function handlePaymentAutoClick() {
                    setTimeout(function() {
                        const refundCheckbox = document.querySelector('input[name="agree_refund"]');
                        if (refundCheckbox && !refundCheckbox.checked) {
                            refundCheckbox.checked = true;
                            refundCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                            refundCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                        }
                        const applyPayBtn = document.getElementById('apply_payment');
                        if (applyPayBtn) applyPayBtn.click();
                    }, 400);
                }
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handlePaymentAutoClick);
                else handlePaymentAutoClick();
            }
            return;
        }
        return;
    }

    if (currentPath === '/fmcs/27') {
        const rawReferer = urlParams.get('referer');
        const decodedReferer = rawReferer ? decodeURIComponent(rawReferer) : '';

        if (decodedReferer.indexOf('autologin=true') !== -1 || decodedReferer.indexOf('/fmcs/102') !== -1) {
            window.addEventListener('load', function() {
                const userIdInput = document.getElementById('userId');
                if (userIdInput) {
                    const rect = userIdInput.getBoundingClientRect();
                    const absoluteTop = rect.top + window.pageYOffset;
                    const middleOffset = absoluteTop - (window.innerHeight / 2) + (rect.height / 2);

                    window.scrollTo({ top: middleOffset, behavior: 'instant' });
                    userIdInput.focus({ preventScroll: true });
                    userIdInput.click();
                }
            });
        }
    }
    else if (currentPath === '/fmcs/102') {

        function handleAutoLoginRedirect() {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('autologin', 'true');
            const targetReferer = encodeURIComponent(currentUrl.toString());
            window.location.href = '/fmcs/27?referer=' + targetReferer;
            return true;
        }

        function handleLoginRedirect() {
            const currentUrl = new URL(window.location.href);
            const targetReferer = encodeURIComponent(currentUrl.toString());
            window.location.href = '/fmcs/27?referer=' + targetReferer;
            return true;
        }

        function updateUserNameBtnLabel() {
            const userNameBtn = document.getElementById('gys-user-name-btn');
            if (!userNameBtn) return;
            const userName = getLoggedInUserName();
            if (userName && win.ISLOGIN) {
                userNameBtn.innerHTML = `👤 <span style="color: #1969c5; line-height: 1.0;">${userName}</span>`;
                userNameBtn.title = "클릭 시 로그아웃 후 자동로그인";
            } else {
                userNameBtn.innerHTML = `🔑 로그인`;
                userNameBtn.title = "클릭 시 로그인 페이지 이동";
            }
        }

        async function checkTabSessionStatus() {
            const targetUrl = '/rest/common/memNoSearch?_=' + Date.now();
            try {
                const response = await fetch(targetUrl, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'include'
                });
                if (response.ok) {
                    const resData = await response.json();
                    if (resData && String(resData).trim() !== '' && String(resData) !== 'null') {
                        win.MEM_NO = resData;
                        win.ISLOGIN = true;
                        updateUserNameBtnLabel();
                        return true;
                    }
                }
            } catch (err) {}
            
            win.MEM_NO = '';
            win.ISLOGIN = false;
            updateUserNameBtnLabel();
            return false;
        }

        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') checkTabSessionStatus();
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
            form.method = 'GET';
            form.action = url.split('?')[0];
            form.target = '_blank';

            const queryString = url.split('?')[1];
            if (queryString) {
                const params = new URLSearchParams(queryString);
                params.forEach(function(value, key) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = value;
                    form.appendChild(input);
                });
            }

            const panelParamInput = document.createElement('input');
            panelParamInput.type = 'hidden';
            panelParamInput.name = 'from_panel';
            panelParamInput.value = 'true';
            form.appendChild(panelParamInput);

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
        }

        function custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink, retryCount) {
            if (typeof isAutoLink === 'undefined') isAutoLink = false;
            if (typeof retryCount === 'undefined') retryCount = 0;

            if (time_seq) safeLocal.set('gys_saved_time_seq', time_seq);
            if (program_code) safeLocal.set('gys_saved_program_cd', program_code);

            return new Promise(function(resolve) {
                var company_cd = "GYS10";
                var target_program_code = program_code || "I000221";

                if (typeof win.ISLOGIN !== 'undefined' && !win.ISLOGIN) {
                    alert('로그인이 필요합니다.');
                    if(isAutoLink) handleAutoLoginRedirect();
                    else handleLoginRedirect();
                    resolve(false);
                    return;
                }

                var member_number = typeof win.MEM_NO !== 'undefined' ? win.MEM_NO : '';
                var targetApiUrl = "/rest/dailyuse/set_ticket_resve?company_code=" + company_cd +
                                   "&program_code=" + target_program_code +
                                   "&part_code=03" +
                                   "&resve_date=" + resve_date +
                                   "&time_seq=" + time_seq +
                                   "&mem_no=" + member_number +
                                   "&user_cnt=1&_=" + Date.now();

                function handleSuccessResponse(data) {
                    var result_cd = data.result_code;

                    if (result_cd != 0 && retryCount < 2) {
                        setTimeout(function() {
                            custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink, retryCount + 1).then(resolve);
                        }, 300);
                        return;
                    }

                    if (result_cd != 0) {
                        alert(data.result_message || '예약에 실패했습니다.');
                        resolve(false);
                        return;
                    }

                    var targetUrl = '/fmcs/102?action=write&comcd=' + company_cd + '&resve_no=' + data.r_num + '&from_panel=true';

                    if (isAutoLink) {
                        window.location.href = targetUrl;
                    } else {
                        openPaymentInNewTab(targetUrl);
                    }

                    resolve(true);
                }

                function handleErrorResponse() {
                    if (retryCount < 2) {
                        setTimeout(function() {
                            custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink, retryCount + 1).then(resolve);
                        }, 300);
                    } else {
                        alert('예약 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
                        resolve(false);
                    }
                }

                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: win.location.origin + targetApiUrl,
                        headers: { "X-Requested-With": "XMLHttpRequest" },
                        onload: function(response) {
                            try {
                                var data = JSON.parse(response.responseText);
                                handleSuccessResponse(data);
                            } catch (e) { handleErrorResponse(); }
                        },
                        onerror: handleErrorResponse
                    });
                } else {
                    fetch(targetApiUrl, {
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        credentials: 'include'
                    }).then(res => res.json()).then(handleSuccessResponse).catch(handleErrorResponse);
                }
            });
        }

        async function fetchMonthStateList(yearMonth) {
            const url = '/rest/dailyuse/mon_state_list?company_code=GYS10&part_code=03&resve_mon=' + yearMonth + '&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                return await res.json();
            } catch (err) { return null; }
        }

        async function fetchTimeSlots(targetDate) {
            const validDate = getValidTargetDate(targetDate);
            const url = '/rest/dailyuse/time_state_list?company_code=GYS10&part_code=03&resve_mon=' + validDate + '&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                return await res.json();
            } catch (err) { return null; }
        }

        async function fetchItemList(targetDate) {
            const isLogged = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;
            const memNo = (typeof win.MEM_NO !== 'undefined') ? win.MEM_NO : '';

            if (!isLogged || !memNo) return null;

            const validDate = getValidTargetDate(targetDate);
            const url = '/rest/dailyuse/item_list?company_code=GYS10&resve_part_code=03&resve_date=' + validDate + '&member_code=' + memNo + '&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) return data;
            } catch (err) {}
            return null;
        }

        async function fetchUserReservations() {
            const isLogged = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;
            const memNo = (typeof win.MEM_NO !== 'undefined') ? win.MEM_NO : '';

            if (!isLogged || !memNo) return null;

            const url = '/rest/dailyuse/use_list?company_code=&member_code=' + memNo + '&status_code=1&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                return await res.json();
            } catch (err) { return null; }
        }

        function scrollToPanelTop() {
            const panel = document.getElementById('gys-custom-panel');
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            const offsetTop = window.pageYOffset + rect.top - 7;
            window.scrollTo({ top: Math.max(0, offsetTop), behavior: 'smooth' });
        }

        function initRealtimeClock() {
            const clockEl = document.getElementById('gys-realtime-clock');
            const gaugeBarEl = document.getElementById('gys-ms-gauge-bar');
            if (!clockEl || !gaugeBarEl) return;

            const startReqTime = Date.now();
            fetch(window.location.href, { method: 'HEAD', cache: 'no-cache' }).then(response => {
                const serverDateHeader = response.headers.get('date');
                if (serverDateHeader) {
                    const serverTime = new Date(serverDateHeader).getTime();
                    const endReqTime = Date.now();
                    serverTimeOffsetMs = (serverTime + Math.floor((endReqTime - startReqTime) / 2)) - endReqTime;
                }
            }).catch(() => {});

            function renderClockAndGauge() {
                const now = new Date(Date.now() + serverTimeOffsetMs);
                const hh = String(now.getHours()).padStart(2, '0');
                const mi = String(now.getMinutes()).padStart(2, '0');
                const ss = String(now.getSeconds()).padStart(2, '0');
                const ms = now.getMilliseconds();

                clockEl.textContent = `${hh}:${mi}:${ss}`;
                gaugeBarEl.style.width = `${(ms / 1000) * 100}%`;
                requestAnimationFrame(renderClockAndGauge);
            }
            requestAnimationFrame(renderClockAndGauge);
        }

        function applyResponsiveStyles() {
            if (document.getElementById('gys-responsive-style')) return;
            const style = document.createElement('style');
            style.id = 'gys-responsive-style';
            style.textContent = '' +
                '#gys-custom-panel {' +
                    'position: static !important; margin: 12px 0 130px 0 !important;' +
                    'width: 100% !important; max-width: 100% !important; box-sizing: border-box !important;' +
                '}' +
                '/* 우측 하단 챗봇 버튼 및 프레임 완벽 숨김 */' +
                'div[class*="chatbot"], div[id*="chatbot"], div[class*="happyment"], div[id*="happyment"], iframe[src*="chatbot"] {' +
                    'display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;' +
                '}' +
                '@media (min-width: 769px) {' +
                    '#gys-pc-layout-wrapper {' +
                        'display: flex !important; justify-content: center !important;' +
                        'align-items: flex-start !important; gap: 20px !important;' +
                        'margin: 0 auto !important; width: fit-content !important; max-width: 100% !important;' +
                    '}' +
                    'div.reservation.empty.pdtb, #resveList { float: none !important; margin: 0 !important; }' +
                    '#gys-custom-panel {' +
                        'position: static !important; width: 420px !important; margin-top: 80px !important;' +
                        'margin-left: 0 !important; margin-right: 0 !important; margin-bottom: 0 !important;' +
                        'box-sizing: border-box !important; flex-shrink: 0 !important; z-index: 999 !important;' +
                    '}' +
                '}';
            document.head.appendChild(style);
        }

        async function createCustomPanel() {
            if (document.getElementById('gys-custom-panel')) return;

            clearLocalClickReservations();

            applyResponsiveStyles();

            const currentYM = getCurrentYM();
            const defaultYM = addMonthsToYM(currentYM, 1); // 최초 로딩 시 다음 달(+1달) 기본 지정
            const defaultYMDot = formatYMWithDot(defaultYM);
            const todayHyphen = getTodayYMDHyphen();
            const todayMMDD = formatMMDD(todayHyphen);
            const userName = getLoggedInUserName();

            const userNameBtnLabel = (userName && win.ISLOGIN)
                ? `👤 <span style="color: #1969c5; line-height: 1.0;">${userName}</span>`
                : `🔑 로그인`;

            const panel = document.createElement('div');
            panel.id = 'gys-custom-panel';

            Object.assign(panel.style, {
                backgroundColor: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: '0px',
                padding: '8px 2px',
                boxShadow: 'none',
                fontFamily: 'Malgun Gothic, sans-serif',
                boxSizing: 'border-box'
            });

            panel.innerHTML = '' +
                '<div style="display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #1969c5; padding-bottom: 6px; margin-bottom: 8px; padding-left: 2px; padding-right: 2px;">' +
                    '<span style="font-weight: bold; font-size: 17.5px; color: #1969c5; line-height: 1.1;">⛳ 성저파크골프장 Quick 예약</span>' +
                    '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px; width: 75px;">' +
                        '<div style="width: 100%; height: 4px; background-color: #e2e8f0; border-radius: 2px; overflow: hidden;">' +
                            '<div id="gys-ms-gauge-bar" style="width: 0%; height: 100%; background-color: #28a745; transition: none;"></div>' +
                        '</div>' +
                        '<span id="gys-realtime-clock" style="font-size: 14.5px; color: #0056b3; font-family: monospace; font-weight: bold; line-height: 1; letter-spacing: 0.5px;">00:00:00</span>' +
                    '</div>' +
                '</div>' +
                '<div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 10px; padding: 0 1px;">' +
                    '<div style="display: flex; gap: 2px; align-items: center; flex-shrink: 0;">' +
                        '<button id="gys-prev-month-btn" style="width: 34px; height: 35px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0;">&lt;</button>' +
                        '<button id="gys-ym-reload-btn" style="width: 74px; height: 35px; border: 1.5px solid #1969c5; border-radius: 4px; font-weight: bold; font-size: 13px; background-color: #e8f4ff; color: #1969c5; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; box-sizing: border-box; line-height: 1.0;">' + defaultYMDot + '</button>' +
                        '<button id="gys-next-month-btn" style="width: 34px; height: 35px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0;">&gt;</button>' +
                    '</div>' +
                    '<div style="display: flex; gap: 4px; align-items: center; flex-shrink: 0;">' +
                        '<button id="gys-user-name-btn" style="height: 35px; padding: 0 8px; background-color: #f8f9fa; border: 1.5px solid #1969c5; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; color: #333333; display: flex; align-items: center; justify-content: center; line-height: 1.0;">' + userNameBtnLabel + '</button>' +
                        '<button id="gys-status-toggle-btn" style="height: 35px; padding: 0 6px; background-color: #f8f9fa; border: 1.5px solid #28a745; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; color: #28a745; display: flex; align-items: center; justify-content: center; line-height: 1.0;">📋 예약현황</button>' +
                        '<button id="gys-capture-btn" style="height: 35px; width: 35px; padding: 0; background-color: #f8f9fa; border: 1.5px solid #6c757d; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">📸</button>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom: 8px; padding: 0 1px;">' +
                    '<div style="display: grid; grid-template-columns: 0.93fr 1.37fr auto; gap: 4px; align-items: center;">' +
                        '<select id="gys-time-select" style="width: 100%; height: 34px; padding: 2px 2px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11px; font-weight: bold; color: #333333; background-color: #ffffff;"><option value="">시간대 로딩 중...</option></select>' +
                        '<select id="gys-program-select" style="width: 100%; height: 34px; padding: 2px 4px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11px; font-weight: bold; color: #333333; background-color: #ffffff;"><option value="">상품 로딩 중...</option></select>' +
                        '<div style="display: flex; align-items: center; position: relative; flex-shrink: 0;">' +
                            '<input type="date" id="gys-base-date-input" value="' + todayHyphen + '" style="position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none;">' +
                            '<button id="gys-base-date-btn" title="기준일 선택 (시간표/상품)" style="height: 34px; padding: 0 8px; background-color: #ffffff; border: 1px solid #cccccc; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; color: #333333; line-height: 1.0;"><span id="gys-base-date-label">' + todayMMDD + '</span></button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 8px 0;">' +
                '<div id="gys-calendar-wrapper" style="width: 100%; box-sizing: border-box;">' +
                    '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; text-align: center; font-weight: bold; font-size: 12.5px; margin-bottom: 4px; background-color: #f1f3f5; padding: 4px 0; border-radius: 0px;">' +
                        '<span style="color: #d9534f;">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style="color: #0275d8;">토</span>' +
                    '</div>' +
                    '<div id="gys-date-buttons-container" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; width: 100%; box-sizing: border-box;"></div>' +
                '</div>';

            const targetDiv = document.querySelector('div.reservation.empty.pdtb') || document.getElementById('resveList') || document.getElementById('container');
            if (targetDiv && targetDiv.parentNode) {
                let pcWrapper = document.getElementById('gys-pc-layout-wrapper');
                if (!pcWrapper) {
                    pcWrapper = document.createElement('div');
                    pcWrapper.id = 'gys-pc-layout-wrapper';
                    targetDiv.parentNode.insertBefore(pcWrapper, targetDiv);
                    pcWrapper.appendChild(targetDiv);
                }
                pcWrapper.appendChild(panel);
            } else {
                document.body.appendChild(panel);
            }

            initRealtimeClock();

            async function updateProgramSelectOptions(targetDate, isManualClick) {
                if (typeof isManualClick === 'undefined') isManualClick = false;
                const isLogged = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;
                const memNo = (typeof win.MEM_NO !== 'undefined') ? win.MEM_NO : '';

                if ((!isLogged || !memNo) && isManualClick) {
                    alert('상품 목록을 변경/조회하려면 로그인이 필요합니다.');
                    handleLoginRedirect();
                    return;
                }

                const programSelectEl = document.getElementById('gys-program-select');
                if (!programSelectEl) return;

                const currentVal = programSelectEl.value || safeLocal.get('gys_saved_program_cd') || "I000221";
                const dynamicItems = await fetchItemList(targetDate);
                const listToUse = (dynamicItems && dynamicItems.length > 0) ? dynamicItems : PROGRAM_LIST_DEFAULT;

                const fragment = document.createDocumentFragment();
                listToUse.forEach(function(p) {
                    const option = document.createElement('option');
                    const code = p.item_cd || p.item_code;
                    const rawName = p.item_nm || p.item_name;
                    const name = formatProgramName(rawName);
                    const price = p.sale_amt !== undefined ? p.sale_amt : p.price;

                    option.value = code;
                    option.textContent = name + (price !== undefined ? ' (' + price.toLocaleString() + '원)' : '');
                    if (code === currentVal) option.selected = true;
                    fragment.appendChild(option);
                });
                programSelectEl.replaceChildren(fragment);
            }

            async function updateTimeSelectOptions(targetDate) {
                const selectEl = document.getElementById('gys-time-select');
                if (!selectEl) return;

                const currentVal = selectEl.value || safeLocal.get('gys_saved_time_seq') || "";
                const timeData = await fetchTimeSlots(targetDate);

                const fragment = document.createDocumentFragment();
                if (timeData && Array.isArray(timeData) && timeData.length > 0) {
                    timeData.forEach(function(item) {
                        const option = document.createElement('option');
                        option.value = item.seq;
                        option.textContent = item.time_nm + ' | ' + item.timep;
                        if (String(item.seq) === String(currentVal)) option.selected = true;
                        fragment.appendChild(option);
                    });
                } else {
                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = "";
                    emptyOpt.textContent = "조회된 시간대 없음";
                    fragment.appendChild(emptyOpt);
                }
                selectEl.replaceChildren(fragment);
            }

            async function updateAllOptions(targetDate, isManualClick) {
                const formattedHyphen = targetDate.includes('-')
                    ? targetDate
                    : `${targetDate.substring(0, 4)}-${targetDate.substring(4, 6)}-${targetDate.substring(6, 8)}`;

                document.getElementById('gys-base-date-label').textContent = formatMMDD(formattedHyphen);
                document.getElementById('gys-base-date-input').value = formattedHyphen;

                await Promise.all([
                    updateTimeSelectOptions(targetDate),
                    updateProgramSelectOptions(targetDate, isManualClick)
                ]);
            }

            async function applyReservationStatus() {
                const ymBtn = document.getElementById('gys-ym-reload-btn');
                if (!ymBtn) return;
                const currentCalYM = parseYMFromDot(ymBtn.textContent.trim());

                document.querySelectorAll('.gys-dynamic-date-btn .gys-info-badge').forEach(badge => {
                    badge.innerHTML = '';
                });

                const isLogged = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;
                const memNo = (typeof win.MEM_NO !== 'undefined') ? win.MEM_NO : '';
                if (!isLogged || !memNo) return;

                const resData = await fetchUserReservations();
                const reservationsByDate = {};

                if (resData && Array.isArray(resData)) {
                    resData.forEach(item => {
                        if (String(item.app_type) === "30" && item.use_date) {
                            const pureUseDate = item.use_date.replace(/-/g, '');
                            const itemYM = pureUseDate.substring(0, 6);

                            if (itemYM === currentCalYM) {
                                if (!reservationsByDate[pureUseDate]) {
                                    reservationsByDate[pureUseDate] = [];
                                }
                                if (item.time_name) {
                                    const parsedObj = parseTimeTo4Lines(item.time_name);
                                    reservationsByDate[pureUseDate].push({
                                        info: parsedObj,
                                        type: 'server',
                                        startTime: extractStartTime(parsedObj.startTime)
                                    });
                                }
                            }
                        }
                    });
                }

                const clickReservations = getLocalClickReservations();
                Object.keys(clickReservations).forEach(pureDate => {
                    if (pureDate.substring(0, 6) === currentCalYM) {
                        if (!reservationsByDate[pureDate]) {
                            reservationsByDate[pureDate] = [];
                        }
                        clickReservations[pureDate].forEach(rawTimeText => {
                            const parsedObj = parseTimeTo4Lines(rawTimeText);
                            const startTime = extractStartTime(parsedObj.startTime);

                            const existingIdx = reservationsByDate[pureDate].findIndex(r => r.startTime === startTime);

                            if (existingIdx !== -1) {
                                reservationsByDate[pureDate][existingIdx] = {
                                    info: parsedObj,
                                    type: 'manual',
                                    startTime: startTime
                                };
                            } else {
                                reservationsByDate[pureDate].push({
                                    info: parsedObj,
                                    type: 'manual',
                                    startTime: startTime
                                });
                            }
                        });
                    }
                });

                Object.keys(reservationsByDate).forEach(pureDate => {
                    reservationsByDate[pureDate].sort((a, b) => a.startTime.localeCompare(b.startTime));

                    const dateBtn = document.querySelector(`.gys-dynamic-date-btn[data-resve-date="${pureDate}"]`);
                    if (dateBtn) {
                        const infoBadge = dateBtn.querySelector('.gys-info-badge');
                        if (infoBadge) {
                            const htmlString = reservationsByDate[pureDate].map(item => {
                                const isServer = item.type === 'server';
                                
                                const bgColor = isServer ? '#2e7d32' : '#1565c0';
                                const borderColor = isServer ? '#1b5e20' : '#0d47a1';

                                return `
                                    <div style="
                                        background-color: ${bgColor};
                                        border: 1px solid ${borderColor};
                                        color: #ffffff;
                                        border-radius: 4px;
                                        padding: 4px 0;
                                        margin-top: 1px;
                                        width: 98%;
                                        box-sizing: border-box;
                                        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                                        display: flex;
                                        flex-direction: column;
                                        align-items: center;
                                        justify-content: center;
                                        line-height: 1;
                                    ">
                                        ${item.info.part ? `<span style="font-size: 11.5px; font-weight: 900; opacity: 0.98; letter-spacing: -0.3px; margin-bottom: 4px;">${item.info.part}</span>` : ''}
                                        <span style="font-size: 11px; font-weight: 800; letter-spacing: -0.3px;">${item.info.startTime}</span>
                                        ${item.info.endTime ? `<span style="font-size: 8px; font-weight: bold; opacity: 0.8; margin: -2px 0; line-height: 0.8;">~</span><span style="font-size: 11px; font-weight: 800; letter-spacing: -0.3px;">${item.info.endTime}</span>` : ''}
                                    </div>
                                `;
                            }).join('');

                            infoBadge.innerHTML = htmlString;
                        }
                    }
                });
            }

            async function loadDateList() {
                const ymBtn = document.getElementById('gys-ym-reload-btn');
                let ymValue = parseYMFromDot(ymBtn.textContent.trim());

                if (!ymValue || ymValue.length !== 6) {
                    ymValue = defaultYM;
                    ymBtn.textContent = formatYMWithDot(ymValue);
                }

                const btnContainer = document.getElementById('gys-date-buttons-container');
                btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #1969c5; text-align: center; padding: 15px 0;">날짜 데이터 로딩 중...</div>';

                const monthData = await fetchMonthStateList(ymValue);
                if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
                    btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #d9534f; text-align: center; padding: 15px 0;">조회된 날짜 데이터가 없습니다.</div>';
                    scrollToPanelTop();
                    return;
                }

                const curYear = parseInt(ymValue.substring(0, 4), 10);
                const curMonth = parseInt(ymValue.substring(4, 6), 10) - 1;
                const firstDateObj = new Date(curYear, curMonth, 1);
                const startDayOfWeek = firstDateObj.getDay();

                const currentMonthItems = monthData.filter(function(item) {
                    const parts = item.date.split('-');
                    return parseInt(parts[0], 10) === curYear && parseInt(parts[1], 10) === (curMonth + 1);
                });

                let firstWorkDateHyphen = "";
                for (let i = 0; i < currentMonthItems.length; i++) {
                    const item = currentMonthItems[i];
                    const itemDayOfWeek = new Date(item.date).getDay();

                    const hasClose = item.close_advice && item.close_advice.trim() !== '';
                    const stateText = hasClose ? item.close_advice.trim() : (item.state_nm || '');

                    const isClosed = itemDayOfWeek === 2 || hasClose || item.state_cd === "30" || stateText.indexOf('휴관') !== -1 || stateText.indexOf('대회') !== -1;
                    if (!isClosed) {
                        firstWorkDateHyphen = item.date;
                        break;
                    }
                }

                if (!firstWorkDateHyphen && currentMonthItems.length > 0) {
                    firstWorkDateHyphen = currentMonthItems[0].date;
                }

                if (firstWorkDateHyphen) {
                    await updateAllOptions(firstWorkDateHyphen, false);
                }

                btnContainer.innerHTML = '';

                const prevMonthLastDateObj = new Date(curYear, curMonth, 0);
                const prevMonthLastDay = prevMonthLastDateObj.getDate();
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
                    const isHolidayReason = item.state_cd === "30" || hasCloseAdvice || rawStateText.indexOf('휴관') !== -1 || rawStateText.indexOf('대회') !== -1;

                    if (isHolidayReason) {
                        const closedBtn = document.createElement('button');
                        closedBtn.disabled = true;

                        const holidayLabel = isHolidayReason ? rawStateText : '';

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
                    dateBtn.dataset.baseDay = '' + dayNum;
                    dateBtn.dataset.resveDate = formattedResveDate;

                    dateBtn.innerHTML = '' +
                        '<div class="gys-day-number" style="font-size: 14.5px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1.0; pointer-events: none; padding-top: 3px;">' + dayNum + '</div>' +
                        '<div class="gys-info-badge" style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; pointer-events: none; overflow: hidden; padding-bottom: 1px;"></div>';

                    Object.assign(dateBtn.style, {
                        height: '80px', backgroundColor: '#ffffff', border: 'none', borderRadius: '0px',
                        cursor: 'pointer', boxSizing: 'border-box', transition: 'all 0.15s', width: '100%', padding: '0',
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch'
                    });

                    dateBtn.onmouseover = function() { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#e8f4ff'; };
                    dateBtn.onmouseout = function() { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#ffffff'; };

                    dateBtn.addEventListener('click', async function(e) {
                        e.stopPropagation();

                        const timeSelectEl = document.getElementById('gys-time-select');
                        const selectedTimeSeq = timeSelectEl.value;
                        const selectedProgramCode = document.getElementById('gys-program-select').value;
                        const selectedTimeText = timeSelectEl.options[timeSelectEl.selectedIndex] ? timeSelectEl.options[timeSelectEl.selectedIndex].textContent : '';

                        if (!selectedTimeSeq || !selectedProgramCode) {
                            alert('시간대 및 상품을 선택해주세요.');
                            return;
                        }

                        dateBtn.disabled = true;

                        const isSuccess = await custom_set_ticket_resve(formattedResveDate, selectedTimeSeq, selectedProgramCode, false);
                        if (isSuccess) {
                            addLocalClickReservation(formattedResveDate, selectedTimeText);
                            await applyReservationStatus();
                        } else {
                            dateBtn.style.backgroundColor = '#f8d7da';
                            dateBtn.style.borderColor = '#dc3545';
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

                await checkTabSessionStatus();
                if (win.ISLOGIN && win.MEM_NO) {
                    await applyReservationStatus();
                }

                scrollToPanelTop();
            }

            const ymBtn = document.getElementById('gys-ym-reload-btn');

            ymBtn.addEventListener('click', function() {
                loadDateList();
            });

            const userNameBtn = document.getElementById('gys-user-name-btn');
            userNameBtn.addEventListener('click', function() {
                const userName = getLoggedInUserName();
                if (userName && win.ISLOGIN) {
                    const isConfirmed = confirm(`[${userName}] 님 로그아웃 하시겠습니까?`);
                    if (isConfirmed) {
                        const targetAutoLoginUrl = "/fmcs/31?action=logout_force&login_check=skip&referer=/fmcs/27?referer=/fmcs/102";
                        window.location.href = targetAutoLoginUrl;
                    }
                } else {
                    handleLoginRedirect();
                }
            });

            const statusToggleBtn = document.getElementById('gys-status-toggle-btn');
            statusToggleBtn.addEventListener('click', async function() {
                const isLoggedIn = await checkTabSessionStatus();
                if (!isLoggedIn) {
                    alert('로그인이 필요합니다. 로그인 후 이용해주세요.');
                    return;
                }

                clearLocalClickReservations();
                await applyReservationStatus();
            });

            const captureBtn = document.getElementById('gys-capture-btn');
            captureBtn.addEventListener('click', function() {
                capturePanelToPng();
            });

            const baseDateBtn = document.getElementById('gys-base-date-btn');
            const baseDateInput = document.getElementById('gys-base-date-input');

            baseDateBtn.addEventListener('click', function() {
                if (typeof baseDateInput.showPicker === 'function') {
                    baseDateInput.showPicker();
                } else {
                    baseDateInput.click();
                }
            });

            baseDateInput.addEventListener('change', function() {
                updateAllOptions(this.value, false);
                scrollToPanelTop();
            });

            document.getElementById('gys-prev-month-btn').addEventListener('click', function() {
                const pureYM = parseYMFromDot(ymBtn.textContent.trim());
                const nextYM = addMonthsToYM(pureYM, -1);
                ymBtn.textContent = formatYMWithDot(nextYM);
                loadDateList();
            });
            document.getElementById('gys-next-month-btn').addEventListener('click', function() {
                const pureYM = parseYMFromDot(ymBtn.textContent.trim());
                const nextYM = addMonthsToYM(pureYM, 1);
                ymBtn.textContent = formatYMWithDot(nextYM);
                loadDateList();
            });

            await loadDateList();
        }

        window.addEventListener('load', async function() {
            const timeSeq   = urlParams.get('time_seq');
            const programCd = urlParams.get('program_cd') || "I000221";
            const resveDateParam = urlParams.get('resve_date');

            if (resveDateParam && timeSeq) {
                const isLogged = await checkTabSessionStatus();
                if (!isLogged) {
                    handleAutoLoginRedirect();
                    return;
                }

                await custom_set_ticket_resve(resveDateParam, timeSeq, programCd, true);
            } else {
                const isPureMainPage = Array.from(urlParams.keys()).length === 0;

                if (isPureMainPage) {
                    createCustomPanel();
                }
            }
        });
    }
})();
