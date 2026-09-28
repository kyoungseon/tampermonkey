// ==UserScript==
// @name         고양도시관리공사 자동로그인 및 Quick 예약 툴바 (최종 완결판)
// @namespace    http://tampermonkey.net/
// @version      0.9.3
// @description  Quick 예약, 비활성화 셀 button disabled 처리 및 클릭 전파 완전 차단, 예약가능만 bold 강조, 선택값 저장
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

        let PROGRAM_LIST = [
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
            const url = '/rest/dailyuse/time_state_list?company_code=GYS10&part_code=03&resve_mon=' + targetDate + '&_=' + Date.now();
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

            const url = '/rest/dailyuse/item_list?company_code=GYS10&resve_part_code=03&resve_date=' + targetDate + '&member_code=' + memNo + '&_=' + Date.now();
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

        function getNextMonthYM() {
            const today = new Date();
            const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            const yyyy = nextMonthDate.getFullYear();
            const mm = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
            return '' + yyyy + mm;
        }

        function addMonthsToYM(ymStr, offset) {
            if (!ymStr || ymStr.length !== 6) return ymStr;
            const year = parseInt(ymStr.substring(0, 4), 10);
            const month = parseInt(ymStr.substring(4, 6), 10) - 1;
            const targetDate = new Date(year, month + offset, 1);
            const yyyy = targetDate.getFullYear();
            const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
            return '' + yyyy + mm;
        }

        function applyResponsiveStyles() {
            if (document.getElementById('gys-responsive-style')) return;
            const style = document.createElement('style');
            style.id = 'gys-responsive-style';
            style.textContent = '' +
                '#gys-custom-panel {' +
                    'position: static !important;' +
                    'margin: 20px auto 40px auto !important;' +
                    'width: 95% !important;' +
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
                        'right: 20px !important;' +
                        'margin: 0 !important;' +
                        'width: 440px !important;' +
                        'max-height: 88vh !important;' +
                        'overflow-y: auto !important;' +
                        'z-index: 999999 !important;' +
                    '}' +
                '}';
            document.head.appendChild(style);
        }

        function createCustomPanel() {
            if (document.getElementById('gys-custom-panel')) return;

            applyResponsiveStyles();
            const defaultYM = getNextMonthYM();

            const savedTimeSeq = safeLocal.get('gys_saved_time_seq') || "15";
            const savedProgramCd = safeLocal.get('gys_saved_program_cd') || "I000221";

            const panel = document.createElement('div');
            panel.id = 'gys-custom-panel';
            
            Object.assign(panel.style, {
                backgroundColor: '#ffffff',
                border: '2px solid #1969c5',
                borderRadius: '10px',
                padding: '15px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                fontFamily: 'Malgun Gothic, sans-serif',
                boxSizing: 'border-box'
            });

            const programOptionsHtml = PROGRAM_LIST.map(function(p) {
                const code = p.item_cd || p.item_code;
                const rawName = p.item_nm || p.item_name;
                const name = formatProgramName(rawName);
                const price = p.sale_amt !== undefined ? p.sale_amt : p.price;
                const isSelected = code === savedProgramCd ? "selected" : "";
                return '<option value="' + code + '" ' + isSelected + '>' + name + ' (' + price.toLocaleString() + '원)</option>';
            }).join('');

            const timeOptionsList = [
                { seq: "10", name: "1부 | 06:30~08:30" },
                { seq: "6",  name: "2부 | 09:00~11:00" },
                { seq: "7",  name: "3부 | 11:30~13:30" },
                { seq: "15", name: "4부 | 14:00~16:00" },
                { seq: "8",  name: "5부 | 16:30~18:30" },
                { seq: "11", name: "6부 | 19:00~21:00" }
            ];

            const timeOptionsHtml = timeOptionsList.map(function(t) {
                const isSelected = String(t.seq) === String(savedTimeSeq) ? "selected" : "";
                return '<option value="' + t.seq + '" ' + isSelected + '>' + t.name + '</option>';
            }).join('');

            panel.innerHTML = '' +
                '<div style="font-weight: bold; font-size: 16px; margin-bottom: 12px; color: #1969c5; border-bottom: 2px solid #1969c5; padding-bottom: 6px;">' +
                    '⛳ 성저파크골프장 Quick 예약' +
                '</div>' +
                '<div style="display: flex; gap: 6px; margin-bottom: 10px; align-items: center;">' +
                    '<button id="gys-prev-month-btn" title="이전 달" style="padding: 7px 12px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">◀</button>' +
                    '<input type="text" id="gys-ym-input" placeholder="YYYYMM" value="' + defaultYM + '" style="width: 100px; padding: 6px 2px; border: 1px solid #cccccc; border-radius: 4px; text-align: center; font-weight: bold; font-size: 15px;">' +
                    '<button id="gys-next-month-btn" title="다음 달" style="padding: 7px 12px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">▶</button>' +
                    '<button id="gys-fetch-btn" title="달력 데이터 조회/새로고침" style="flex: 1; padding: 7px 10px; background-color: #1969c5; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">🔍 조회</button>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 4.2fr 5.8fr; gap: 6px; margin-bottom: 12px;">' +
                    '<div>' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">' +
                            '<label style="font-size: 11px; font-weight: bold; color: #333333;">⏰ 시간대:</label>' +
                            '<button id="gys-refresh-time-btn" title="시간대 목록만 갱신" style="padding: 1px 4px; background-color: #f8f9fa; border: 1px solid #ced4da; border-radius: 3px; cursor: pointer; font-size: 10px;">🔄</button>' +
                        '</div>' +
                        '<select id="gys-time-select" style="width: 100%; height: 36px; padding: 4px 8px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11.5px; font-weight: bold; line-height: 1.3;">' +
                            timeOptionsHtml +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">' +
                            '<label style="font-size: 11px; font-weight: bold; color: #333333;">🎫 상품 선택:</label>' +
                            '<button id="gys-refresh-program-btn" title="상품 목록만 갱신" style="padding: 1px 4px; background-color: #f8f9fa; border: 1px solid #ced4da; border-radius: 3px; cursor: pointer; font-size: 10px;">🔄</button>' +
                        '</div>' +
                        '<select id="gys-program-select" style="width: 100%; height: 36px; padding: 4px 8px; border: 1px solid #cccccc; border-radius: 4px; font-size: 11.5px; font-weight: bold; line-height: 1.3;">' +
                            programOptionsHtml +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 10px 0;">' +
                '<div id="gys-calendar-wrapper" style="width: 100%; box-sizing: border-box;">' +
                    '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 6px; background-color: #f1f3f5; padding: 6px 0; border-radius: 4px;">' +
                        '<span style="color: #d9534f;">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style="color: #0275d8;">토</span>' +
                    '</div>' +
                    '<div id="gys-date-buttons-container" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: 100%; box-sizing: border-box;">' +
                        '<div style="grid-column: span 7; font-size: 12px; color: #666666; text-align: center; padding: 15px 0;">날짜 데이터를 불러오는 중...</div>' +
                    '</div>' +
                '</div>';

            const container = document.getElementById('container') || document.body;
            container.appendChild(panel);

            // 1. 상품 목록만 독립 갱신
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

                const currentVal = programSelectEl.value || safeLocal.get('gys_saved_program_cd') || "I000221";
                const dynamicItems = await fetchItemList(targetDate);
                const listToUse = dynamicItems || PROGRAM_LIST;

                const fragment = document.createDocumentFragment();
                listToUse.forEach(function(p) {
                    const option = document.createElement('option');
                    const code = p.item_cd || p.item_code;
                    const rawName = p.item_nm || p.item_name;
                    const name = formatProgramName(rawName);
                    const price = p.sale_amt !== undefined ? p.sale_amt : p.price;

                    option.value = code;
                    option.textContent = name + ' (' + price.toLocaleString() + '원)';
                    if (code === currentVal) option.selected = true;
                    fragment.appendChild(option);
                });

                programSelectEl.replaceChildren(fragment);
            }

            // 2. 시간대 목록만 독립 갱신
            async function updateTimeSelectOptions(targetDate) {
                const selectEl = document.getElementById('gys-time-select');
                if (!selectEl) return;

                const currentVal = selectEl.value || safeLocal.get('gys_saved_time_seq') || "15";
                const timeData = await fetchTimeSlots(targetDate);

                if (timeData && Array.isArray(timeData) && timeData.length > 0) {
                    const fragment = document.createDocumentFragment();
                    timeData.forEach(function(item) {
                        const option = document.createElement('option');
                        option.value = item.seq;
                        option.textContent = item.time_nm + ' | ' + item.timep;
                        if (String(item.seq) === String(currentVal)) option.selected = true;
                        fragment.appendChild(option);
                    });
                    selectEl.replaceChildren(fragment);
                }
            }

            // 3. 달력 전체 갱신
            async function loadDateList() {
                const inputEl = document.getElementById('gys-ym-input');
                const ymValue = inputEl.value.trim();
                if (!ymValue || ymValue.length !== 6) return;

                const btnContainer = document.getElementById('gys-date-buttons-container');
                btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #1969c5; text-align: center; padding: 15px 0;">날짜 데이터 로딩 중...</div>';

                const firstDayOfMonth = ymValue + '01';

                await updateTimeSelectOptions(firstDayOfMonth);
                await updateProgramSelectOptions(firstDayOfMonth, false);

                const monthData = await fetchMonthStateList(ymValue);
                if (!monthData || !Array.isArray(monthData) || monthData.length === 0) {
                    btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #d9534f; text-align: center; padding: 15px 0;">조회된 날짜 데이터가 없습니다.</div>';
                    return;
                }

                btnContainer.innerHTML = '';

                const curYear = parseInt(ymValue.substring(0, 4), 10);
                const curMonth = parseInt(ymValue.substring(4, 6), 10) - 1;
                const firstDateObj = new Date(curYear, curMonth, 1);
                const startDayOfWeek = firstDateObj.getDay();

                const currentMonthItems = monthData.filter(function(item) {
                    const parts = item.date.split('-');
                    return parseInt(parts[0], 10) === curYear && parseInt(parts[1], 10) === (curMonth + 1);
                });

                // 비활성화 전용 이벤트를 거르는 헬퍼 함수
                function disableEventBlocker(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                    return false;
                }

                // --- 이전 달 비활성화 셀 처리 (button disabled로 완전 차단) ---
                const prevMonthLastDateObj = new Date(curYear, curMonth, 0);
                const prevMonthLastDay = prevMonthLastDateObj.getDate();
                for (let i = startDayOfWeek - 1; i >= 0; i--) {
                    const prevBtn = document.createElement('button');
                    prevBtn.disabled = true;
                    prevBtn.innerHTML = '<div style="position: absolute; top: 5px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: #ced4da; text-align: center; line-height: 1; pointer-events: none;">' + (prevMonthLastDay - i) + '</div>';

                    Object.assign(prevBtn.style, {
                        height: '62px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef',
                        boxSizing: 'border-box', cursor: 'not-allowed', position: 'relative', width: '100%', pointerEvents: 'none'
                    });

                    prevBtn.addEventListener('click', disableEventBlocker, true);
                    btnContainer.appendChild(prevBtn);
                }

                currentMonthItems.forEach(function(item) {
                    const rawDate = item.date;
                    const dayNum = parseInt(rawDate.split('-')[2], 10);
                    const formattedResveDate = rawDate.replace(/-/g, '');
                    const dayOfWeek = new Date(rawDate).getDay();

                    // 날짜 기본 색상 (일요일: 빨강, 토요일: 파랑, 평일: 검정)
                    let textColor = '#333333';
                    if (dayOfWeek === 0) textColor = '#d9534f';
                    if (dayOfWeek === 6) textColor = '#0275d8';

                    // 1. close_advice 값 존재 여부 최우선 확인
                    const hasCloseAdvice = item.close_advice && item.close_advice.trim() !== '';
                    let stateText = hasCloseAdvice ? item.close_advice.trim() : (item.state_nm || '예약마감');
                    let stateColor = '#6c757d'; // 기본 예약마감 (회색)
                    let isAvailable = false;

                    // 2. 텍스트 및 코드에 따른 색상/두께 설정
                    if (stateText.indexOf('예약기간') !== -1) {
                        stateColor = '#d1d5db'; // 예약기간 아님 (연회색)
                    } else if (hasCloseAdvice || item.state_cd === "30" || stateText.indexOf('휴관') !== -1 || stateText.indexOf('대회') !== -1) {
                        stateColor = '#d9534f'; // 휴관일/사유존재 (빨간색)
                    } else if (stateText.indexOf('가능') !== -1) {
                        stateColor = '#0275d8'; // 예약가능 (파란색)
                        isAvailable = true;
                    } else {
                        stateColor = '#6c757d'; // 예약마감 (회색)
                    }

                    const fontWeightStyle = isAvailable ? 'font-weight: bold;' : 'font-weight: normal;';

                    // --- 휴관일 및 사유(close_advice)가 있는 비활성화 셀 처리 (button disabled 적용) ---
                    if (hasCloseAdvice || item.state_cd === "30" || stateText.indexOf('휴관') !== -1) {
                        const closedBtn = document.createElement('button');
                        closedBtn.disabled = true;
                        closedBtn.innerHTML = '' +
                            '<div style="position: absolute; top: 5px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1; pointer-events: none;">' + dayNum + '</div>' +
                            '<div style="position: absolute; bottom: 4px; left: 2px; right: 2px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: ' + stateColor + '; ' + fontWeightStyle + ' line-height: 1.1; word-break: keep-all; text-align: center; pointer-events: none;">' + stateText + '</div>';
                        
                        Object.assign(closedBtn.style, {
                            height: '62px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef',
                            boxSizing: 'border-box', cursor: 'not-allowed', position: 'relative', width: '100%', pointerEvents: 'none'
                        });

                        closedBtn.addEventListener('click', disableEventBlocker, true);
                        btnContainer.appendChild(closedBtn);
                        return;
                    }

                    // --- 예약 가능 / 마감 날짜 버튼 처리 ---
                    const dateBtn = document.createElement('button');
                    dateBtn.className = 'gys-dynamic-date-btn';
                    dateBtn.dataset.baseDay = '' + dayNum;
                    dateBtn.dataset.count = "0";

                    dateBtn.innerHTML = '' +
                        '<div class="gys-day-number" style="position: absolute; top: 5px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: ' + textColor + '; text-align: center; line-height: 1; pointer-events: none;">' + dayNum + '</div>' +
                        '<div class="gys-count-badge" style="position: absolute; top: 22px; left: 0; right: 0; font-size: 11px; font-weight: bold; color: #28a745; text-align: center; line-height: 1; pointer-events: none;"></div>' +
                        '<div style="position: absolute; bottom: 4px; left: 2px; right: 2px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: ' + stateColor + '; ' + fontWeightStyle + ' text-align: center; line-height: 1.1; word-break: keep-all; pointer-events: none;">' +
                            stateText +
                        '</div>';

                    Object.assign(dateBtn.style, {
                        height: '62px', backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '4px',
                        cursor: 'pointer', boxSizing: 'border-box', transition: 'all 0.15s', position: 'relative', width: '100%'
                    });

                    dateBtn.onmouseover = function() { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#e8f4ff'; };
                    dateBtn.onmouseout = function() { if (!dateBtn.disabled && dateBtn.dataset.count === "0") dateBtn.style.backgroundColor = '#ffffff'; };

                    dateBtn.addEventListener('click', async function(e) {
                        e.stopPropagation();
                        const selectedTimeSeq = document.getElementById('gys-time-select').value;
                        const selectedProgramCode = document.getElementById('gys-program-select').value;

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

                // --- 다음 달 비활성화 셀 처리 (button disabled 적용) ---
                const totalCellsSoFar = startDayOfWeek + currentMonthItems.length;
                const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
                for (let nextDayNum = 1; nextDayNum <= remainingCells; nextDayNum++) {
                    const nextBtn = document.createElement('button');
                    nextBtn.disabled = true;
                    nextBtn.innerHTML = '<div style="position: absolute; top: 5px; left: 0; right: 0; font-size: 13px; font-weight: bold; color: #ced4da; text-align: center; line-height: 1; pointer-events: none;">' + nextDayNum + '</div>';

                    Object.assign(nextBtn.style, {
                        height: '62px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef',
                        boxSizing: 'border-box', cursor: 'not-allowed', position: 'relative', width: '100%', pointerEvents: 'none'
                    });

                    nextBtn.addEventListener('click', disableEventBlocker, true);
                    btnContainer.appendChild(nextBtn);
                }
            }

            // 이벤트 리스너 바인딩
            document.getElementById('gys-fetch-btn').addEventListener('click', loadDateList); // 달력 재조회
            
            document.getElementById('gys-refresh-time-btn').addEventListener('click', function() { // 시간대 단독 갱신
                const ymValue = document.getElementById('gys-ym-input').value.trim();
                updateTimeSelectOptions(ymValue + '01');
            });

            document.getElementById('gys-refresh-program-btn').addEventListener('click', function() { // 상품 단독 갱신
                const ymValue = document.getElementById('gys-ym-input').value.trim();
                updateProgramSelectOptions(ymValue + '01', true);
            });

            document.getElementById('gys-prev-month-btn').addEventListener('click', function() {
                const ymInput = document.getElementById('gys-ym-input');
                ymInput.value = addMonthsToYM(ymInput.value.trim(), -1);
                loadDateList();
            });
            document.getElementById('gys-next-month-btn').addEventListener('click', function() {
                const ymInput = document.getElementById('gys-ym-input');
                ymInput.value = addMonthsToYM(ymInput.value.trim(), 1);
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