// ==UserScript==
// @name         고양도시관리공사 자동로그인 및 Quick 예약 툴바
// @namespace    http://tampermonkey.net/
// @version      6.2
// @description  autologin 수동 패널 열기 버튼 추가 및 결제 페이지 자동 체크/결제 제출 준비
// @author       You
// @match        https://yeyak.gys.or.kr/fmcs/102
// @match        https://yeyak.gys.or.kr/fmcs/102?*
// @match        https://yeyak.gys.or.kr/fmcs/27*
// @updateURL    https://raw.githubusercontent.com/kyoungseon/tampermonkey/main/yeyak_gys.user.js
// @downloadURL  https://raw.githubusercontent.com/kyoungseon/tampermonkey/main/yeyak_gys.user.js
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);

    // =============================================================
    // [PART A] 결제 진행 페이지 (?action=write) 처리
    // =============================================================
    if (urlParams.get('action') === 'write') {
        console.log('[Quick Auto] 결제/신청 진행 화면에 진입했습니다.');

        // 💡 추후 보내주실 소스의 선택자(Selector)를 지정할 곳입니다.
        const PAY_CONFIG = {
            CHECKBOX_SELECTOR: 'input[type="checkbox"]', // 동의 체크박스들
            PAY_BUTTON_SELECTOR: '#btn_pay, .btn_pay, button[type="submit"]', // 결제/예약 제출 버튼
            DELAY_MS: 300 // 로딩 후 클릭 대기시간 (ms)
        };

        function handlePaymentPageLogic() {
            setTimeout(() => {
                // 1) 체크박스 자동 선택
                const checkboxes = document.querySelectorAll(PAY_CONFIG.CHECKBOX_SELECTOR);
                if (checkboxes.length > 0) {
                    checkboxes.forEach(cb => {
                        if (!cb.checked) {
                            cb.checked = true;
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                }

                // 2) 결제/예약 신청 버튼 자동 클릭
                const payBtn = document.querySelector(PAY_CONFIG.PAY_BUTTON_SELECTOR);
                if (payBtn) {
                    console.log('[Quick Auto] 결제 버튼을 자동으로 누릅니다.');
                    payBtn.click();
                }
            }, PAY_CONFIG.DELAY_MS);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', handlePaymentPageLogic);
        } else {
            handlePaymentPageLogic();
        }

        return; // 결제 페이지에서는 아래 예약 메인 로직 실행 안 함
    }

    // =============================================================
    // [PART B] 로그인 페이지 (/fmcs/27) 처리
    // =============================================================
    if (currentPath === '/fmcs/27') {
        const rawReferer = urlParams.get('referer');
        const decodedReferer = rawReferer ? decodeURIComponent(rawReferer) : '';

        if (decodedReferer.includes('autologin=true')) {
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
        const isAutoLoginRequested = urlParams.get('autologin') === 'true';

        // 💡 미로그인 상태 시 로그인 페이지로 리다이렉트하는 함수
        function handleAutoLoginRedirect() {
            const loggedIn = (typeof ISLOGIN !== 'undefined') ? ISLOGIN : false;

            if (!loggedIn) {
                console.log('[Quick Auto] 미로그인 상태 확인됨. 로그인 페이지로 즉시 이동합니다.');
                const currentFullUrl = encodeURIComponent(window.location.href);
                window.location.href = `https://yeyak.gys.or.kr/fmcs/27?referer=${currentFullUrl}`;
                return true;
            }
            return false;
        }

        // autologin=true 파라미터가 들어온 경우 즉시 1차 리다이렉트 체크
        if (isAutoLoginRequested) {
            if (handleAutoLoginRedirect()) return;
        }

        // 예비용 기본 상품 목록
        let PROGRAM_LIST = [
            {"item_nm":"온라인 일일입장(경로/복지)","sale_amt":1650,"item_cd":"I000221"},
            {"item_nm":"온라인 일일입장(일반)","sale_amt":3300,"item_cd":"I000222"},
            {"item_nm":"온라인 일일입장(청소년/군인)","sale_amt":2200,"item_cd":"I000227"},
            {"item_nm":"온라인 관외할증(경로/복지)","sale_amt":2470,"item_cd":"I000225"},
            {"item_nm":"온라인 관외할증(일반)","sale_amt":4950,"item_cd":"I000224"},
            {"item_nm":"온라인 관외할증(군인/청소년)","sale_amt":3300,"item_cd":"I000226"}
        ];

        // [1] 데이터 통신 및 예약 신청 함수 (isAutoLink 여부에 따라 탭 분기)
        function custom_set_ticket_resve(resve_date, time_seq, program_code, isAutoLink = false) {
            return new Promise((resolve) => {
                var company_cd = "GYS10";
                var target_program_code = program_code || "I000221";

                if (typeof ISLOGIN !== 'undefined' && !ISLOGIN) {
                    alert('로그인이 필요합니다.');
                    resolve(false);
                    return;
                }

                var member_number = typeof MEM_NO !== 'undefined' ? MEM_NO : '';

                // 패널 터치 시에만 미리 새 탭 개설 (autologin 호출 시에는 현재 창 이동)
                var payTab = null;
                if (!isAutoLink) {
                    payTab = window.open('about:blank', '_blank');
                }

                $.ajax({
                    url: "/rest/dailyuse/set_ticket_resve",
                    data: {
                        company_code: company_cd,
                        program_code: target_program_code,
                        part_code: "03",
                        resve_date: resve_date,
                        time_seq: time_seq,
                        mem_no: member_number,
                        user_cnt: 1,
                        _: Date.now()
                    },
                    method: 'GET',
                    cache: false,
                    dataType: 'json',
                    error: function(xhr, status, error) {
                        if (payTab) payTab.close();
                        alert('예약 요청 중 오류가 발생했습니다: ' + error);
                        resolve(false);
                    },
                    success: function(data) {
                        var result_cd = data.result_code;

                        if (result_cd != 0) {
                            if (payTab) payTab.close();
                            alert(data.result_message || '예약에 실패했습니다.');
                            resolve(false);
                            return;
                        }

                        // 깔끔한 결제 URL 조립
                        var targetUrl = `/fmcs/102?action=write&comcd=${company_cd}&resve_no=${data.r_num}`;

                        // autologin 딥링크 접속 시 파이어폭스 팝업 경고 회피를 위해 현재 창 이동
                        if (isAutoLink) {
                            window.location.href = targetUrl;
                        } else {
                            if (payTab) {
                                payTab.location.href = targetUrl;
                                payTab.focus();
                            } else {
                                window.location.href = targetUrl;
                            }
                        }
                        
                        resolve(true);
                    }
                });
            });
        }

        // [2] API 호출 유틸리티
        async function fetchMonthStateList(yearMonth) {
            const url = `/rest/dailyuse/mon_state_list?company_code=GYS10&part_code=03&resve_mon=${yearMonth}&_=${Date.now()}`;
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
                return await res.json();
            } catch (err) {
                return null;
            }
        }

        async function fetchTimeSlots(targetDate) {
            const url = `/rest/dailyuse/time_state_list?company_code=GYS10&part_code=03&resve_mon=${targetDate}&_=${Date.now()}`;
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
                return await res.json();
            } catch (err) {
                return null;
            }
        }

        async function fetchItemList(targetDate) {
            const isLogged = (typeof ISLOGIN !== 'undefined') ? ISLOGIN : false;
            const memNo = (typeof MEM_NO !== 'undefined') ? MEM_NO : '';

            if (!isLogged || !memNo) return null;

            const url = `/rest/dailyuse/item_list?company_code=GYS10&resve_part_code=03&resve_date=${targetDate}&member_code=${memNo}&_=${Date.now()}`;
            try {
                const res = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) return data;
            } catch (err) {
                console.error('[Quick Auto] 상품 목록 API 호출 실패:', err);
            }
            return null;
        }

        // [3] 날짜 유틸리티
        function getNextMonthYM() {
            const today = new Date();
            const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            const yyyy = nextMonthDate.getFullYear();
            const mm = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
            return `${yyyy}${mm}`;
        }

        function addMonthsToYM(ymStr, offset) {
            if (!ymStr || ymStr.length !== 6) return ymStr;
            const year = parseInt(ymStr.substring(0, 4), 10);
            const month = parseInt(ymStr.substring(4, 6), 10) - 1;
            const targetDate = new Date(year, month + offset, 1);
            const yyyy = targetDate.getFullYear();
            const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
            return `${yyyy}${mm}`;
        }

        // [4] 반응형 스타일 적용
        function applyResponsiveStyles() {
            if (document.getElementById('gys-responsive-style')) return;
            const style = document.createElement('style');
            style.id = 'gys-responsive-style';
            style.innerHTML = `
                #gys-custom-panel {
                    position: static !important;
                    margin: 20px auto 40px auto !important;
                    width: 95% !important;
                    max-width: 500px !important;
                }
                @media (min-width: 769px) {
                    body, #header, header, #container, .alignbox, #section, footer {
                        margin-left: 0 !important;
                        margin-right: auto !important;
                        padding-left: 0 !important;
                    }
                    #container, #section, .alignbox {
                        max-width: 1200px;
                        width: 100%;
                        margin-left: 0 !important;
                        padding-left: 0 !important;
                    }
                    #gys-custom-panel {
                        position: fixed !important;
                        top: 60px !important;
                        right: 20px !important;
                        margin: 0 !important;
                        width: 440px !important;
                        max-height: 88vh !important;
                        overflow-y: auto !important;
                        z-index: 999999 !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // [5] 대시보드 UI 생성 함수
        function createCustomPanel() {
            if (document.getElementById('gys-custom-panel')) return;

            applyResponsiveStyles();
            const defaultYM = getNextMonthYM();

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

            const programOptionsHtml = PROGRAM_LIST.map(p => {
                const code = p.item_cd || p.item_code;
                const name = p.item_nm || p.item_name;
                const price = p.sale_amt !== undefined ? p.sale_amt : p.price;
                const isSelected = code === "I000221" ? "selected" : "";
                return `<option value="${code}" ${isSelected}>${name} (${price.toLocaleString()}원)</option>`;
            }).join('');

            panel.innerHTML = `
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 12px; color: #1969c5; border-bottom: 2px solid #1969c5; padding-bottom: 6px;">
                    ⛳ 성저파크골프장 Quick 예약
                </div>
                
                <div style="display: flex; gap: 6px; margin-bottom: 12px; align-items: center;">
                    <button id="gys-prev-month-btn" title="이전 달"
                            style="padding: 7px 12px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">◀</button>
                    <input type="text" id="gys-ym-input" placeholder="YYYYMM" value="${defaultYM}" 
                           style="width: 100px; padding: 6px 2px; border: 1px solid #cccccc; border-radius: 4px; text-align: center; font-weight: bold; font-size: 15px;">
                    <button id="gys-next-month-btn" title="다음 달"
                            style="padding: 7px 12px; background-color: #6c757d; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">▶</button>
                    <button id="gys-fetch-btn" 
                            style="flex: 1; padding: 7px 10px; background-color: #1969c5; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px;">🔍 조회</button>
                </div>

                <div style="margin-bottom: 10px;">
                    <label style="font-size: 12px; font-weight: bold; display: block; margin-bottom: 4px; color: #333333;">⏰ 시간대 선택:</label>
                    <select id="gys-time-select" style="width: 100%; height: 38px; padding: 6px 8px; border: 1px solid #cccccc; border-radius: 4px; font-size: 13px; font-weight: bold; line-height: 1.4;">
                        <option value="10">1부 | 06:30~08:30</option>
                        <option value="6">2부 | 09:00~11:00</option>
                        <option value="7">3부 | 11:30~13:30</option>
                        <option value="15" selected>4부 | 14:00~16:00</option>
                        <option value="8">5부 | 16:30~18:30</option>
                        <option value="11">6부 | 19:00~21:00</option>
                    </select>
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; font-weight: bold; display: block; margin-bottom: 4px; color: #333333;">🎫 상품 선택:</label>
                    <select id="gys-program-select" style="width: 100%; height: 38px; padding: 6px 8px; border: 1px solid #cccccc; border-radius: 4px; font-size: 13px; font-weight: bold; line-height: 1.4;">
                        ${programOptionsHtml}
                    </select>
                </div>

                <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 10px 0;">

                <div id="gys-calendar-wrapper">
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 6px; background-color: #f1f3f5; padding: 6px 0; border-radius: 4px;">
                        <span style="color: #d9534f;">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style="color: #0275d8;">토</span>
                    </div>
                    <div id="gys-date-buttons-container" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;">
                        <div style="grid-column: span 7; font-size: 12px; color: #666666; text-align: center; padding: 15px 0;">날짜 데이터를 불러오는 중...</div>
                    </div>
                </div>
            `;

            const container = document.getElementById('container') || document.body;
            container.appendChild(panel);

            async function updateProgramSelectOptions(targetDate) {
                const programSelectEl = document.getElementById('gys-program-select');
                if (!programSelectEl) return;

                const dynamicItems = await fetchItemList(targetDate);
                const listToUse = dynamicItems || PROGRAM_LIST;

                programSelectEl.innerHTML = '';
                listToUse.forEach(p => {
                    const option = document.createElement('option');
                    const code = p.item_cd || p.item_code;
                    const name = p.item_nm || p.item_name;
                    const price = p.sale_amt !== undefined ? p.sale_amt : p.price;

                    option.value = code;
                    option.textContent = `${name} (${price.toLocaleString()}원)`;
                    if (code === "I000221") option.selected = true;
                    programSelectEl.appendChild(option);
                });
            }

            async function updateTimeSelectOptions(targetDate) {
                const selectEl = document.getElementById('gys-time-select');
                const timeData = await fetchTimeSlots(targetDate);

                if (timeData && Array.isArray(timeData) && timeData.length > 0) {
                    selectEl.innerHTML = '';
                    timeData.forEach(item => {
                        const option = document.createElement('option');
                        option.value = item.seq;
                        option.textContent = `${item.time_nm} | ${item.timep}`;
                        if (item.seq === 15) option.selected = true;
                        selectEl.appendChild(option);
                    });
                }
            }

            async function loadDateList() {
                const inputEl = document.getElementById('gys-ym-input');
                const ymValue = inputEl.value.trim();
                if (!ymValue || ymValue.length !== 6) return;

                const btnContainer = document.getElementById('gys-date-buttons-container');
                btnContainer.innerHTML = '<div style="grid-column: span 7; font-size: 12px; color: #1969c5; text-align: center; padding: 15px 0;">날짜 데이터 로딩 중...</div>';

                const firstDayOfMonth = `${ymValue}01`;

                await updateTimeSelectOptions(firstDayOfMonth);
                await updateProgramSelectOptions(firstDayOfMonth);

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

                const currentMonthItems = monthData.filter(item => {
                    const parts = item.date.split('-');
                    return parseInt(parts[0], 10) === curYear && parseInt(parts[1], 10) === (curMonth + 1);
                });

                const prevMonthLastDateObj = new Date(curYear, curMonth, 0);
                const prevMonthLastDay = prevMonthLastDateObj.getDate();
                for (let i = startDayOfWeek - 1; i >= 0; i--) {
                    const prevCell = document.createElement('div');
                    prevCell.textContent = `${prevMonthLastDay - i}일`;
                    Object.assign(prevCell.style, {
                        height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: '#f8f9fa', color: '#ced4da', borderRadius: '4px', fontSize: '12px',
                        fontWeight: 'bold', border: '1px solid #e9ecef', cursor: 'not-allowed'
                    });
                    btnContainer.appendChild(prevCell);
                }

                currentMonthItems.forEach(item => {
                    const rawDate = item.date;
                    const dayNum = parseInt(rawDate.split('-')[2], 10);
                    const formattedResveDate = rawDate.replace(/-/g, '');
                    const dayOfWeek = new Date(rawDate).getDay();

                    let textColor = '#333333';
                    if (dayOfWeek === 0) textColor = '#d9534f';
                    if (dayOfWeek === 6) textColor = '#0275d8';

                    if (item.state_cd === "30") {
                        const adviceText = item.close_advice || item.state_nm || '휴관일';
                        const closedCell = document.createElement('div');
                        closedCell.innerHTML = `
                            <span style="font-size:12px; line-height: 1.1; color: #adb5bd;">${dayNum}일</span>
                            <span style="font-size: 9px; color: #d9534f; margin-top: 2px; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-all; text-align: center; max-width: 100%; font-weight: bold;">${adviceText}</span>
                        `;
                        Object.assign(closedCell.style, {
                            height: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            backgroundColor: '#e9ecef', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #dee2e6', boxSizing: 'border-box', padding: '2px', cursor: 'not-allowed'
                        });
                        btnContainer.appendChild(closedCell);
                        return;
                    }

                    const dateBtn = document.createElement('button');
                    dateBtn.className = 'gys-dynamic-date-btn';
                    dateBtn.dataset.baseDay = `${dayNum}`;
                    dateBtn.dataset.count = "0";
                    dateBtn.innerHTML = `<span>${dayNum}일</span>`;

                    Object.assign(dateBtn.style, {
                        height: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: '#ffffff', border: '1px solid #b0c4de', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 'bold', color: textColor, boxSizing: 'border-box', padding: '2px', transition: 'all 0.15s'
                    });

                    dateBtn.onmouseover = () => { if (!dateBtn.disabled) dateBtn.style.backgroundColor = '#e8f4ff'; };
                    dateBtn.onmouseout = () => { if (!dateBtn.disabled && dateBtn.dataset.count === "0") dateBtn.style.backgroundColor = '#ffffff'; };

                    dateBtn.addEventListener('click', async () => {
                        const selectedTimeSeq = document.getElementById('gys-time-select').value;
                        const selectedProgramCode = document.getElementById('gys-program-select').value;

                        dateBtn.disabled = true;
                        dateBtn.style.backgroundColor = '#e9ecef';

                        // 패널 버튼 터치 시 isAutoLink = false (새 탭으로 결제창 열기)
                        const isSuccess = await custom_set_ticket_resve(formattedResveDate, selectedTimeSeq, selectedProgramCode, false);
                        if (isSuccess) {
                            let count = parseInt(dateBtn.dataset.count, 10) + 1;
                            dateBtn.dataset.count = count.toString();
                            dateBtn.innerHTML = `<span>${dayNum}일</span><span style="font-size:10px; color:#28a745;">(${count})</span>`;
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

                const totalCellsSoFar = startDayOfWeek + currentMonthItems.length;
                const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
                for (let nextDayNum = 1; nextDayNum <= remainingCells; nextDayNum++) {
                    const nextCell = document.createElement('div');
                    nextCell.textContent = `${nextDayNum}일`;
                    Object.assign(nextCell.style, {
                        height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: '#f8f9fa', color: '#ced4da', borderRadius: '4px', fontSize: '12px',
                        fontWeight: 'bold', border: '1px solid #e9ecef', cursor: 'not-allowed'
                    });
                    btnContainer.appendChild(nextCell);
                }
            }

            document.getElementById('gys-fetch-btn').addEventListener('click', loadDateList);
            document.getElementById('gys-prev-month-btn').addEventListener('click', () => {
                const ymInput = document.getElementById('gys-ym-input');
                ymInput.value = addMonthsToYM(ymInput.value.trim(), -1);
                loadDateList();
            });
            document.getElementById('gys-next-month-btn').addEventListener('click', () => {
                const ymInput = document.getElementById('gys-ym-input');
                ymInput.value = addMonthsToYM(ymInput.value.trim(), 1);
                loadDateList();
            });

            loadDateList();
        }

        // 💡 [신규 추가] autologin 시 상단 고정 "Quick 예약 패널 열기" 버튼 생성 함수
        function createOpenPanelTriggerBtn() {
            if (document.getElementById('gys-open-panel-trigger')) return;

            const triggerBtn = document.createElement('button');
            triggerBtn.id = 'gys-open-panel-trigger';
            triggerBtn.innerHTML = '⛳ Quick 예약 패널 열기';
            
            Object.assign(triggerBtn.style, {
                position: 'fixed',
                top: '10px',
                right: '10px',
                zIndex: '999999',
                backgroundColor: '#1969c5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                padding: '8px 14px',
                fontWeight: 'bold',
                fontSize: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                cursor: 'pointer'
            });

            triggerBtn.addEventListener('click', () => {
                createCustomPanel();
                triggerBtn.style.display = 'none'; // 클릭 시 패널이 열리고 수동 버튼은 숨김
            });

            document.body.appendChild(triggerBtn);
        }

        // 페이지 로드 이벤트 처리
        window.addEventListener('load', async function() {
            const resveDate = urlParams.get('resve_date');
            const timeSeq   = urlParams.get('time_seq');
            const programCd = urlParams.get('program_cd') || "I000221";

            if (isAutoLoginRequested) {
                if (handleAutoLoginRedirect()) return;

                // 💡 autologin 시에는 패널 자동 생성을 건너뛰는 대신 수동 생성 버튼 표시
                createOpenPanelTriggerBtn();

                if (resveDate && timeSeq) {
                    console.log(`[Quick Auto] 최속 예약 신청 시작: ${resveDate}, seq:${timeSeq}`);
                    // autologin 딥링크 접속 시 isAutoLink = true (현재 창 직접 이동)
                    await custom_set_ticket_resve(resveDate, timeSeq, programCd, true);
                }
            } else {
                // autologin이 아닐 때만 메인 패널 자동 생성
                const isActionWrite = urlParams.get('action') === 'write';
                if (!isActionWrite) {
                    createCustomPanel();
                }
            }
        });
    }
})();