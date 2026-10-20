// ==UserScript==
// @name       고양도시관리공사 성저파크골프장 Quick 예약도우미 V4
// @namespace    http://tampermonkey.net/
// @version      4.2.6
// @description 고양도시관리공사 성저파크골프장 예약 페이지에서 예약 현황을 한눈에 확인하고, 빠른 예약/환불을 지원하는 도우미 스크립트입니다.
// @author       SS2225
// @match        https://yeyak.gys.or.kr/fmcs/102
// @match        https://yeyak.gys.or.kr/fmcs/102?*
// @match        https://yeyak.gys.or.kr/fmcs/122?*
// @match        https://yeyak.gys.or.kr/fmcs/27*
// @grant        window.close
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    let serverTimeOffsetMs = 0;
    let tempReservationsMap = null;
	let tempReservationNo = null;

    const LOCAL_DEFAULT_VALUES = {
        'gys_local_env_resve_day': '15',
        'gys_local_env_resve_time_seq': '',
        'gys_local_env_program_cd': 'I000221',
        'gys_local_env_mem_nm': '-'
    };

    const loadLocalData = (key) => {
        try {
            let val = win.localStorage.getItem(key);
            if (!val && LOCAL_DEFAULT_VALUES[key] !== undefined) {
                val = LOCAL_DEFAULT_VALUES[key];
                win.localStorage.setItem(key, val);
            }
            return val;
        } catch (e) { return LOCAL_DEFAULT_VALUES[key] || null; }
    };
    const saveLocalData = (key, val) => { try { win.localStorage.setItem(key, val); } catch (e) {} };
    const removeLocalData = (key) => { try { win.localStorage.removeItem(key); } catch (e) {} };

    const loadSessionData = (key) => { try { return win.sessionStorage.getItem(key); } catch (e) { return null; } };
    const saveSessionData = (key, val) => { try { win.sessionStorage.setItem(key, val); } catch (e) {} };
    const removeSessionData = (key) => { try { win.sessionStorage.removeItem(key); } catch (e) {} };

    function getLocalReservationsMap() {
        const jsonStr = loadLocalData('gys_local_reservations_map');
        if (!jsonStr) return {};
        try {
            const parsed = JSON.parse(jsonStr);
            return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
        } catch (e) { return {}; }
    }

    function setLocalReservationsMap(mapObj) {
        saveLocalData('gys_local_reservations_map', JSON.stringify(mapObj));
    }

    function getCachedMemberName(memNo) {
        if (!memNo) return null;
        try {
            const jsonStr = loadLocalData('gys_local_member_names_map');
            if (!jsonStr) return null;
            const parsed = JSON.parse(jsonStr);
            return (typeof parsed === 'object' && parsed !== null) ? parsed[memNo] : null;
        } catch (e) { return null; }
    }

    function setCachedMemberName(memNo, name) {
        if (!memNo || !name) return;
        try {
            const jsonStr = loadLocalData('gys_local_member_names_map');
            let mapObj = {};
            if (jsonStr) {
                const parsed = JSON.parse(jsonStr);
                if (typeof parsed === 'object' && parsed !== null) mapObj = parsed;
            }
            mapObj[memNo] = name;
            saveLocalData('gys_local_member_names_map', JSON.stringify(mapObj));
        } catch (e) {}
    }

    function removeCachedMemberName(memNo) {
        if (!memNo) return;
        try {
            const jsonStr = loadLocalData('gys_local_member_names_map');
            if (!jsonStr) return;
            const parsed = JSON.parse(jsonStr);
            if (typeof parsed === 'object' && parsed !== null && parsed[memNo]) {
                delete parsed[memNo];
                saveLocalData('gys_local_member_names_map', JSON.stringify(parsed));
            }
        } catch (e) {}
    }

    function removeAllLocal() {
        removeLocalData('gys_local_mem_no');
        removeLocalData('gys_local_mem_nm');
        removeLocalData('gys_local_reservations_map');
    }

    if (window.location.pathname === '/fmcs/27' || window.location.pathname.includes('/fmcs/31')) {
        removeAllLocal();
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
                    clonedDoc.querySelectorAll('.gys-status-text').forEach(span => { span.style.transform = 'translateY(-1px)'; });
                }
            });

            const ymBtn = document.getElementById('gys-ym-reload-btn');
            const selectedYM = ymBtn ? parseYMFromDot(ymBtn.textContent.trim()) : getCurrentYM();
            const currentMemName = loadLocalData('gys_local_mem_nm') || '미로그인';
            const fileName = `${selectedYM}_${currentMemName}_${getFormattedYMDHM()}.png`;

            canvas.toBlob(async (blob) => {
                if (!blob) { alert('이미지 생성에 실패했습니다.'); return; }
                let shareSuccess = false;
                try {
                    if (navigator.share && navigator.canShare) {
                        const file = new File([blob], fileName, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            await navigator.share({ files: [file], title: '성저파크골프장 예약 캡쳐', text: `[${currentMemName}] 성저파크골프장 Quick 예약 현황` });
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
        const isQuickCloseTab = isFromPanelParam || loadSessionData('gys_session_quick_close_tab') === 'true';
		if (actionParam === 'paymentResult') {
            saveLocalData('gys_local_change_resve', 'true');
            if (isQuickCloseTab) {
                try {
                    window.stop();
                } catch (e) {}

                try { win.opener = null; } catch (e) {}

                // 1. 서버 스크립트가 페이지를 이동시키거나(location.href) 
                // 다른 짓을 하지 못하도록 location 객체의 setter를 차단하거나 강제 고정
                try {
                    Object.defineProperty(win, 'location', {
                        set: function(val) { /* 페이지 이동 시도 무시 */ },
                        get: function() { return window.location; }
                    });
                } catch (e) {}

                // 2. 서버가 띄우려는 기존 alert을 무력화하고 곧바로 창 닫기 실행
                win.alert = function(msg) {
                    // 서버 경고창은 무시하고 바로 창 닫기 수행
                };

                // 3. 지연 없이 즉시 알림 후 창 닫기 시도
                setTimeout(function() {
                    alert("🎉빠른닫기🎉 예약이 정상 처리되었습니다!");
                    window.close();
                }, 10);
            }
            return;
        }
        if (actionParam === 'reg_read') {
            if (isQuickCloseTab) {
                saveLocalData('gys_local_change_resve', 'true');
                removeSessionData('gys_session_quick_close_tab');

                const isRefundPath = currentPath.includes('/fmcs/122');
                const alertMsg = isRefundPath
                    ? "🗑️ 환불이 정상 처리되었습니다!\n\n현재 탭을 닫으시겠습니까?"
                    : "🎉 예약이 정상 처리되었습니다!\n\n현재 탭을 닫으시겠습니까?";

                const handleRegReadConfirm = () => setTimeout(() => {
                    if (confirm(alertMsg)) window.close();
                }, 350);

                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleRegReadConfirm);
                else handleRegReadConfirm();
            }
            return;
        }
        if (actionParam === 'write') {
            if (isFromPanelParam) {
                try { win.opener = null; } catch (e) {}
                saveSessionData('gys_session_quick_close_tab', 'true');
                const handlePaymentAutoClick = () => {
                    let tries = 0;
                    const timer = setInterval(() => {
                        const cb = document.querySelector('input[name="agree_refund"]');
                        const payBtn = document.getElementById('apply_payment');
                        if (cb && payBtn) {
                            clearInterval(timer);
                            if (!cb.checked) {
                                cb.checked = true;
                                cb.dispatchEvent(new Event('change', { bubbles: true }));
                                cb.dispatchEvent(new Event('click', { bubbles: true }));
                            }
                            payBtn.click();
                        } else if (++tries > 25) {
                            clearInterval(timer);
                        }
                    }, 200);
                };
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handlePaymentAutoClick);
                else handlePaymentAutoClick();
            }
            return;
        }
        if (actionParam === 'refund') {
            if (isFromPanelParam) {
                try { win.opener = null; } catch (e) {}
                saveSessionData('gys_session_quick_close_tab', 'true');

				const handleRefundAutoClick = () => {
					let tries = 0;
					const timer = setInterval(() => {
						const refundForm = document.getElementById('refundForm');
						if (refundForm) {
							clearInterval(timer);
							refundForm.submit();
						} else if (++tries > 25) {
							clearInterval(timer);
						}
					}, 200);
				};
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleRefundAutoClick);
                else handleRefundAutoClick();
            }
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
            removeAllLocal();
            const currentUrl = new URL(window.location.href);
            if (isAuto) currentUrl.searchParams.set('autologin', 'true');
            window.location.href = '/fmcs/27?referer=' + encodeURIComponent(currentUrl.toString());
            return true;
        }

        function updateUserNameBtnLabel() {
            const userNameBtn = document.getElementById('gys-user-name-btn');
            if (!userNameBtn) return;
            const currentMemName = loadLocalData('gys_local_mem_nm');
            if (currentMemName && win.ISLOGIN) {
                userNameBtn.innerHTML = `👤 <span style="color: #274081; line-height: 1.0;">${currentMemName}</span>`;
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
                let memNo = (win.MEM_NO !== undefined && win.MEM_NO !== null && String(win.MEM_NO).trim() !== '') ? String(win.MEM_NO).trim() : null;

                if (!isFirstLoad && !memNo) {
                    const responseText = await fetchWithServerTime('/rest/common/memNoSearch?_=' + Date.now(), 'text');
                    memNo = (responseText && responseText.trim() !== '') ? responseText.trim() : null;
                }

                if (!memNo) {
                    resetLoginState();
                    return false;
                }

                win.ISLOGIN = true;
                win.MEM_NO = memNo;

                const cachedName = getCachedMemberName(memNo);
                if (cachedName) {
                    saveLocalData('gys_local_mem_no', memNo);
                    saveLocalData('gys_local_mem_nm', cachedName);
                    updateUserNameBtnLabel();
                    return true;
                }

                const htmlText = await fetchWithServerTime('/fmcs/221?_=' + Date.now(), 'text');
                if (htmlText) {
                    const nameMatch = htmlText.match(/<dt>([^<]+)<\/dt>/);
                    const extractedName = nameMatch ? nameMatch[1].trim() : '';

                    if (extractedName) {
                        saveLocalData('gys_local_mem_no', memNo);
                        saveLocalData('gys_local_mem_nm', extractedName);
                        setCachedMemberName(memNo, extractedName);
                        updateUserNameBtnLabel();
                        return true;
                    }
                }
                saveLocalData('gys_local_mem_no', memNo);
                saveLocalData('gys_local_mem_nm', loadLocalData('gys_local_env_mem_nm'));
                updateUserNameBtnLabel();

                return true;
            } catch (err) {}

            resetLoginState();
            return false;
        }

        function resetLoginState() {
            win.ISLOGIN = false;
            win.MEM_NO = null;
            removeAllLocal();
            updateUserNameBtnLabel();
            renderReservationStatusMap();
        }

        const fetchMonthStateList = (ym) => fetchWithServerTime(`/rest/dailyuse/mon_state_list?company_code=GYS10&part_code=03&resve_mon=${ym}&_=` + Date.now());
        const fetchTimeSlots = (targetDate) => fetchWithServerTime(`/rest/dailyuse/time_state_list?company_code=GYS10&part_code=03&resve_mon=${getValidTargetDate(targetDate)}&_=` + Date.now());
        const fetchItemList = async (targetDate) => {
            if (!win.ISLOGIN) return null;
            const data = await fetchWithServerTime(`/rest/dailyuse/item_list?company_code=GYS10&resve_part_code=03&resve_date=${getValidTargetDate(targetDate)}&member_code=&_=` + Date.now());
            return Array.isArray(data) && data.length > 0 ? data : null;
        };
        const fetchUserReservations = () => win.ISLOGIN ? fetchWithServerTime(`/rest/dailyuse/use_list?company_code=&member_code=${win.MEM_NO || ''}&status_code=1&_=` + Date.now()) : Promise.resolve(null);

        function renderReservationStatusMap() {
            const ymBtn = document.getElementById('gys-ym-reload-btn');
            if (!ymBtn) return;
            const currentCalYM = parseYMFromDot(ymBtn.textContent.trim());

            document.querySelectorAll('.gys-dynamic-date-btn').forEach(btn => {
                const infoBadge = btn.querySelector('.gys-info-badge');
                if (infoBadge) {
                    infoBadge.innerHTML = '';
                    infoBadge.removeAttribute('title');
                }
                const statusSpan = btn.querySelector('.gys-status-text');
                if (statusSpan) {
                    statusSpan.style.display = '';
                }
            });

            const reservationsByDate = getLocalReservationsMap();

            Object.keys(reservationsByDate).forEach(pureDate => {
                if (pureDate.substring(0, 6) === currentCalYM) {
                    const resObj = reservationsByDate[pureDate];
                    const dateBtn = document.querySelector(`.gys-dynamic-date-btn[data-resve-date="${pureDate}"]`);
                    if (dateBtn && resObj?.data?.time_name) {
                        const infoBadge = dateBtn.querySelector('.gys-info-badge');
                        if (infoBadge) {
                            const rawTimeName = resObj.data.time_name.replace(/<br>/g, ' ').trim();
                            infoBadge.setAttribute('title', rawTimeName);

                            const parsedObj = parseTimeTo4Lines(resObj.data.time_name);
                            const isServer = resObj.type === 'server';
                            infoBadge.innerHTML = `
                                <div style="background-color: ${isServer ? '#2e7d32' : '#1565c0'}; border: 1px solid ${isServer ? '#1b5e20' : '#0d47a1'}; color: #ffffff; border-radius: 4px; padding: 2px 1px; width: calc(100% - 6px); height: calc(100% - 6px); box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.0;">
                                    ${parsedObj.part ? `<span style="font-size: 11.5px; font-weight: 700; margin-bottom: 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${parsedObj.part}</span>` : ''}
                                    <span style="font-size: 10px; font-weight: 400; white-space: nowrap; line-height: 1.0;">${parsedObj.startTime}</span>
                                    ${parsedObj.endTime ? `<span style="font-size: 7px; font-weight: bold; opacity: 0.8; margin: 0px 0; line-height: 0.4;">~</span><span style="font-size: 10px; font-weight: 400; white-space: nowrap; line-height: 1.0;">${parsedObj.endTime}</span>` : ''}
                                </div>`;
                        }
                        const statusSpan = dateBtn.querySelector('.gys-status-text');
                        if (statusSpan) {
                            statusSpan.style.display = 'none';
                        }
                    }
                }
            });
        }

        async function refreshUserReservationsAsync() {
            removeLocalData('gys_local_reservations_map');
            const resData = await fetchUserReservations();
            let newReservationsMap = {};
            if (Array.isArray(resData)) {
                resData.forEach(item => {
                    if (String(item.app_type) === "30" && item.use_date && item.time_name) {
                        newReservationsMap[item.use_date.replace(/-/g, '')] = { type: 'server', data: item };
                    }
                });
            }
            setLocalReservationsMap(newReservationsMap);
            renderReservationStatusMap();
        }

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                const changeFlag = loadLocalData('gys_local_change_resve');
                if (changeFlag === 'true') {
                    removeLocalData('gys_local_change_resve');

                    if (typeof tempReservationsMap !== 'undefined' && tempReservationsMap && tempReservationsMap.type) {
                        let reservationsMap = getLocalReservationsMap();

                        if (tempReservationsMap.type === 'assign') {
                            reservationsMap[tempReservationsMap.resve_date] = {
                                type: 'manual',
                                data: { time_name: tempReservationsMap.time_name, use_date: tempReservationsMap.use_date, entr_res_idx: tempReservationsMap.r_num }
                            };
                        } else {
                            delete reservationsMap[tempReservationsMap.resve_date];
                        }

                        setLocalReservationsMap(reservationsMap);
                        renderReservationStatusMap();
                    }
                    tempReservationsMap = null;
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

        function openUrlInNewTab(url) {
            const form = document.createElement('form');
            form.method = 'GET'; form.action = url.split('?')[0]; form.target = '_blank';
            form.rel = 'noopener';
            url.split('?')[1]?.split('&').forEach(param => {
                const [k, v] = param.split('=');
                const input = document.createElement('input'); input.type = 'hidden'; input.name = k; input.value = decodeURIComponent(v);
                form.appendChild(input);
            });
            const panelParamInput = document.createElement('input'); panelParamInput.type = 'hidden'; panelParamInput.name = 'from_panel'; panelParamInput.value = 'true';
            form.appendChild(panelParamInput);
            document.body.appendChild(form); form.submit(); document.body.removeChild(form);
        }

        function showCustomActionModal(title, message, actionText, mainBtnColor, onConfirm, onCancel, guardUntilRelease = false) {
            const existingModal = document.getElementById('gys-custom-action-modal');
            if (existingModal) existingModal.remove();

            const overlay = document.createElement('div');
            overlay.id = 'gys-custom-action-modal';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.65)', zIndex: '999999',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px', boxSizing: 'border-box'
            });

            const modalBox = document.createElement('div');
            Object.assign(modalBox.style, {
                backgroundColor: '#ffffff', width: '100%', maxWidth: '340px',
                borderRadius: '16px', padding: '24px 20px', boxSizing: 'border-box',
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)', textAlign: 'center',
                fontFamily: 'Malgun Gothic, sans-serif'
            });

            const titleEl = document.createElement('h3');
            titleEl.innerText = title;
            Object.assign(titleEl.style, { margin: '0 0 12px 0', fontSize: '18px', color: '#1a202c', fontWeight: '700' });

            const msgEl = document.createElement('p');
            msgEl.innerHTML = message.replace(/\n/g, '<br>');
            Object.assign(msgEl.style, { margin: '0 0 24px 0', fontSize: '15px', color: '#4a5568', lineHeight: '1.5', wordBreak: 'keep-all' });

            const btnContainer = document.createElement('div');
            Object.assign(btnContainer.style, { display: 'flex', flexDirection: 'column', gap: '12px' });

            const mainBtn = document.createElement('button');
            mainBtn.innerText = actionText;
            Object.assign(mainBtn.style, {
                width: '100%', height: '120px', padding: '0', backgroundColor: mainBtnColor || '#2b6cb0', color: '#fff',
                border: 'none', borderRadius: '16px', fontSize: '26px', fontWeight: 'bold',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = '취소';
            Object.assign(cancelBtn.style, {
                width: '100%', height: '45px', padding: '0', backgroundColor: '#edf2f7', color: '#718096',
                border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
            });

            let armed = !guardUntilRelease;
            if (guardUntilRelease) {
                const arm = () => setTimeout(() => { armed = true; }, 400);
                ['touchend', 'touchcancel', 'mouseup'].forEach(t =>
                    document.addEventListener(t, arm, { once: true, capture: true }));
                setTimeout(() => { armed = true; }, 3000);
            }

            mainBtn.onclick = () => {
                if (!armed) return;
                overlay.remove();
                if (typeof onConfirm === 'function') onConfirm();
            };

            cancelBtn.onclick = () => {
                if (!armed) return;
                overlay.remove();
                if (typeof onCancel === 'function') onCancel();
            };

            btnContainer.appendChild(mainBtn);
            btnContainer.appendChild(cancelBtn);

            modalBox.appendChild(titleEl);
            modalBox.appendChild(msgEl);
            modalBox.appendChild(btnContainer);
            overlay.appendChild(modalBox);
            document.body.appendChild(overlay);
        }

        function showLoadingOverlay(message = "예약 요청 중입니다...") {
            let overlay = document.getElementById('gys-loading-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'gys-loading-overlay';
                Object.assign(overlay.style, {
                    position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: '999999',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Malgun Gothic, sans-serif'
                });
                overlay.innerHTML = `
                    <div style="background: #ffffff; padding: 22px 30px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; gap: 12px; border: 2px solid #274081;">
                        <div style="width: 36px; height: 36px; border: 4px solid #e2e8f0; border-top: 4px solid #274081; border-radius: 50%; animation: gys-spin 0.8s linear infinite;"></div>
                        <div id="gys-loading-text" style="font-size: 14px; font-weight: bold; color: #274081;">${message}</div>
                    </div>
                    <style>
                        @keyframes gys-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    </style>
                `;
                document.body.appendChild(overlay);
            } else {
                document.getElementById('gys-loading-text').textContent = message;
                overlay.style.display = 'flex';
            }
        }

        function hideLoadingOverlay() {
            const overlay = document.getElementById('gys-loading-overlay');
            if (overlay) overlay.style.display = 'none';
        }

        function custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink = false) {
            return new Promise(async (resolve) => {
                if (!win.ISLOGIN) {
                    alert('로그인이 필요한 서비스입니다.');
                    isAutoLink ? handleLoginRedirect(true) : handleLoginRedirect();
                    resolve(false);
                    return;
                }

                const reservationsMap = getLocalReservationsMap();
                if (reservationsMap[resve_date]) {
                    alert('이미 예약되어 있는 날짜입니다.\n\n취소(환불)를 원하시면 캘린더의 해당 날짜를 길게 누르(롱프레스)여 처리해주세요.');
                    resolve(false);
                    return;
                }

                showLoadingOverlay("⏳ 서버에 예약 요청 중...");

                const targetApiUrl = `/rest/dailyuse/set_ticket_resve?company_code=GYS10&program_code=${program_code || "I000221"}&part_code=03&resve_date=${resve_date}&time_seq=${time_seq}&mem_no=${win.MEM_NO}&user_cnt=1&_=` + Date.now();

                const data = await fetchWithServerTime(targetApiUrl, 'json');
                hideLoadingOverlay();

                if (!data || data.result_code != 0) {
                    alert(data?.result_message || '예약에 실패했습니다.');
                    resolve(false);
                    return;
                }

                const targetUrl = `/fmcs/102?action=write&comcd=GYS10&resve_no=${data.r_num}`;

                if (isAutoLink) {
                    window.location.href = targetUrl + '&from_panel=true';
                } else {
					tempReservationNo = data.r_num;
                    showCustomActionModal(
                        '결제 진행',
                        '예약이 완료되었습니다.\n지금 바로 결제를 진행하시겠습니까?',
                        '결제하기',
                        '#2b6cb0',
                        () => {
                            openUrlInNewTab(targetUrl);
							
                            resolve(true);
                        },
                        () => {
                            resolve(false);
                            if (data.r_num) {
                                fetch(`/fmcs/102?comcd=GYS10&resve_no=${data.r_num}&action=cancel`, { credentials: 'include' })
                                    .then(res => { if (!res.ok) alert('예약 취소 처리에 실패했습니다.'); })
                                    .catch(() => alert('예약 취소 요청 중 오류가 발생했습니다.'));
                            }
                        },
                        false
                    );
                    return;
                }
                resolve(true);
            });
        }

        function updateServerTimeOffset(response, startReqTime) {
            let serverDateHeader = response.headers?.get ? response.headers.get('date') : response.responseHeaders?.match(/^date:\s*(.+)$/im)?.[1];
            if (serverDateHeader) {
                serverTimeOffsetMs = (new Date(serverDateHeader).getTime() + Math.floor((Date.now() - startReqTime) / 2)) - Date.now();
            }
        }

        function scrollToPanelTop() {
            const panel = document.getElementById('gys-custom-panel');
            if (panel) window.scrollTo({ top: Math.max(0, window.pageYOffset + panel.getBoundingClientRect().top - 7), behavior: 'smooth' });
        }

        function initRealtimeClock() {
            const clockEl = document.getElementById('gys-realtime-clock');
            const clockContainerEl = document.getElementById('gys-realtime-clock-container');
            if (!clockEl || !clockContainerEl) return;

            let lastSecond = -1;

            const renderClockAndGauge = () => {
                const now = new Date(Date.now() + serverTimeOffsetMs);
                const currentSecond = now.getSeconds();

                if (currentSecond !== lastSecond) {
                    lastSecond = currentSecond;
                    clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`;
                }

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
                #gys-custom-panel { position: relative !important; margin: 12px 0 130px 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; -webkit-user-select: none; user-select: none; }
                .gys-dynamic-date-btn, #gys-custom-panel button, #gys-custom-panel select { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
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

            const currentMemName = loadLocalData('gys_local_mem_nm');
            const userNameBtnLabel = (win.ISLOGIN)
                ? `👤 <span style="color: #274081; line-height: 1.0;">${currentMemName}</span>`
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
                <div style="background-color: #f8f9fa; width: 320px; height: 380px; border-radius: 0px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 3px solid #333333; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; position: relative;">
                    <div style="background-color: #333333; color: #ffffff; padding: 9px 14px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; border-radius: 0px;">
                        <span style="font-size: 13px; font-weight: bold;">설정 및 계정 관리</span>
                        <button id="gys-popup-close-btn" style="background: none; border: none; color: #ffffff; font-size: 16px; cursor: pointer; padding: 0; font-weight: bold;">✕</button>
                    </div>
                    <div style="background-color: #ffffff; padding: 14px; flex: 1; overflow-y: auto; box-sizing: border-box;">
                        <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px;">
                            <label style="font-size: 12px; font-weight: bold; color: #333333; white-space: nowrap;">예약일 설정</label>
                            <select id="gys-setting-resve-day-select" style="width: 140px; height: 32px; padding: 2px 4px; border: 1px solid #cccccc; border-radius: 4px; font-size: 12px; font-weight: bold; color: #333333; background-color: #ffffff;">
                                ${dayOptionsHtml}
                            </select>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 12px 0;">
                        <div>
                            <div style="font-size: 12px; font-weight: bold; color: #274081; margin-bottom: 6px;">📋 저장된 계정 목록 관리</div>
                            <div style="font-size: 10.5px; color: #666666; margin-bottom: 8px;">멤버이름을 클릭하여 직접 수정할 수 있습니다.</div>
                            <div style="border: 1px solid #cccccc; border-radius: 4px; overflow: hidden; background: #ffffff;">
                                <div style="display: grid; grid-template-columns: 110px 1fr 50px; background-color: #f1f5f9; border-bottom: 1px solid #cccccc; font-size: 11px; font-weight: bold; color: #333333; text-align: center; padding: 5px 0;">
                                    <div>멤버번호</div>
                                    <div>멤버이름</div>
                                    <div>관리</div>
                                </div>
                                <div id="gys-setting-user-grid-body" style="max-height: 130px; overflow-y: auto;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            panel.appendChild(popupOverlay);

            const firstRegOverlay = document.createElement('div');
            firstRegOverlay.id = 'gys-first-reg-modal-overlay';
            Object.assign(firstRegOverlay.style, {
                position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: '99999',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                boxSizing: 'border-box', borderRadius: '0px'
            });

            firstRegOverlay.innerHTML = `
                <div style="background-color: #ffffff; width: 280px; border-radius: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 2px solid #274081; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; padding: 16px;">
                    <div style="font-size: 14px; font-weight: bold; color: #274081; margin-bottom: 12px; text-align: center;">사용자 이름 등록</div>
                    <div style="font-size: 11.5px; color: #333333; margin-bottom: 6px;">멤버번호: <span id="gys-modal-memno" style="font-weight: bold; color: #0056b3;"></span></div>
                    <div style="font-size: 11.5px; color: #333333; margin-bottom: 4px;">멤버이름</div>
                    <input type="text" id="gys-modal-input-memnm" placeholder="이름을 입력하세요" style="width: 100%; height: 34px; padding: 2px 8px; border: 1px solid #cccccc; border-radius: 4px; font-size: 12px; box-sizing: border-box; margin-bottom: 14px;">
                    <div style="display: flex; gap: 6px;">
                        <button id="gys-modal-cancel-btn" style="flex: 1; height: 34px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">취소</button>
                        <button id="gys-modal-save-btn" style="flex: 1; height: 34px; background-color: #274081; color: #ffffff; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; cursor: pointer;">저장</button>
                    </div>
                </div>
            `;
            panel.appendChild(firstRegOverlay);

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

            if (win.ISLOGIN && win.MEM_NO && loadLocalData('gys_local_mem_nm') === loadLocalData('gys_local_env_mem_nm')) {
                const modalMemNoSpan = document.getElementById('gys-modal-memno');
                const modalInput = document.getElementById('gys-modal-input-memnm');
                if (modalMemNoSpan) modalMemNoSpan.textContent = win.MEM_NO;
                if (modalInput) modalInput.value = '';
                firstRegOverlay.style.display = 'flex';
                if (modalInput) modalInput.focus();
            }

            document.getElementById('gys-modal-cancel-btn').addEventListener('click', () => {
                firstRegOverlay.style.display = 'none';
            });

            document.getElementById('gys-modal-save-btn').addEventListener('click', () => {
                const inputName = document.getElementById('gys-modal-input-memnm').value.trim();
                if (!inputName) {
                    alert('사용자 이름을 입력해주세요.');
                    return;
                }
                const currentMemNo = String(win.MEM_NO).trim();
                setCachedMemberName(currentMemNo, inputName);
                saveLocalData('gys_local_mem_no', currentMemNo);
                saveLocalData('gys_local_mem_nm', inputName);
                updateUserNameBtnLabel();
                firstRegOverlay.style.display = 'none';
                alert(`[${inputName}] 계정이 등록되었습니다.`);
            });

            function renderSettingsUserGrid() {
                const gridBody = document.getElementById('gys-setting-user-grid-body');
                if (!gridBody) return;

                let namesMap = {};
                try {
                    const jsonStr = loadLocalData('gys_local_member_names_map');
                    if (jsonStr) {
                        const parsed = JSON.parse(jsonStr);
                        if (typeof parsed === 'object' && parsed !== null) namesMap = parsed;
                    }
                } catch (e) {}

                const keys = Object.keys(namesMap);
                if (keys.length === 0) {
                    gridBody.innerHTML = '<div style="font-size: 11px; color: #888; text-align: center; padding: 12px 0;">등록된 계정이 없습니다.</div>';
                    return;
                }

                let html = '';
                keys.forEach(no => {
                    const name = namesMap[no];
                    html += `
                        <div style="display: grid; grid-template-columns: 110px 1fr 50px; border-bottom: 1px solid #f1f5f9; align-items: center; font-size: 11px; text-align: center; padding: 4px 0;">
                            <div style="color: #333; font-family: monospace; font-weight: bold; overflow: hidden; text-overflow: ellipsis; padding: 0 2px;">${no}</div>
                            <div style="padding: 0 2px;">
                                <input type="text" class="gys-grid-name-input" data-memno="${no}" value="${name}" style="width: 100%; height: 26px; padding: 0 4px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 11px; text-align: center; box-sizing: border-box; background: #fff;">
                            </div>
                            <div style="padding: 0 2px;">
                                <button class="gys-grid-del-btn" data-memno="${no}" style="background: #ef4444; color: #fff; border: none; border-radius: 3px; font-size: 10px; padding: 3px 6px; cursor: pointer; font-weight: bold;">삭제</button>
                            </div>
                        </div>
                    `;
                });
                gridBody.innerHTML = html;

                gridBody.querySelectorAll('.gys-grid-name-input').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const targetNo = input.dataset.memno;
                        const newName = input.value.trim();
                        if (targetNo && newName) {
                            setCachedMemberName(targetNo, newName);
                            if (win.MEM_NO && String(win.MEM_NO).trim() === targetNo) {
                                saveLocalData('gys_local_mem_nm', newName);
                                updateUserNameBtnLabel();
                            }
                        }
                    });
                });

                gridBody.querySelectorAll('.gys-grid-del-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const targetNo = btn.dataset.memno;
                        if (confirm(`회원번호 [${targetNo}] 계정을 목록에서 삭제하시겠습니까?`)) {
                            removeCachedMemberName(targetNo);
                            if (win.MEM_NO && String(win.MEM_NO).trim() === targetNo) {
                                saveLocalData('gys_local_mem_nm', loadLocalData('gys_local_env_mem_nm'));
                                updateUserNameBtnLabel();
                            }
                            renderSettingsUserGrid();
                        }
                    });
                });
            }

            const timeSelectEl = document.getElementById('gys-time-select');
            if (timeSelectEl) {
                timeSelectEl.addEventListener('change', function() {
                    if (this.value) saveLocalData('gys_local_env_resve_time_seq', this.value);
                });

                let timePressTimer = null;
                const START_LONG_PRESS_TIME = 700;

                const startTimeLongPress = () => {
                    timePressTimer = setTimeout(() => {
                        const options = timeSelectEl.options;
                        if (!options || options.length === 0) {
                            alert("조회된 시간대 옵션이 없습니다.");
                            return;
                        }
                        let resultList = [];
                        for (let i = 0; i < options.length; i++) {
                            const opt = options[i];
                            resultList.push(`value: ${opt.value} | text: ${opt.text}`);
                        }
                        alert(`[시간대 콤보박스 옵션 전체 목록]\n\n` + resultList.join('\n'));
                    }, START_LONG_PRESS_TIME);
                };

                const cancelTimeLongPress = () => {
                    if (timePressTimer) {
                        clearTimeout(timePressTimer);
                        timePressTimer = null;
                    }
                };

                timeSelectEl.addEventListener('mousedown', startTimeLongPress);
                timeSelectEl.addEventListener('mouseup', cancelTimeLongPress);
                timeSelectEl.addEventListener('mouseleave', cancelTimeLongPress);
                timeSelectEl.addEventListener('touchstart', startTimeLongPress, { passive: true });
                timeSelectEl.addEventListener('touchend', cancelTimeLongPress);
                timeSelectEl.addEventListener('touchcancel', cancelTimeLongPress);
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
                const willOpen = popupOverlay.style.display !== 'flex';
                popupOverlay.style.display = willOpen ? 'flex' : 'none';
                if (willOpen) {
                    renderSettingsUserGrid();
                }
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
                if (typeof win.ISLOGIN !== 'undefined' && !win.ISLOGIN) {
                    alert('로그인이 필요한 서비스입니다.');
                    return;
                }

                showLoadingOverlay("🔄 예약현황 조회 중...");
                try { await refreshUserReservationsAsync(); } finally { hideLoadingOverlay(); }
            });

            async function updateProgramSelectOptions(targetDate, isManualClick = false) {
                if (!win.ISLOGIN && isManualClick) { alert('로그인이 필요한 서비스입니다.'); return; }
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
                        option.value = item.seq; option.textContent = `(${item.time_nm}) ${item.timep}`;
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
                    return !(dayOfWeek === 2 || hasClose || item.state_cd === "30");
                })?.date || currentMonthItems[0]?.date || "";

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
                    if (dayOfWeek === 6) textColor = '#125aab';

                    const hasClose = item.close_advice && item.close_advice.trim() !== '';
                    const stateCd = String(item.state_cd || '');
                    const stateNm = (item.state_nm || '').replace(/<br>/g, ' ');

                    let statusText = '';
                    let statusColor = '#656565';
                    let statusFontWeight = 'normal';
                    let isDisabled = false;
                    let isClosedDay = false;

                    if (hasClose || stateCd === '30') {
                        statusText = hasClose ? item.close_advice.trim() : (stateNm || '휴관일');
                        statusColor = '#d9534f';
                        isDisabled = true;
                        isClosedDay = true;
                    } else if (stateCd === '20') {
                        statusText = stateNm;
                        statusColor = '#656565';
                        isDisabled = true;
                        isClosedDay = false;
                    } else if (stateCd === '10' && stateNm.includes('예약마감')) {
                        statusText = stateNm;
                        statusColor = '#656565';
                        isDisabled = false;
                    } else if (stateCd === '10' && stateNm.includes('예약가능')) {
                        statusText = stateNm;
                        statusColor = '#0072bc';
                        isDisabled = false;
                    } else if (stateCd === '40') {
                        statusText = stateNm;
                        statusColor = '#d9534f';
                        isDisabled = false;
                    } else {
                        statusText = stateNm;
                        statusColor = '#656565';
                        isDisabled = false;
                    }

                    const dateBtn = document.createElement('button');
                    dateBtn.className = 'gys-dynamic-date-btn';
                    dateBtn.dataset.resveDate = formattedResveDate;
                    dateBtn.disabled = isDisabled;

                    dateBtn.innerHTML = '' +
                        '<div class="gys-day-number" style="font-size: 14.5px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1.0; pointer-events: none; padding-top: 3px;">' + dayNum + '</div>' +
                        '<div style="flex: 1; display: flex; align-items: flex-end; justify-content: center; width: 100%; position: relative; pointer-events: none; padding-bottom: 7px;">' +
                            '<div class="gys-info-badge" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; pointer-events: none;"></div>' +
                            (statusText ?
                                '<span class="gys-status-text" style="' +
                                    'width: 100%; font-size: 11px; color: ' + statusColor + '; font-weight: ' + statusFontWeight + '; line-height: 1.15; ' +
                                    'text-align: center; word-break: keep-all; overflow-wrap: anywhere; white-space: normal; ' +
                                    'overflow: hidden; pointer-events: none;' +
                                '">' + statusText + '</span>'
                                : '') +
                        '</div>';

                    Object.assign(dateBtn.style, {
                        height: '80px',
                        backgroundColor: isClosedDay ? '#f8f9fa' : '#ffffff',
                        borderRadius: '0px', border: 'none',
                        boxSizing: 'border-box',
                        cursor: isDisabled ? 'not-allowed' : (formattedResveDate < getTodayYMD() ? 'default' : 'pointer'),
                        width: '100%', padding: '3px 0 0 0', userSelect: 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        transition: 'all 0.15s'
                    });

                    dateBtn.onmouseover = () => { if (!dateBtn.disabled && formattedResveDate >= getTodayYMD()) dateBtn.style.backgroundColor = '#e8f4ff'; };
                    dateBtn.onmouseout = () => { if (!dateBtn.disabled) dateBtn.style.backgroundColor = isClosedDay ? '#f8f9fa' : '#ffffff'; };

                    let pressTimer = null;
                    let isLongPress = false;
                    let startX = 0, startY = 0;

                    const resetPressVisual = () => {
                        dateBtn.style.transition = 'all 0.15s';
                        dateBtn.style.backgroundColor = isClosedDay ? '#f8f9fa' : '#ffffff';
                        dateBtn.style.boxShadow = '';
                    };

                    const startLongPressCheck = (e) => {
                        if (formattedResveDate < getTodayYMD()) return;
                        isLongPress = false;
                        if (e.touches && e.touches.length > 0) {
                            startX = e.touches[0].clientX;
                            startY = e.touches[0].clientY;
                        }

                        const resObj0 = getLocalReservationsMap()[formattedResveDate];
                        const canRefund = !!(resObj0 && resObj0.data);
                        if (canRefund) {
                            dateBtn.style.transition = 'background-color 0.7s linear';
                            dateBtn.style.backgroundColor = '#c53030';
                        }

                        pressTimer = setTimeout(() => {
                            const reservationsMap = getLocalReservationsMap();
                            const resObj = reservationsMap[formattedResveDate];

                            if (!resObj || !resObj.data) {
                                return;
                            }
                            isLongPress = true;

                            const d = resObj.data;
                            const resveNo = d.entr_res_idx;
                            const useDate = d.use_date || '';
                            const timeName = d.time_name || '';

                            if (!resveNo) {
                                alert('환불에 필요한 예약 번호가 누락되었습니다.');
                                return;
                            }

                            showCustomActionModal(
                                '환불 신청',
                                `${useDate} : ${timeName}\n환불 신청 하시겠습니까?`,
                                '환불 신청하기',
                                '#c53030',
                                () => {
                                    const refundUrl = `/fmcs/122?comcd=GYS10&resve_no=${resveNo}&action=refund`;
                                    openUrlInNewTab(refundUrl);

                                    tempReservationsMap = {
                                        'type': 'delete',
                                        'resve_date': useDate.replace(/-/g, ''),
                                        'time_name': timeName,
										'r_num': resveNo
                                    };
                                },
                                () => {},
                                true
                            );
                        }, 700);
                    };

                    const handleTouchMove = (e) => {
                        if (!pressTimer) return;
                        if (e.touches && e.touches.length > 0) {
                            const currentX = e.touches[0].clientX;
                            const currentY = e.touches[0].clientY;
                            if (Math.abs(currentX - startX) > 10 || Math.abs(currentY - startY) > 10) {
                                cancelLongPressCheck();
                            }
                        }
                    };

                    const cancelLongPressCheck = () => {
                        if (pressTimer) {
                            clearTimeout(pressTimer);
                            pressTimer = null;
                        }
                        resetPressVisual();
                    };

                    dateBtn.addEventListener('mousedown', startLongPressCheck);
                    dateBtn.addEventListener('mouseup', cancelLongPressCheck);
                    dateBtn.addEventListener('mouseleave', cancelLongPressCheck);
                    dateBtn.addEventListener('touchstart', startLongPressCheck, { passive: true });
                    dateBtn.addEventListener('touchmove', handleTouchMove, { passive: true });
                    dateBtn.addEventListener('touchend', cancelLongPressCheck);
                    dateBtn.addEventListener('touchcancel', cancelLongPressCheck);

                    dateBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (isLongPress) {
                            e.preventDefault();
                            return;
                        }

                        if (isDisabled || formattedResveDate < getTodayYMD()) return;

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

                        if (!selectedTimeSeq || !selectedProgramCode) { alert('시간대/상품이 선택되지 않았습니다.'); return; }

                        dateBtn.disabled = true;
                        if (await custom_set_ticket_resve(formattedResveDate, selectedTimeSeq, selectedProgramCode, false)) {
                            tempReservationsMap = {
                                'type': 'assign',
                                'resve_date': formattedResveDate,
								'use_date': rawDate,
                                'time_name': selectedTimeText,
								'r_num': tempReservationNo
                            };
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

                if (firstWorkDateHyphen) {
                    updateAllOptions(firstWorkDateHyphen, false);
                }
            }

            const ymBtn = document.getElementById('gys-ym-reload-btn');
            ymBtn.addEventListener('click', loadDateList);

            document.getElementById('gys-user-name-btn').addEventListener('click', () => {
                const currentMemName = loadLocalData('gys_local_mem_nm');
                if (win.ISLOGIN) {
                    if (confirm(`[${currentMemName}] 님 로그아웃 하시겠습니까?`)) {
                        removeAllLocal();
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

            if (isTargetDay) {
                initRealtimeClock();
            } else {
                refreshUserReservationsAsync();
            }
        }

        window.addEventListener('load', async () => {
            console.log('[DEBUG] window.load fired. Current MEM_NO:', win.MEM_NO, 'Type:', typeof win.MEM_NO);

            if (typeof win.MEM_NO === 'undefined') {
                await new Promise(resolve => {
                    let retries = 0;
                    const interval = setInterval(() => {
                        retries++;
                        console.log(`[DEBUG] Polling MEM_NO... try #${retries}, Current MEM_NO:`, win.MEM_NO);

                        if (typeof win.MEM_NO !== 'undefined' || retries > 15) {
                            console.log('[DEBUG] Polling finished. Final MEM_NO in loop:', win.MEM_NO);
                            clearInterval(interval);
                            resolve();
                        }
                    }, 100);
                });
            } else {
                console.log('[DEBUG] MEM_NO was already defined upon load:', win.MEM_NO);
            }

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