// ==UserScript==
// @name         고양도시관리공사 자동로그인 및 Quick 예약 툴바
// @namespace    http://tampermonkey.net/
// @version      0.9.15
// @description  Quick 예약, 최초 로딩 시 다음 달 자동 조회 및 기준일 지정 적용
// @author       You
// @match        https://yeyak.gys.or.kr/fmcs/102
// @match        https://yeyak.gys.or.kr/fmcs/102?*
// @match        https://yeyak.gys.or.kr/fmcs/27*
// @updateURL    https://raw.githubusercontent.com/kyoungseon/tampermonkey/main/yeyak_gys.user.js
// @downloadURL  https://raw.githubusercontent.com/kyoungseon/tampermonkey/main/yeyak_gys.user.js
// @grant        window.close
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// ==/UserScript==
(function() {
    'use strict';

    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

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

    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    const isFromPanelParam = urlParams.get('from_panel') === 'true';

    // 상품명에서 '온라인 ' 접두사를 제거하는 헬퍼 함수
    function formatProgramName(name) {
        if (!name) return '';
        return name.replace(/^온라인\s*/, '');
    }

    // 오늘 날짜 반환 (YYYYMMDD)
    function getTodayYMD() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return '' + yyyy + mm + dd;
    }

    // 오늘 날짜 반환 (YYYY-MM-DD)
    function getTodayYMDHyphen() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // 이번 달 YYYYMM 반환
    function getCurrentYM() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        return '' + yyyy + mm;
    }

    // YYYYMM -> YYYY.MM 포맷팅
    function formatYMWithDot(ymStr) {
        if (!ymStr || ymStr.length !== 6) return ymStr;
        return ymStr.substring(0, 4) + '.' + ymStr.substring(4, 6);
    }

    // YYYY.MM -> YYYYMM 순수 숫자 변환
    function parseYMFromDot(ymDotStr) {
        if (!ymDotStr) return getCurrentYM();
        return ymDotStr.replace(/\./g, '');
    }

    // 입력 날짜가 오늘보다 과거인지 확인 후 검증된 YYYYMMDD 반환
    function getValidTargetDate(dateStr) {
        const pureDate = (dateStr || '').replace(/-/g, '');
        const todayPure = getTodayYMD();
        if (!pureDate || pureDate < todayPure) {
            return todayPure;
        }
        return pureDate;
    }

    // =============================================================
    // [PART A] 결제 진행 및 결과 페이지 (action 파라미터 존재 시)
    // =============================================================
    if (actionParam) {
        console.log('[Quick Auto] 특수 상태 페이지 진입 (action:', actionParam, ')');

        const isQuickAutoTab = isFromPanelParam || safeSession.get('gys_quick_auto') === 'true';

        if (actionParam === 'reg_read') {
            if (isQuickAutoTab) {
                safeSession.remove('gys_quick_auto');

                function handleRegReadConfirm() {
                    setTimeout(function() {
                        const isConfirmed = confirm("🎉 예약 및 결제가 정상 완료되었습니다!\n\n현재 탭을 닫으시겠습니까?");
                        if (isConfirmed) {
                            console.log('[Quick Auto] 사용자가 탭 닫기를 선택했습니다.');
                            win.close();
                        } else {
                            console.log('[Quick Auto] 사용자가 영수증 확인을 선택하여 화면을 유지합니다.');
                        }
                    }, 350);
                }

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', handleRegReadConfirm);
                } else {
                    handleRegReadConfirm();
                }
            }
            return;
        }

        if (actionParam === 'write') {
            if (isFromPanelParam) {
                safeSession.set('gys_quick_auto', 'true');
            }

            if (isQuickAutoTab) {
                function handlePaymentAutoClick() {
                    setTimeout(function() {
                        const refundCheckbox = document.querySelector('input[name="agree_refund"]');
                        if (refundCheckbox && !refundCheckbox.checked) {
                            refundCheckbox.checked = true;
                            refundCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                            refundCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
                            console.log('[Quick Auto] 약관 동의 체크 완료');
                        }

                        const applyPayBtn = document.getElementById('apply_payment');
                        if (applyPayBtn) {
                            console.log('[Quick Auto] 결제하기 버튼 자동 클릭');
                            applyPayBtn.click();
                        }
                    }, 400);
                }

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', handlePaymentAutoClick);
                } else {
                    handlePaymentAutoClick();
                }
            }
            return;
        }
        
        return;
    }

    // =============================================================
    // [PART B] 로그인 페이지 (/fmcs/27) 처리
    // =============================================================
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

                    window.scrollTo({
                        top: middleOffset,
                        behavior: 'instant'
                    });

                    userIdInput.focus({ preventScroll: true });
                    userIdInput.click();
                }
            });
        }
    } 
    // =============================================================
    // [PART C] 예약 메인 페이지 (/fmcs/102) 처리
    // =============================================================
    else if (currentPath === '/fmcs/102') {

        function handleAutoLoginRedirect() {
            const loggedIn = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;

            if (!loggedIn) {
                console.log('[Quick Auto] 미로그인 상태 확인됨. 로그인 페이지로 이동합니다.');
                const currentFullUrl = encodeURIComponent(window.location.href);
                window.location.href = 'https://yeyak.gys.or.kr/fmcs/27?referer=' + currentFullUrl;
                return true;
            }
            return false;
        }

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
                    handleAutoLoginRedirect();
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
                        console.log('[Quick Auto] 첫 결과 코드 실패 (' + data.result_message + ') -> 300ms 후 자동 재시도 (' + (retryCount + 1) + '/2)');
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
                        console.log('[Quick Auto] 통신 실패 -> 300ms 후 자동 재시도');
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
                        headers: {
                            "X-Requested-With": "XMLHttpRequest"
                        },
                        onload: function(response) {
                            try {
                                var data = JSON.parse(response.responseText);
                                handleSuccessResponse(data);
                            } catch (e) {
                                handleErrorResponse();
                            }
                        },
                        onerror: handleErrorResponse
                    });
                } else {
                    fetch(targetApiUrl, {
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                        credentials: 'include'
                    }).then(function(res) {
                        return res.json();
                    }).then(function(data) {
                        handleSuccessResponse(data);
                    }).catch(handleErrorResponse);
                }
            });
        }

        async function fetchMonthStateList(yearMonth) {
            const url = '/rest/dailyuse/mon_state_list?company_code=GYS10&part_code=03&resve_mon=' + yearMonth + '&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                if (!res.ok) throw new Error('HTTP Error ' + res.status);
                return await res.json();
            } catch (err) {
                return null;
            }
        }

        async function fetchTimeSlots(targetDate) {
            const validDate = getValidTargetDate(targetDate);
            const url = '/rest/dailyuse/time_state_list?company_code=GYS10&part_code=03&resve_mon=' + validDate + '&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                if (!res.ok) throw new Error('HTTP Error ' + res.status);
                return await res.json();
            } catch (err) {
                return null;
            }
        }

        async function fetchItemList(targetDate) {
            const isLogged = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;
            const memNo = (typeof win.MEM_NO !== 'undefined') ? win.MEM_NO : '';

            if (!isLogged || !memNo) return null;

            const validDate = getValidTargetDate(targetDate);
            const url = '/rest/dailyuse/item_list?company_code=GYS10&resve_part_code=03&resve_date=' + validDate + '&member_code=' + memNo + '&_=' + Date.now();
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
                if (!res.ok) throw new Error('HTTP Error ' + res.status);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) return data;
            } catch (err) {
                console.error('[Quick Auto] 상품 목록 API 호출 실패:', err);
            }
            return null;
        }

        function addMonthsToYM(ymStr, offset) {
            if (!ymStr || ymStr.length !== 6) return ymStr;
            const year = parseInt(ymStr.substring(0, 4), 10);
            const month = parseInt(ymStr.substring(4, 6), 10) - 1;
            const targetDate = new Date(year, month + offset, 1);
            
            const currentYM = getCurrentYM();
            const targetYM = '' + targetDate.getFullYear() + String(targetDate.getMonth() + 1).padStart(2, '0');
            
            if (targetYM < currentYM) {
                return currentYM;
            }
            return targetYM;
        }

        function applyResponsiveStyles() {
            if (document.getElementById('gys-responsive-style')) return;
            const style = document.createElement('style');
            style.id = 'gys-responsive-style';
            style.textContent = '' +
                '#gys-custom-panel {' +
                    'position: static !important;' +
                    'margin: 10px auto 30px auto !important;' +
                    'width: 99% !important;' +
                    'max-width: 500px !important;' +
                    'box-sizing: border-box !important;' +
                '}' +
                '@media (min-width: 769px) {' +
                    'body, #header, header, #container, .alignbox, #section, footer {' +
                        'margin-left: 0 !important;' +
                        'margin-right: auto !important;' +
                        'padding-left: 0 !important;' +
                    '}' +
                    '#container, #section, .alignbox {' +
                        'max-width: 1200px;' +
                        'width: 100%;' +
                        'margin-left: 0 !important;' +
                        'padding-left: 0 !important;' +
                    '}' +
                    '#gys-custom-panel {' +
                        'position: fixed !important;' +
                        'top: 60px !important;' +
                        'right: 10px !important;' +
                        'margin: 0 !important;' +
                        'width: 440px !important;' +
                        'max-height: 90vh !important;' +
                        'overflow-y: auto !important;' +
                        'z-index: 999999 !important;' +
                    '}' +
                '}';
            document.head.appendChild(style);
        }

        function createCustomPanel() {
            if (document.getElementById('gys-custom-panel')) return;

            applyResponsiveStyles();

            // 최초 로딩 시 기본 달을 '다음 달'로 설정
            const currentYM = getCurrentYM();
            const defaultYM = addMonthsToYM(currentYM, 1);
            const defaultYMDot = formatYMWithDot(defaultYM);
            const todayHyphen = getTodayYMDHyphen();

            const panel = document.createElement('div');
            panel.id = 'gys-custom-panel';
            
            Object.assign(panel.style, {
                backgroundColor: '#ffffff',
                border: '2px solid #1969c5',
                borderRadius: '8px',
                padding: '8px 4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                fontFamily: 'Malgun Gothic, sans-serif',
                boxSizing: 'border-box'
            });

            panel.innerHTML = '' +
                '<div style="font-weight: bold; font-size: 15px; margin-bottom: 8px; color: #1969c5; border-bottom: 2px solid #1969c5; padding-bottom: 4px; padding-left: 4px;">' +
                    '⛳ 성저파크골프장 Quick 예약' +
                '</div>' +
                // 상단 레이아웃: [달 선택(다음달 기본)] | [기준일 선택(톤다운)]
                '<div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 6px; padding: 0 2px;">' +
                    // 달 선택 영역 (다음 달 기본 세팅)
                    '<div style="display: flex; gap: 3px; align-items: center;">' +
                        '<button id="gys-prev-month-btn" title="이전 달" style="width: 42px; height: 32px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; text-align: center; display: flex; align-items: center; justify-content: center;">◀</button>' +
                        '<button id="gys-ym-reload-btn" title="클릭 시 현재 선택 달 재조회" style="width: 96px; height: 32px; border: 1.5px solid #1969c5; border-radius: 4px; text-align: center; font-weight: bold; font-size: 14.5px; background-color: #e8f4ff; color: #1969c5; cursor: pointer; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">' + defaultYMDot + '</button>' +
                        '<button id="gys-next-month-btn" title="다음 달" style="width: 42px; height: 32px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; text-align: center; display: flex; align-items: center; justify-content: center;">▶</button>' +
                    '</div>' +
                    // 기준일 선택 영역 (톤다운)
                    '<div style="display: flex; align-items: center; gap: 3px;">' +
                        '<span style="font-size: 10.5px; font-weight: normal; color: #777777; white-space: nowrap;">기준일:</span>' +
                        '<input type="date" id="gys-base-date-input" value="' + todayHyphen + '" min="' + todayHyphen + '" style="width: 108px; height: 26px; padding: 1px 2px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 10.5px; font-weight: normal; color: #555555; background-color: #f8f9fa; text-align: center; box-sizing: border-box;">' +
                        '<button id="gys-refresh-options-btn" title="시간대/상품 갱신" style="height: 26px; padding: 0 4px; background-color: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 4px; cursor: pointer; font-size: 10px; color: #666666; display: flex; align-items: center; justify-content: center;">🔄</button>' +
                    '</div>' +
                '</div>' +
                // 하단: 시간대 콤보박스 | 상품 콤보박스 (5:5 비율)
                '<div style="margin-bottom: 8px; padding: 0 2px;">' +
                    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">' +
                        '<select id="gys-time-select" style="width: 100%; height: 32px; padding: 2px 4px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11px; font-weight: bold; line-height: 1.3;">' +
                            '<option value="">시간대 로딩 중...</option>' +
                        '</select>' +
                        '<select id="gys-program-select" style="width: 100%; height: 32px; padding: 2px 4px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11px; font-weight: bold; line-height: 1.3;">' +
                            '<option value="">상품 로딩 중...</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 8px 0;">' +
                '<div id="gys-calendar-wrapper" style="width: 100%; box-sizing: border-box;">' +
                    '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; font-weight: bold; font-size: 12.5px; margin-bottom: 4px; background-color: #f1f3f5; padding: 4px 0; border-radius: 4px;">' +
                        '<span style="color: #d9534f;">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style="color: #0275d8;">토</span>' +
                    '</div>' +
                    '<div id="gys-date-buttons-container" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; width: 100%; box-sizing: border-box;">' +
                        '<div style="grid-column: span 7; font-size: 12px; color: #666666; text-align: center; padding: 15px 0;">날짜 데이터를 불러오는 중...</div>' +
                    '</div>' +
                '</div>';

            const container = document.getElementById('container') || document.body;
            container.appendChild(panel);

            // 1. 상품 목록만 독립 갱신 (API response 결과만 반영)
            async function updateProgramSelectOptions(targetDate, isManualClick) {
                if (typeof isManualClick === 'undefined') isManualClick = false;

                const isLogged = (typeof win.ISLOGIN !== 'undefined') ? win.ISLOGIN : false;
                const memNo = (typeof win.MEM_NO !== 'undefined') ? win.MEM_NO : '';

                if ((!isLogged || !memNo) && isManualClick) {
                    alert('상품 목록을 변경/조회하려면 로그인이 필요합니다.');
                    handleAutoLoginRedirect();
                    return;
                }

                const programSelectEl = document.getElementById('gys-program-select');
                if (!programSelectEl) return;

                const currentVal = programSelectEl.value || safeLocal.get('gys_saved_program_cd') || "";
                const dynamicItems = await fetchItemList(targetDate);

                const fragment = document.createDocumentFragment();
                if (dynamicItems && dynamicItems.length > 0) {
                    dynamicItems.forEach(function(p) {
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
                } else {
                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = "";
                    emptyOpt.textContent = "조회된 상품 없음";
                    fragment.appendChild(emptyOpt);
                }

                programSelectEl.replaceChildren(fragment);
            }

            // 2. 시간대 목록만 독립 갱신 (API response 결과만 반영)
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

            // 통합 Option 갱신
            async function updateAllOptions(targetDate, isManualClick) {
                await Promise.all([
                    updateTimeSelectOptions(targetDate),
                    updateProgramSelectOptions(targetDate, isManualClick)
                ]);
            }

            // 3. 달력 전체 갱신 및 첫 영업일 자동 탐색/세팅
            async function loadDateList() {
                const ymBtn = document.getElementById('gys-ym-reload-btn');
                let ymValue = parseYMFromDot(ymBtn.textContent.trim());
                const currentYM = getCurrentYM();

                if (!ymValue || ymValue.length !== 6 || ymValue < currentYM) {
                    alert('과거 달은 선택하거나 조회할 수 없습니다. 이번 달로 변경합니다.');
                    ymValue = currentYM;
                    ymBtn.textContent = formatYMWithDot(currentYM);
                }

                const btnContainer = document.getElementById('gys-date-buttons-container');
                btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #1969c5; text-align: center; padding: 15px 0;">날짜 데이터 로딩 중...</div>';

                const monthData = await fetchMonthStateList(ymValue);
                if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
                    btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #d9534f; text-align: center; padding: 15px 0;">조회된 날짜 데이터가 없습니다.</div>';
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

                // --- 1일부터 탐색하여 첫 영업일(비휴무일) 찾기 ---
                let firstWorkDateHyphen = "";
                for (let i = 0; i < currentMonthItems.length; i++) {
                    const item = currentMonthItems[i];
                    const hasClose = item.close_advice && item.close_advice.trim() !== '';
                    const stateText = hasClose ? item.close_advice.trim() : (item.state_nm || '');
                    
                    const isClosed = hasClose || item.state_cd === "30" || stateText.indexOf('휴관') !== -1 || stateText.indexOf('대회') !== -1;
                    if (!isClosed) {
                        firstWorkDateHyphen = item.date; // YYYY-MM-DD
                        break;
                    }
                }

                // 영업일을 못 찾은 경우 1일 사용
                if (!firstWorkDateHyphen && currentMonthItems.length > 0) {
                    firstWorkDateHyphen = currentMonthItems[0].date;
                }

                const todayHyphen = getTodayYMDHyphen();

                // 탐색된 날짜가 오늘보다 과거일 경우 오늘 날짜로 보정
                if (firstWorkDateHyphen && firstWorkDateHyphen < todayHyphen) {
                    firstWorkDateHyphen = todayHyphen;
                }

                if (firstWorkDateHyphen) {
                    const baseDateInput = document.getElementById('gys-base-date-input');
                    baseDateInput.value = firstWorkDateHyphen;
                    await updateAllOptions(firstWorkDateHyphen, false);
                }

                btnContainer.innerHTML = '';

                // --- 이전 달 비활성화 셀 처리 ---
                const prevMonthLastDateObj = new Date(curYear, curMonth, 0);
                const prevMonthLastDay = prevMonthLastDateObj.getDate();
                for (let i = startDayOfWeek - 1; i >= 0; i--) {
                    const prevBtn = document.createElement('button');
                    prevBtn.disabled = true;
                    prevBtn.innerHTML = '<div style="position: absolute; top: 4px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: #ced4da; text-align: center; line-height: 1;">' + (prevMonthLastDay - i) + '</div>';

                    Object.assign(prevBtn.style, {
                        height: '58px', backgroundColor: '#f8f9fa', borderRadius: '3px', border: '1px solid #e9ecef',
                        boxSizing: 'border-box', cursor: 'not-allowed', position: 'relative', width: '100%', padding: '0', userSelect: 'none'
                    });
                    btnContainer.appendChild(prevBtn);
                }

                const todayPure = getTodayYMD();

                currentMonthItems.forEach(function(item) {
                    const rawDate = item.date;
                    const dayNum = parseInt(rawDate.split('-')[2], 10);
                    const formattedResveDate = rawDate.replace(/-/g, '');
                    const dayOfWeek = new Date(rawDate).getDay();

                    let textColor = '#333333';
                    if (dayOfWeek === 0) textColor = '#d9534f';
                    if (dayOfWeek === 6) textColor = '#0275d8';

                    const isPastDay = formattedResveDate < todayPure;

                    const hasCloseAdvice = item.close_advice && item.close_advice.trim() !== '';
                    let stateText = hasCloseAdvice ? item.close_advice.trim() : (item.state_nm || '예약마감');
                    let stateColor = '#6c757d';
                    let isAvailable = false;

                    if (isPastDay) {
                        stateColor = '#ced4da';
                    } else if (stateText.indexOf('예약기간') !== -1) {
                        stateColor = '#6c757d';
                    } else if (hasCloseAdvice || item.state_cd === "30" || stateText.indexOf('휴관') !== -1 || stateText.indexOf('대회') !== -1) {
                        stateColor = '#d9534f';
                    } else if (stateText.indexOf('가능') !== -1) {
                        stateColor = '#0275d8';
                        isAvailable = true;
                    } else {
                        stateColor = '#6c757d';
                    }

                    const fontWeightStyle = isAvailable ? 'font-weight: bold;' : 'font-weight: normal;';

                    // --- 비활성화 버튼 처리 (과거일 / 휴관일 / 사유 존재 등) ---
                    if (isPastDay || hasCloseAdvice || item.state_cd === "30" || stateText.indexOf('휴관') !== -1) {
                        const closedBtn = document.createElement('button');
                        closedBtn.disabled = true;
                        closedBtn.innerHTML = '' +
                            '<div style="position: absolute; top: 4px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: ' + (isPastDay ? '#ced4da' : textColor) + '; text-align: center; line-height: 1;">' + dayNum + '</div>' +
                            '<div style="position: absolute; bottom: 3px; left: 1px; right: 1px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: ' + stateColor + '; ' + fontWeightStyle + ' line-height: 1.1; word-break: keep-all; text-align: center;">' + stateText + '</div>';
                        
                        Object.assign(closedBtn.style, {
                            height: '58px', backgroundColor: '#f8f9fa', borderRadius: '3px', border: '1px solid #e9ecef',
                            boxSizing: 'border-box', cursor: 'not-allowed', position: 'relative', width: '100%', padding: '0', userSelect: 'none'
                        });

                        btnContainer.appendChild(closedBtn);
                        return;
                    }

                    // --- 클릭 가능한 일반 날짜 버튼 처리 ---
                    const dateBtn = document.createElement('button');
                    dateBtn.className = 'gys-dynamic-date-btn';
                    dateBtn.dataset.baseDay = '' + dayNum;
                    dateBtn.dataset.count = "0";

                    dateBtn.innerHTML = '' +
                        '<div class="gys-day-number" style="position: absolute; top: 4px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1; pointer-events: none;">' + dayNum + '</div>' +
                        '<div class="gys-count-badge" style="position: absolute; top: 20px; left: 0; right: 0; font-size: 11px; font-weight: bold; color: #28a745; text-align: center; line-height: 1; pointer-events: none;"></div>' +
                        '<div style="position: absolute; bottom: 3px; left: 1px; right: 1px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: ' + stateColor + '; ' + fontWeightStyle + ' text-align: center; line-height: 1.1; word-break: keep-all; pointer-events: none;">' +
                            stateText +
                        '</div>';

                    Object.assign(dateBtn.style, {
                        height: '58px', backgroundColor: '#ffffff', border: '1px solid #d0d0d0', borderRadius: '3px',
                        cursor: 'pointer', boxSizing: 'border-box', transition: 'all 0.15s', position: 'relative', width: '100%', padding: '0'
                    });

                    dateBtn.onmouseover = function() { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#e8f4ff'; };
                    dateBtn.onmouseout = function() { if (!dateBtn.disabled && dateBtn.dataset.count === "0") dateBtn.style.backgroundColor = '#ffffff'; };

                    dateBtn.addEventListener('click', async function(e) {
                        e.stopPropagation();
                        const selectedTimeSeq = document.getElementById('gys-time-select').value;
                        const selectedProgramCode = document.getElementById('gys-program-select').value;

                        if (!selectedTimeSeq || !selectedProgramCode) {
                            alert('시간대 및 상품을 선택해주세요.');
                            return;
                        }

                        dateBtn.disabled = true;
                        dateBtn.style.backgroundColor = '#e9ecef';

                        const isSuccess = await custom_set_ticket_resve(formattedResveDate, selectedTimeSeq, selectedProgramCode, false);
                        if (isSuccess) {
                            let count = parseInt(dateBtn.dataset.count, 10) + 1;
                            dateBtn.dataset.count = count.toString();
                            
                            dateBtn.querySelector('.gys-count-badge').textContent = '(' + count + ')';
                            dateBtn.style.backgroundColor = '#d4edda';
                            dateBtn.style.borderColor = '#28a745';
                        } else {
                            dateBtn.style.backgroundColor = '#f8d7da';
                            dateBtn.style.borderColor = '#dc3545';
                        }
                        dateBtn.disabled = false;
                    });

                    btnContainer.appendChild(dateBtn);
                });

                // --- 다음 달 비활성화 셀 처리 ---
                const totalCellsSoFar = startDayOfWeek + currentMonthItems.length;
                const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
                for (let nextDayNum = 1; nextDayNum <= remainingCells; nextDayNum++) {
                    const nextBtn = document.createElement('button');
                    nextBtn.disabled = true;
                    nextBtn.innerHTML = '<div style="position: absolute; top: 4px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: #ced4da; text-align: center; line-height: 1;">' + nextDayNum + '</div>';

                    Object.assign(nextBtn.style, {
                        height: '58px', backgroundColor: '#f8f9fa', borderRadius: '3px', border: '1px solid #e9ecef',
                        boxSizing: 'border-box', cursor: 'not-allowed', position: 'relative', width: '100%', padding: '0', userSelect: 'none'
                    });
                    btnContainer.appendChild(nextBtn);
                }
            }

            // 이벤트 리스너 바인딩
            const ymBtn = document.getElementById('gys-ym-reload-btn');

            // YYYY.MM 버튼 클릭 시 즉시 재조회
            ymBtn.addEventListener('click', function() {
                loadDateList();
            });

            // 단일 기준일 갱신 및 날짜 선택 이벤트
            document.getElementById('gys-refresh-options-btn').addEventListener('click', function() {
                const targetDate = document.getElementById('gys-base-date-input').value;
                updateAllOptions(targetDate, true);
            });
            document.getElementById('gys-base-date-input').addEventListener('change', function() {
                const todayHyphen = getTodayYMDHyphen();
                if (this.value < todayHyphen) {
                    alert('오늘 이전 날짜는 선택할 수 없습니다.');
                    this.value = todayHyphen;
                }
                updateAllOptions(this.value, false);
            });

            // 이전/다음 달 버튼 클릭 시 처리
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

            loadDateList();
        }

        window.addEventListener('load', async function() {
            const timeSeq   = urlParams.get('time_seq');
            const programCd = urlParams.get('program_cd') || "I000221";

            const resveDateParam = urlParams.get('resve_date');
            if (resveDateParam && timeSeq) {
                if (handleAutoLoginRedirect()) return;
                console.log('[Quick Auto] 최속 예약 신청 시작: ' + resveDateParam + ', seq:' + timeSeq);
                await custom_set_ticket_resve(resveDateParam, timeSeq, programCd, true);
            } else {
                const isPureMainPage = Array.from(urlParams.keys()).length === 0;
                
                if (isPureMainPage) {
                    createCustomPanel();
                } else {
                    console.log('[Quick Auto] 파라미터가 존재하는 상태 페이지이므로 패널 생성을 건너뜁니다.');
                }
            }
        });
    }
})();