// ==UserScript==
// @name         고양도시관리공사 자동로그인 및 Quick 예약 툴바
// @namespace    http://tampermonkey.net/
// @version      7.9
// @description  sessionStorage 1회성 완전 삭제(Single-use) 적용으로 잔여 플래그 오동작 방지
// @author       You
// @match        https://yeyak.gys.or.kr/fmcs/102
// @match        https://yeyak.gys.or.kr/fmcs/102?*
// @match        https://yeyak.gys.or.kr/fmcs/27*
// @updateURL    https://raw.githubusercontent.com/kyoungseon/tampermonkey/main/yeyak_gys.user.js
// @downloadURL  https://raw.githubusercontent.com/kyoungseon/tampermonkey/main/yeyak_gys.user.js
// @grant        window.close
// ==/UserScript==
(function() {
    'use strict';

    const currentPath = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    const isFromPanelParam = urlParams.get('from_panel') === 'true';

    // =============================================================
    // [PART A] 결제 진행 및 결과 페이지 (action 파라미터 존재 시)
    // =============================================================
    if (actionParam) {
        console.log('[Quick Auto] 특수 상태 페이지 진입 (action:', actionParam, ')');

        // URL 파라미터 또는 세션 메모리에 패널 진입 플래그가 있는지 확인
        const isQuickAutoTab = isFromPanelParam || sessionStorage.getItem('gys_quick_auto') === 'true';

        // 1. 결제 완료 영수증 화면 (action=reg_read) 처리
        if (actionParam === 'reg_read') {
            if (isQuickAutoTab) {
                // 💡 [핵심] 진입 즉시 세션 스토리지를 삭제하여 재사용/재진입 시 오동작 방지
                sessionStorage.removeItem('gys_quick_auto');

                function handleRegReadConfirm() {
                    setTimeout(() => {
                        const isConfirmed = confirm("🎉 예약 및 결제가 정상 완료되었습니다!\n\n현재 탭을 닫으시겠습니까?");
                        if (isConfirmed) {
                            console.log('[Quick Auto] 사용자가 탭 닫기를 선택했습니다.');
                            window.close();
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
            } else {
                console.log('[Quick Auto] 일반 경로 진입 영수증 화면이므로 컨펌창을 띄우지 않습니다.');
            }
            return;
        }

        // 2. 결제 진행 화면 (action=write) 처리
        if (actionParam === 'write') {
            if (isFromPanelParam) {
                // 패널에서 새로 넘어온 경우 세션 메모리에 1회성 플래그 저장
                sessionStorage.setItem('gys_quick_auto', 'true');
            }

            if (isQuickAutoTab) {
                function handlePaymentAutoClick() {
                    setTimeout(() => {
                        const refundCheckbox = document.querySelector('input[name="agree_refund"]');
                        if (refundCheckbox && !refundCheckbox.checked) {
                            refundCheckbox.checked = true;
                            refundCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
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

        // 기타 action 상태가 존재하는 동안은 패널 생성하지 않고 종료
        return;
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

        function handleAutoLoginRedirect() {
            const loggedIn = (typeof ISLOGIN !== 'undefined') ? ISLOGIN : false;

            if (!loggedIn) {
                console.log('[Quick Auto] 미로그인 상태 확인됨. 로그인 페이지로 이동합니다.');
                const currentFullUrl = encodeURIComponent(window.location.href);
                window.location.href = `https://yeyak.gys.or.kr/fmcs/27?referer=${currentFullUrl}`;
                return true;
            }
            return false;
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

        // 완전 순수 타겟 target="_blank"를 통한 무조건 독립 새 탭 분리
        function openPaymentInNewTab(url) {
            const form = document.createElement('form');
            form.method = 'GET';
            form.action = url.split('?')[0];
            form.target = '_blank';

            const queryString = url.split('?')[1];
            if (queryString) {
                const params = new URLSearchParams(queryString);
                params.forEach((value, key) => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = value;
                    form.appendChild(input);
                });
            }

            // 식별용 파라미터 추가
            const panelParamInput = document.createElement('input');
            panelParamInput.type = 'hidden';
            panelParamInput.name = 'from_panel';
            panelParamInput.value = 'true';
            form.appendChild(panelParamInput);

            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
        }

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
                        alert('예약 요청 중 오류가 발생했습니다: ' + error);
                        resolve(false);
                    },
                    success: function(data) {
                        var result_cd = data.result_code;

                        if (result_cd != 0) {
                            alert(data.result_message || '예약에 실패했습니다.');
                            resolve(false);
                            return;
                        }

                        var targetUrl = `/fmcs/102?action=write&comcd=${company_cd}&resve_no=${data.r_num}`;

                        if (isAutoLink) {
                            window.location.href = targetUrl;
                        } else {
                            openPaymentInNewTab(targetUrl);
                        }

                        resolve(true);
                    }
                });
            });
        }

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

        window.addEventListener('load', async function() {
            const resveDate = urlParams.get('resve_date');
            const timeSeq   = urlParams.get('time_seq');
            const programCd = urlParams.get('program_cd') || "I000221";

            if (isAutoLoginRequested) {
                if (handleAutoLoginRedirect()) return;

                if (resveDate && timeSeq) {
                    console.log(`[Quick Auto] 최속 예약 신청 시작: ${resveDate}, seq:${timeSeq}`);
                    await custom_set_ticket_resve(resveDate, timeSeq, programCd, true);
                }
            } else {
                // Query Parameter가 전혀 없는 순수한 /fmcs/102 메인 페이지일 때만 패널 생성
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