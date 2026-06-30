let translationMappings = [];
const SUPABASE_URL = 'https://esdkrapocxzszyyzmurt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZGtyYXBvY3h6c3p5eXptdXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5OTU5OTksImV4cCI6MjA5NDU3MTk5OX0.XGG2vcLuDd9jLRecSllO58eDwZryMinnLTDcSoGs06A';

let problemDataCache = {};
let originalProblemDataCache = {};
let saveCacheTimeout = null;

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7일

function isValidProblemSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    // 디코딩되지 않은 퍼센트 문자가 포함된 긴 문장 필터링
    if (slug.includes('%')) return false;
    // 너무 길거나 짧은 가짜 슬러그 제외
    if (slug.length < 3 || slug.length > 80) return false;
    // 영어 소문자, 숫자, 대시(-)로만 정식 슬러그 구성되어 있는지 검사
    if (!/^[a-z0-9-]+$/.test(slug)) return false;
    // 숫자로만 구성되었거나 대시로만 된 경우 제외
    if (/^\d+$/.test(slug) || /^-+$/.test(slug)) return false;
    // 비문제성(토론, 설정 등) 키워드와 정확히 일치하는 슬러그 제외
    const EXCLUDED_KEYWORDS = ['discussion', 'solution', 'editorial', 'submissions', 'accepted', 'loading', 'rules', 'post', 'findheaderbarsize', 'findtabbarsize', 'findborderbarsize'];
    if (EXCLUDED_KEYWORDS.includes(slug)) return false;
    return true;
}

function isCacheExpired(slug) {
    if (!problemDataCache[slug]) return true;
    const cached = problemDataCache[slug];
    if (!cached.fetchedAt) return true;
    return Date.now() - cached.fetchedAt > CACHE_TTL;
}

function saveCacheToStorage() {
    if (saveCacheTimeout) clearTimeout(saveCacheTimeout);
    saveCacheTimeout = setTimeout(() => {
        browserAPI.storage.local.set({ lk_problem_cache: problemDataCache });
    }, 500);
}

let pendingSlugsToFetch = new Set();
let fetchingSlugs = new Set();
let batchFetchTimeout = null;

function queueSlugFetch(slug) {
    if (!isValidProblemSlug(slug)) return;
    if (pendingSlugsToFetch.has(slug) || fetchingSlugs.has(slug)) return;
    if (slug in problemDataCache && !isCacheExpired(slug)) return;
    pendingSlugsToFetch.add(slug);

    if (batchFetchTimeout) clearTimeout(batchFetchTimeout);
    batchFetchTimeout = setTimeout(async () => {
        const slugsToFetch = Array.from(pendingSlugsToFetch);
        pendingSlugsToFetch.clear();

        if (slugsToFetch.length === 0) return;

        slugsToFetch.forEach(s => fetchingSlugs.add(s));

        try {
            const encodedSlugs = slugsToFetch.map(s => `"${s}"`).join(',');
            const response = await fetch(`${SUPABASE_URL}/rest/v1/problems2?slug=in.(${encodedSlugs})`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            slugsToFetch.forEach(s => {
                problemDataCache[s] = { id: null, title: null, fetchedAt: Date.now() };
            });
            data.forEach(item => {
                problemDataCache[item.slug] = {
                    id: String(item.id),
                    title: item.title,
                    englishTitle: item.english_title,
                    description: item.description,
                    hints: item.hints || [],
                    fetchedAt: Date.now()
                };
            });
            saveCacheToStorage();
            translateProblemList();
        } catch (e) {
            console.error("Failed to batch fetch problem translations by slug", e);
            slugsToFetch.forEach(s => {
                problemDataCache[s] = { id: null, title: null, fetchedAt: Date.now() };
            });
            saveCacheToStorage();
        } finally {
            slugsToFetch.forEach(s => fetchingSlugs.delete(s));
        }
    }, 200);
}

let pendingIdsToFetch = new Set();
let fetchingIds = new Set();
let batchIdFetchTimeout = null;

function queueIdFetch(id) {
    if (pendingIdsToFetch.has(id) || fetchingIds.has(id)) return;
    const cached = Object.values(problemDataCache).find(item => item.id === String(id));
    if (cached && !isCacheExpired(cached.slug || `__id_empty_${id}`)) return;

    pendingIdsToFetch.add(id);

    if (batchIdFetchTimeout) clearTimeout(batchIdFetchTimeout);
    batchIdFetchTimeout = setTimeout(async () => {
        const idsToFetch = Array.from(pendingIdsToFetch);
        pendingIdsToFetch.clear();

        if (idsToFetch.length === 0) return;

        idsToFetch.forEach(id => fetchingIds.add(id));

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/problems2?id=in.(${idsToFetch.join(',')})`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            idsToFetch.forEach(id => {
                problemDataCache[`__id_empty_${id}`] = { id: String(id), title: null, fetchedAt: Date.now() };
            });
            data.forEach(item => {
                problemDataCache[item.slug] = {
                    id: String(item.id),
                    title: item.title,
                    englishTitle: item.english_title,
                    description: item.description,
                    hints: item.hints || [],
                    fetchedAt: Date.now()
                };
            });
            saveCacheToStorage();
            translateProblemList();
        } catch (e) {
            console.error("Failed to batch fetch problem translations by ID", e);
            idsToFetch.forEach(id => {
                problemDataCache[`__id_empty_${id}`] = { id: String(id), title: null, fetchedAt: Date.now() };
            });
            saveCacheToStorage();
        } finally {
            idsToFetch.forEach(id => fetchingIds.delete(id));
        }
    }, 200);
}
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
let isTranslationEnabled = true;
let activeTranslations = {};
let activeHtmlTranslations = {};

function injectStyles() {
    if (document.getElementById('leetcode-korean-styles')) return;
    const style = document.createElement('style');
    style.id = 'leetcode-korean-styles';
    style.textContent = `
        pre, code, .monaco-editor, .ace_editor, [class*="example-block"] pre {
            font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", "Segoe UI Mono", "Liberation Mono", Menlo, Monaco, Consolas, "Courier New", "GulimChe", monospace !important;
        }
        
        /* 인라인 코드 스타일 강제 적용 */
        [data-leetcode-korean-problem-area="true"] code,
        [data-lk-links="true"] code {
            background-color: rgba(0, 0, 0, 0.05) !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            margin: 0 2px !important;
            font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", "Segoe UI Mono", "Liberation Mono", Menlo, Monaco, Consolas, "Courier New", "GulimChe", monospace !important;
            color: inherit !important;
            font-size: 0.9em !important;
        }
        .dark [data-leetcode-korean-problem-area="true"] code,
        [data-theme="dark"] [data-leetcode-korean-problem-area="true"] code,
        .dark [data-lk-links="true"] code,
        [data-theme="dark"] [data-lk-links="true"] code {
            background-color: rgba(255, 255, 255, 0.15) !important;
            color: inherit !important;
        }

        /* 본문 및 힌트 내의 링크 스타일 복원 */
        [data-lk-links="true"] a {
            color: #007aff !important;
            text-decoration: none !important;
            cursor: pointer !important;
            pointer-events: auto !important;
        }
        [data-lk-links="true"] a:hover {
            color: #0056b3 !important;
            text-decoration: underline !important;
        }
        .dark [data-lk-links="true"] a,
        [data-theme="dark"] [data-lk-links="true"] a {
            color: #3b82f6 !important;
        }
        .dark [data-lk-links="true"] a:hover,
        [data-theme="dark"] [data-lk-links="true"] a:hover {
            color: #60a5fa !important;
        }
        
        
        /* 알약형 KO|EN 토글 스위치 스타일 */
        .lk-toggle-container {
            display: inline-flex;
            align-items: center;
            background-color: rgba(0, 0, 0, 0.05);
            border-radius: 9999px;
            padding: 3px;
            user-select: none;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(0, 0, 0, 0.03);
            height: 28px;
            vertical-align: middle;
            margin-left: 8px;
        }
        .dark .lk-toggle-container, [data-theme="dark"] .lk-toggle-container {
            background-color: rgba(255, 255, 255, 0.07);
            border-color: rgba(255, 255, 255, 0.03);
        }
        .lk-toggle-btn {
            padding: 0 12px;
            border-radius: 9999px;
            color: #8c8c8c;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
        }
        .dark .lk-toggle-btn, [data-theme="dark"] .lk-toggle-btn {
            color: rgba(255, 255, 255, 0.6);
        }
        .lk-toggle-btn.active {
            background-color: #00b5ad;
            color: #ffffff !important;
            font-weight: 600;
            box-shadow: 0 1px 3px rgba(0, 181, 173, 0.4);
        }
        .lk-toggle-divider {
            width: 1px;
            height: 12px;
            background-color: rgba(0, 0, 0, 0.12);
            margin: 0 1px;
        }
        .dark .lk-toggle-divider, [data-theme="dark"] .lk-toggle-divider {
            background-color: rgba(255, 255, 255, 0.15);
        }
        .lk-toggle-container:hover {
            background-color: rgba(0, 0, 0, 0.08);
        }
        .dark .lk-toggle-container:hover, [data-theme="dark"] .lk-toggle-container:hover {
            background-color: rgba(255, 255, 255, 0.12);
        }
        
        /* 생년월일 변경 달력 드롭다운 순서 및 연도 표시 변경 */
        .rdp-dropdowns,
        .rdp-caption_dropdowns,
        [class*="rdp-dropdowns"],
        [class*="rdp-caption_dropdowns"] {
            display: inline-flex !important;
            flex-direction: row-reverse !important;
            align-items: center !important;
            gap: 4px !important;
        }
        .rdp-years_dropdown,
        *:has(> .rdp-years_dropdown) {
            order: 1 !important;
        }
        .rdp-months_dropdown,
        *:has(> .rdp-months_dropdown) {
            order: 2 !important;
        }
        .rdp-years_dropdown span {
            white-space: nowrap !important;
        }
        .rdp-years_dropdown span::after {
            content: "년" !important;
            margin-left: 2px !important;
        }
    `;
    const target = document.head || document.documentElement;
    if (target) {
        target.appendChild(style);
    } else {
        const observer = new MutationObserver(() => {
            const t = document.head || document.documentElement;
            if (t) {
                t.appendChild(style);
                observer.disconnect();
            }
        });
        observer.observe(document, { childList: true, subtree: true });
    }
}
injectStyles();

const REGEX_TRANSLATIONS = [
    { pattern: /^(\d+)d\s+(\d{1,2}:\d{2}:\d{2})$/i, replacement: '$1일 $2' },
    { pattern: /^(\d+)d\s+(\d+)h\s+(\d+)m$/i, replacement: '$1일 $2시간 $3분' },
    { pattern: /^(\d+)h\s+(\d+)m\s+(\d+)s$/i, replacement: '$1시간 $2분 $3초' },
    { pattern: /^(\d+)m\s+(\d+)s$/i, replacement: '$1분 $2초' },
    { pattern: /^(\d+)d$/, replacement: '$1일' },
    { pattern: /^(\d+)h$/, replacement: '$1시간' },
    { pattern: /^(\d+)m$/, replacement: '$1분' },
    { pattern: /^(\d+)s$/, replacement: '$1초' },
    { pattern: /^(\d+)ms$/, replacement: '$1ms' },
    { pattern: /^(\d+)KB$/, replacement: '$1KB' },
    { pattern: /^(\d+)MB$/, replacement: '$1MB' },
    { pattern: /^Accepted\s+([\d,.]+)\s*\/\s*([\d,.]+[KMB])$/i, replacement: '맞은 사람 $1 / $2' },
    { pattern: /^([\d,.]+)\s*\/\s*([\d,.]+[KMB])$/, replacement: '$1 / $2' },
    { pattern: /^(\d+)([KMB])$/, replacement: '$1$2' },
    {
        pattern: /^(.*)\s+(is|are)\s+approaching\.?$/i,
        replacement: (match, contests) => {
            let translated = contests.replace(/\s+and\s+/ig, ' 및 ');
            return `${translated}이(가) 다가오고 있습니다!`;
        }
    },
    { pattern: /^Join here!$/i, replacement: '참가 신청하세요!' },
    // 상대 시간 및 기간 번역 (게시글 제목 등에서 부분 일치되는 것을 방지하기 위해 ^, $ 앵커 적용)
    { pattern: /^(\d+) months? ago$/i, replacement: '$1개월 전' },
    { pattern: /^a month ago$/i, replacement: '1달 전' },
    { pattern: /^(\d+) years? ago$/i, replacement: '$1년 전' },
    { pattern: /^a year ago$/i, replacement: '1년 전' },
    { pattern: /^(\d+) days? ago$/i, replacement: '$1일 전' },
    { pattern: /^a day ago$/i, replacement: '하루 전' },
    { pattern: /^yesterday$/i, replacement: '어제' },
    { pattern: /^(\d+) hours? ago$/i, replacement: '$1시간 전' },
    { pattern: /^(1|an) hour ago$/i, replacement: '1시간 전' },
    { pattern: /^(\d+) minutes? ago$/i, replacement: '$1분 전' },
    { pattern: /^(1|a) minute ago$/i, replacement: '1분 전' },
    { pattern: /^(\d+) seconds? ago$/i, replacement: '$1초 전' },
    { pattern: /^a few seconds ago$/i, replacement: '몇 초 전' },
    { pattern: /^in a few seconds$/i, replacement: '몇 초 전' },
    { pattern: /^in (\d+) seconds?$/i, replacement: '$1초 후' },
    { pattern: /^in (\d+) minutes?$/i, replacement: '$1분 후' },
    { pattern: /^in (\d+) hours?$/i, replacement: '$1시간 후' },
    { pattern: /^just now$/i, replacement: '방금 전' },
    { pattern: /^in (\d+) days?$/i, replacement: '$1일 후' },
    { pattern: /^in a day$/i, replacement: '하루 후' },
    { pattern: /^(\d+)\s+Analys(?:is|es)\s+Left$/i, replacement: '분석 횟수 $1회 남음' },
    { pattern: /^Rating:\s*([\d,.]+)/i, replacement: '레이팅: $1' },
    { pattern: /^Attended:\s*([\d,]+)/i, replacement: '참가 횟수: $1' },
    { pattern: /^Avg\. score:\s*([\d,.]+)/i, replacement: '평균 점수: $1' },
    { pattern: /^(\d+)\s+of\s+(\d+)$/i, replacement: '$1 / $2' },
    { pattern: /^Runtime:\s*(.+)$/i, replacement: '실행 시간: $1' },
    { pattern: /^Memory:\s*(.+)$/i, replacement: '메모리: $1' },
    { pattern: /^([\d.]+)%\s*of\s*solutions\s*used\s*(.+)\s*of\s*runtime$/i, replacement: '$1%의 솔루션이 $2의 실행 시간을 기록했습니다' },
    { pattern: /^([\d.]+)%\s*of\s*solutions\s*used\s*(.+)\s*of\s*memory$/i, replacement: '$1%의 솔루션이 $2의 메모리를 사용했습니다' },
    { pattern: /^Show (\d+) Repl(?:y|ies)$/i, replacement: '답글 $1개 보기' },
    {
        pattern: /^submitted at\s+([a-zA-Z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})(?:\s+(\d{2}:\d{2}))?$/i,
        replacement: (match, month, day, year, time) => {
            const m = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 }[month.toLowerCase().substring(0, 3)];
            if (!m) return match;
            return time ? `${year}년 ${m}월 ${day}일 ${time}에 제출됨` : `${year}년 ${m}월 ${day}일에 제출됨`;
        }
    },
    {
        pattern: /^([a-zA-Z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4}),?\s+(\d{1,2}:\d{2})\s+(AM|PM)$/i,
        replacement: (match, month, day, year, time, ampm) => {
            const m = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 }[month.toLowerCase().substring(0, 3)];
            if (!m) return match;
            let [hours, minutes] = time.split(':').map(Number);
            if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
            const hh = String(hours).padStart(2, '0');
            const mm = String(minutes).padStart(2, '0');
            return `${year}년 ${m}월 ${parseInt(day, 10)}일 ${hh}:${mm}`;
        }
    },
    {
        pattern: /^([a-zA-Z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})(?:\s+(\d{2}:\d{2}))?$/i,
        replacement: (match, month, day, year, time) => {
            const m = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 }[month.toLowerCase().substring(0, 3)];
            if (!m) return match;
            return time ? `${year}년 ${m}월 ${day}일 ${time}` : `${year}년 ${m}월 ${day}일`;
        }
    },
    {
        pattern: /^([a-zA-Z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?$/i,
        replacement: (match, month, day) => {
            const m = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 }[month.toLowerCase().substring(0, 3)];
            if (!m) return match;
            return `${m}월 ${parseInt(day, 10)}일`;
        }
    },
    {
        pattern: /([a-zA-Z]{3}),\s+([a-zA-Z]{3,})\s+(\d{1,2}),\s+(?:(\d{4}),\s+)?(\d{1,2}:\d{2})\s+GMT\s*([+-]\d{2}:\d{2})?/i,
        replacement: (match, dayOfWeek, month, day, yearInMatch, time, gmtOffset) => {
            const months = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 };
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const year = yearInMatch || new Date().getFullYear();

            let offsetHours = 0;
            if (gmtOffset) {
                const sign = gmtOffset.startsWith('+') ? 1 : -1;
                offsetHours = sign * parseInt(gmtOffset.substring(1, 3), 10);
            }

            const date = new Date(`${month} ${day}, ${year} ${time} UTC`);
            date.setUTCHours(date.getUTCHours() - offsetHours + 9);

            const m = months[month.toLowerCase().substring(0, 3)];
            const d = date.getUTCDate();
            const dow = days[date.getUTCDay()];
            const hh = String(date.getUTCHours()).padStart(2, '0');
            const mm = String(date.getUTCMinutes()).padStart(2, '0');

            const yearPart = yearInMatch ? `${date.getUTCFullYear()}년 ` : '';
            return `${yearPart}${m}월 ${d}일 (${dow}) ${hh}:${mm}`;
        }
    },
    { pattern: /^(\d{1,2})\/(\d{4})$/, replacement: '$2년 $1월' },
    { pattern: /^Solved\s+([\d,]+)\s+problems?$/i, replacement: '$1문제 해결' },
    { pattern: /^(\d+)\s+Levels?$/i, replacement: '$1 단계' },
    { pattern: /^(\d+\/\d+)\s+Levels?$/i, replacement: '$1 단계' },
    { pattern: /^A verification code has (?:been )?sent to (.+?)\.?$/i, replacement: '인증 코드가 $1로 전송되었습니다.' },
    { pattern: /^We sent a verification code to (.+?)\.?$/i, replacement: '인증 코드를 $1(으)로 전송했습니다.' },
    { pattern: /^(\d+)\s+Selected$/i, replacement: '$1개 선택됨' },
    { pattern: /^Case\s+(\d+)$/i, replacement: '케이스 $1' },
    { pattern: /^submitted at$/i, replacement: '제출 시간:' },
    { pattern: /^Total Participants:\s*([\d,]+)$/i, replacement: '총 참가 인원: $1' },
    { pattern: /^Discussion\s*\(([\d.K]+)\)$/i, replacement: '댓글 ($1)' },
    { pattern: /^Accepted\s+([\d,.\/KMB\s]+)$/i, replacement: '맞은 사람 $1' },
    { pattern: /^(\d+)\s+Questions?$/i, replacement: '$1 문제' },
    { pattern: /^\s*Questions?$/i, replacement: '문제' },
    { pattern: /^([\d,]+)\s+users?$/i, replacement: '$1 유저' },
    {
        pattern: /^\s*topics?$/i,
        replacement: (match) => {
            return window.location.href.includes('/explore/featured/card/') ? '개 토픽' : match;
        }
    },
    { pattern: /^([\d,]+)\s+joined$/i, replacement: '$1명 참가함' },
    { pattern: /^Rank:\s*([\d,]+)$/i, replacement: '순위: $1등' },
    { pattern: /^([\d,]+)\s+incorrect\s+attempt\(s\)$/i, replacement: '오답 $1회' },
    { pattern: /^Add\s+(\d+)\s+questions?\s+to\s+list$/i, replacement: '$1 문제를 리스트에 추가' },
    {
        pattern: /^You are currently under a (\d+)-day cool-off period until (\d{4}-\d{2}-\d{2}) UTC\.\s*During this cool-off period, you can cancel your account deletion\.$/i,
        replacement: (match, days, date) => {
            const [year, month, day] = date.split('-');
            return `현재 ${year}년 ${month}월 ${parseInt(day, 10)}일까지 ${days}일간의 유예 기간 중입니다. 이 기간 동안 계정 삭제를 취소할 수 있습니다.`;
        }
    },
    {
        pattern: /^(\d+)\s+more\s+contests?\s+to\s+unlock\s+Global\s+Ranking\.?$/i,
        replacement: '전체 랭킹을 잠금 해제하려면 대회에 $1번 더 참여해야 합니다.'
    },
    // 인증 수단 선택 라디오 버튼 텍스트
    { pattern: /^WhatsApp to (.+)$/i, replacement: 'WhatsApp으로 $1에 전송' },
    { pattern: /^Email to (.+)$/i, replacement: '이메일로 $1에 전송' },
    { pattern: /^Text message to (.+)$/i, replacement: '문자 메시지로 $1에 전송' },
    { pattern: /^Call to (.+)$/i, replacement: '전화로 $1에 전송' },
    { pattern: /^Voice call to (.+)$/i, replacement: '음성 통화로 $1에 전송' },
    { pattern: /^Starts in\s+(.+)$/i, replacement: (match, time) => `${handleRegexTranslations(time)} 후 시작` },
    { pattern: /^Ends in\s+(.+)$/i, replacement: (match, time) => `${handleRegexTranslations(time)} 후 종료` },
    { pattern: /^Score\s*\((\d+)pt\.\)$/i, replacement: '점수 ($1pt.)' },
    {
        pattern: /^Conv\.\s*(\d+)$/i,
        replacement: (match, n) => `대화 ${n}`
    },

    {
        pattern: /^(\d+)\/(\d+)\s*Lang\.$/i,
        replacement: (match, a, b) => `${a}/${b} 언어`
    },
    {
        pattern: /^Trials?\s*(\d+)$/i,
        replacement: (match, n) => `시도 ${n}`
    },
    {
        pattern: /^(\d+)\/(\d+)\s+testcases?$/i,
        replacement: '$1/$2 테스트 케이스'
    },
    {
        pattern: /^Participated in a contest for the first time \((Weekly|Biweekly) Contest (\d+)\)$/i,
        replacement: '대회 첫 참가 ($1 Contest $2)'
    },
    {
        pattern: /^(\d+)\s+more\s+contests?\s+to\s+unlock\s+Global\s+Ranking\.?$/i,
        replacement: '전체 랭킹을 잠금 해제하려면 대회에 $1번 더 참여해야 합니다.'
    },
    // 인증 수단 선택 라디오 버튼 텍스트
    { pattern: /^WhatsApp to (.+)$/i, replacement: 'WhatsApp으로 $1에 전송' },
    { pattern: /^Email to (.+)$/i, replacement: '이메일로 $1에 전송' },
    { pattern: /^Text message to (.+)$/i, replacement: '문자 메시지로 $1에 전송' },
    { pattern: /^Call to (.+)$/i, replacement: '전화로 $1에 전송' },
    { pattern: /^Voice call to (.+)$/i, replacement: '음성 통화로 $1에 전송' },
    { pattern: /^Code copied\s+for (\S+)$/i, replacement: '$1 코드가 복사되었습니다' },
    { pattern: /^Code copied$/i, replacement: '코드가 복사되었습니다' },
    { pattern: /^for (C\+\+|Java|Python3?|JavaScript|TypeScript|C#|Go|Kotlin|Swift|Rust|Scala|PHP|Ruby|C|Dart|MySQL|Erlang|Elixir|Racket)$/i, replacement: '' },
];

const ALL_PROBLEMS_FETCH_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7일

async function fetchAllProblemTitles() {
    try {
        let offset = 0;
        const limit = 1000;
        let allProblems = [];

        while (true) {
            const url = `${SUPABASE_URL}/rest/v1/problems2?select=id,slug,title,english_title&limit=${limit}&offset=${offset}`;
            const response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (!data || data.length === 0) break;
            allProblems = allProblems.concat(data);
            if (data.length < limit) break;
            offset += limit;
        }

        if (allProblems.length > 0) {
            allProblems.forEach(item => {
                const slug = item.slug;
                if (!slug) return;

                if (problemDataCache[slug]) {
                    problemDataCache[slug].id = String(item.id);
                    problemDataCache[slug].title = item.title;
                    problemDataCache[slug].englishTitle = item.english_title;
                } else {
                    problemDataCache[slug] = {
                        id: String(item.id),
                        title: item.title,
                        englishTitle: item.english_title,
                        fetchedAt: Date.now()
                    };
                }
            });

            browserAPI.storage.local.set({
                lk_problem_cache: problemDataCache,
                lk_all_problems_fetched_at: Date.now()
            });

            translateProblemList();
        }
    } catch (e) {
        console.error("Failed to fetch all problem titles", e);
    }
}

let isProblemJsonEnabled = true;
let currentToggleLanguage = 'KO';

browserAPI.storage.local.get(['translationEnabled', 'useProblemJson', 'preferredLanguage', 'lk_problem_cache', 'lk_all_problems_fetched_at'], (result) => {
    if (result.lk_problem_cache) {
        problemDataCache = Object.assign({}, problemDataCache, result.lk_problem_cache);
    }
    if (result.translationEnabled === false) {
        isTranslationEnabled = false;
        return;
    }

    if (result.useProblemJson === false) {
        isProblemJsonEnabled = false;
    }

    if (result.preferredLanguage) {
        currentToggleLanguage = result.preferredLanguage;
    }

    initProblemTranslation();
    const targetNode = document.documentElement || document;
    mainObserver.observe(targetNode, { childList: true, subtree: true, characterData: true });
    urlObserver.observe(targetNode, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            translateProblemList();
        });
    } else {
        translateProblemList();
    }

    const lastFetchedAt = result.lk_all_problems_fetched_at || 0;
    if (Date.now() - lastFetchedAt > ALL_PROBLEMS_FETCH_INTERVAL) {
        fetchAllProblemTitles();
    }

    fetch(browserAPI.runtime.getURL('src/translations.json'))
        .then(response => response.json())
        .then(data => {
            translationMappings = data;
            updateActiveTranslations();
        })
        .catch(err => console.error('번역 파일을 불러오는데 실패했습니다.', err));
});

function updateActiveTranslations() {
    if (!isTranslationEnabled) return;
    const currentPath = window.location.pathname;

    activeTranslations = {};
    activeHtmlTranslations = {};
    for (const mapping of translationMappings) {
        const isMatch = Array.isArray(mapping.urlPattern)
            ? mapping.urlPattern.some(p => p === "/" ? true : currentPath.includes(p.replace(/\/$/, "")))
            : (mapping.urlPattern === "/" ? true : currentPath.includes(mapping.urlPattern.replace(/\/$/, "")));

        if (isMatch) {
            if (mapping.translations) Object.assign(activeTranslations, mapping.translations);
            if (mapping.htmlTranslations) Object.assign(activeHtmlTranslations, mapping.htmlTranslations);
        }
    }

    if (Object.keys(activeTranslations).length > 0 || Object.keys(activeHtmlTranslations).length > 0) {
        translateNode(document.body);
    }
}

function shouldSkipNode(node) {
    const SKIP_SELECTORS = [
        'pre', 'code', '.monaco-editor', '.ace_editor', '[contenteditable="true"]',
        '.discussion-content', '[data-track-load="discussion_content"]',
        '.markdown-content', '.markdown-body', '.prose',
        '[data-track-load="description_content"]', '.elfjS',
        '[data-leetcode-korean-problem-area="true"]'
    ];
    const parent = node.parentElement;
    if (parent) {
        if (SKIP_SELECTORS.some(selector => parent.closest(selector))) return true;

        const problemDesc = parent.closest('[data-track-load="description_content"], .elfjS');
        if (problemDesc && problemDesc.textContent.trim().length > 50) return true;

        const problemTitle = parent.closest('div[class*="text-title"], a[class*="text-title"], span[class*="text-title"]');
        if (problemTitle && (/^(Q)?\d+\.\s+.+/.test(problemTitle.textContent.trim()) || problemTitle.hasAttribute('data-leetcode-korean-problem-area'))) return true;

        if (parent.closest('[class*="hint" i], [class*="Hint" i]')) return true;
    }

    if (parent && parent.closest('[class*="preview" i]:not(button):not(a)')) {
        const previewElement = parent.closest('[class*="preview" i]:not(button):not(a)');
        if (previewElement.tagName === 'DIV' || previewElement.tagName === 'SECTION') {
            return true;
        }
    }

    if (parent && parent.closest('a[href*="/solutions/"]')) {
        const a = parent.closest('a[href*="/solutions/"]');
        if (/\/solutions\/\d+/.test(a.href)) return true;
    }
    if (node.tagName && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG'].includes(node.tagName)) return true;
    return false;
}



function handleRegexTranslations(text) {
    let newText = text;

    if (/^[\d,.]+[KMB]$/.test(newText)) return newText;
    if (/^[\d,.]+\s*[\/]\s*[\d,.]+[KMB]?$/.test(newText)) return newText;

    const timeLeftMatch = newText.match(/^(\d+|[\d:]+)\s+days?\s+left$/i);
    const solvedMatch = newText.match(/^(\d+(?:\/\d+)?)\s+Solved$/i);
    const beatsMatch = newText.match(/^Beats\s+([\d.]+)%$/i);

    if (timeLeftMatch) {
        newText = /^\d+$/.test(timeLeftMatch[1]) ? `${timeLeftMatch[1]}일 남음` : `${timeLeftMatch[1]} 남음`;
    } else if (/^left$/i.test(newText)) {
        newText = "남음";
    } else if (solvedMatch) {
        newText = `${solvedMatch[1]} 문제 해결`;
    } else if (beatsMatch) {
        const percentage = parseFloat(beatsMatch[1]);
        if (!isNaN(percentage)) newText = `상위 ${(100 - percentage).toFixed(2)}%`;
    }

    for (const { pattern, replacement } of REGEX_TRANSLATIONS) {
        if ((window.location.pathname.includes('/submissions/') || (window.location.pathname.includes('/contest/') && !window.location.pathname.includes('/problems/')) || window.location.pathname.includes('/quest/')) && pattern.source.includes('Accepted')) {
            continue;
        }
        if (window.location.pathname.includes('/subscribe/') && pattern.source.includes('Questions?')) {
            continue;
        }
        if (pattern.test(newText)) {
            newText = newText.replace(pattern, replacement);
            break;
        }
    }
    return newText;
}

function translateTextNode(node) {
    let val = node.nodeValue;

    if (val && val.trim().startsWith("This is the Daily Coding Challenge for")) {
        const parent = node.parentElement;
        if (parent && !parent.hasAttribute('data-translated-makeup-popup')) {
            const fullText = parent.textContent.trim();
            const popupRegex = /^This is the Daily Coding Challenge for ([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\.\s+There\s+(?:is|are)\s+(\d+)\s+incomplete\s+challenges?\s+for\s+([a-zA-Z]+)\s+(\d{4})\s+and\s+you\s+have\s+(\d+)\s+tickets?\s+left\s+for\s+this\s+month\.\s+Are\s+you\s+sure\s+you\s+want\s+to\s+use\s+a\s+ticket\s+to\s+make\s+up\s+this\s+submission\?$/i;
            const match = fullText.match(popupRegex);
            if (match) {
                const [_, m1, d1, y1, count, m2, y2, tickets] = match;
                const months = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 };
                const getMonthNum = (mStr) => months[mStr.toLowerCase().substring(0, 3)] || mStr;
                const month1 = getMonthNum(m1);
                const month2 = getMonthNum(m2);

                safeSetInnerHTML(parent, `이 문제는 ${y1}년 ${month1}월 ${d1}일의 일일 코딩 챌린지입니다. ${y2}년 ${month2}월의 미완료 챌린지가 <span style="color: #00b5ad; font-weight: 600;">${count}</span>개 있으며, 이번 달에 사용할 수 있는 티켓이 <span style="color: #00b5ad; font-weight: 600;">${tickets}</span>장 남았습니다. 티켓을 사용하여 이 스트릭을 복구하시겠습니까?`);
                parent.setAttribute('data-translated-makeup-popup', 'true');
                return;
            }
        }
    }

    if (val && /Consistency is key,\s*see you tomorrow!/i.test(val)) {
        node.nodeValue = val.replace(/Consistency is key,\s*see you tomorrow!/i, "꾸준함이 핵심입니다. 내일 만나요!");
        return;
    }

    if (node.parentElement && node.parentElement.closest('[data-is-streak-container]')) {
        if (/^\s*Streaks?\s*$/i.test(val)) {
            node.nodeValue = val.replace(/Streaks?/i, "일").replace(/^\s+/, "");
            return;
        }
        if (/(\d+)\s*Streaks?/i.test(val)) {
            node.nodeValue = val.replace(/(\d+)\s*Streaks?/i, "현재 스트릭 $1일");
            return;
        }
    }

    if (node.parentElement && node.parentElement.closest('[data-translated-ticket]')) {
        if (/now!/i.test(val)) {
            node.nodeValue = val.replace(/now!/i, "을 구매하세요!");
            return;
        }
    }

    if (node.parentElement && node.parentElement.closest('[data-translated-profile]')) {
        if (val.includes("Thank you for completing your profile!")) {
            node.nodeValue = "프로필 작성을 완료해주셔서 감사합니다! ";
            return;
        }
        if (val.trim() === "here") {
            node.nodeValue = "여기";
            return;
        }
        if (val.trim() === "here.") {
            node.nodeValue = "여기에서 잠금 해제된 초보자용 문제 목록을 확인해보세요.";
            return;
        }
        if (val.trim() === ".") {
            node.nodeValue = "에서 잠금 해제된 초보자용 문제 목록을 확인해보세요.";
            return;
        }
    }

    if (node.parentElement && node.parentElement.closest('[data-translated-welcome]')) {
        if (val.trim().startsWith("Welcome to LeetCode!")) {
            node.nodeValue = "LeetCode에 오신 것을 환영합니다! 새로운 LeetCode 사용자를 위한 필독 ";
            return;
        }
        if (val.trim() === "guide") {
            node.nodeValue = "가이드";
            return;
        }
        if (val.includes("for new LeetCode users")) {
            node.nodeValue = "를 확인하고 LeetCode를 시작해보세요.";
            return;
        }
    }

    const originalText = node.nodeValue.trim();
    if (originalText.length === 0) return;

    if (/^Beats\s*$/i.test(originalText)) {
        let ancestor = node.parentElement;
        let depth = 0;
        while (ancestor && depth < 4) {
            const ancText = ancestor.textContent;
            if (ancText.length > 300) break;
            const beatsMatch = ancText.match(/Beats\s*([\d.]+)%/i);
            if (beatsMatch) {
                if (translateBeatsElement(ancestor, beatsMatch)) {
                    return;
                }
                break;
            }
            ancestor = ancestor.parentElement;
            depth++;
        }
    }

    if (/^\d+d\s+\d{1,2}:\d{2}:\d{2}$/i.test(originalText)) {
        const translated = originalText.replace(/^(\d+)d\s+(\d{1,2}:\d{2}:\d{2})$/i, '$1일 $2');
        if (node.nodeValue !== translated) node.nodeValue = translated;
        return;
    }
    if (/^Starts in\s+\d+d\s+\d{1,2}:\d{2}:\d{2}$/i.test(originalText)) {
        const translated = originalText.replace(/^Starts in\s+(\d+)d\s+(\d{1,2}:\d{2}:\d{2})$/i, '$1일 $2 후 시작');
        if (node.nodeValue !== translated) node.nodeValue = translated;
        return;
    }
    if (/^Ends in\s+\d+d\s+\d{1,2}:\d{2}:\d{2}$/i.test(originalText)) {
        const translated = originalText.replace(/^Ends in\s+(\d+)d\s+(\d{1,2}:\d{2}:\d{2})$/i, '$1일 $2 후 종료');
        if (node.nodeValue !== translated) node.nodeValue = translated;
        return;
    }
    if (/^\d+d\s+\d+h\s+\d+m$/i.test(originalText)) {
        const translated = originalText.replace(/^(\d+)d\s+(\d+)h\s+(\d+)m$/i, '$1일 $2시간 $3분');
        if (node.nodeValue !== translated) node.nodeValue = translated;
        return;
    }
    if (/^Starts in\s+\d+d\s+\d+h\s+\d+m$/i.test(originalText)) {
        const translated = originalText.replace(/^Starts in\s+(\d+)d\s+(\d+)h\s+(\d+)m$/i, '$1일 $2시간 $3분 후 시작');
        if (node.nodeValue !== translated) node.nodeValue = translated;
        return;
    }
    if (/^Ends in\s+\d+d\s+\d+h\s+\d+m$/i.test(originalText)) {
        const translated = originalText.replace(/^Ends in\s+(\d+)d\s+(\d+)h\s+(\d+)m$/i, '$1일 $2시간 $3분 후 종료');
        if (node.nodeValue !== translated) node.nodeValue = translated;
        return;
    }

    if (originalText.toLowerCase() === 's') {
        const prev = node.previousSibling;
        if (prev && /[가-힣]$/.test(prev.textContent.trim())) {
            node.nodeValue = node.nodeValue.replace(/s/i, '');
            return;
        }
    }

    if (originalText.toLowerCase() === 'of') {
        const prev = node.previousSibling;
        const next = node.nextSibling;
        if (prev && next && /^\d+$/.test(prev.textContent.trim()) && /^\d+$/.test(next.textContent.trim())) {
            node.nodeValue = node.nodeValue.replace(/of/i, '/');
            return;
        }
    }

    let translatedText = handleRegexTranslations(originalText);

    const isFeedPage = window.location.pathname === '/' || window.location.pathname.startsWith('/u/');
    const isNavbar = node.parentElement && typeof node.parentElement.closest === 'function' && !!node.parentElement.closest('nav, #navbar, header');
    const isProfilePage = window.location.pathname.startsWith('/u/');
    const skipWordsInFeed = isProfilePage
        ? ['question', 'questions', 'problem', 'problems']
        : ['question', 'questions', 'problem', 'problems', 'solution', 'solutions'];

    if (translatedText !== originalText && skipWordsInFeed.includes(originalText.toLowerCase())) {
        if (isFeedPage && !isNavbar) {
            translatedText = originalText;
        }
    }

    if (translatedText === originalText && !window.location.pathname.includes('/submissions/') && !(window.location.pathname.includes('/contest/') && !window.location.pathname.includes('/problems/')) && !window.location.pathname.includes('/quest/')) {
        if (/^Accepted$/i.test(originalText)) {
            const el = node.parentElement;
            const container = el?.parentElement;
            const contextText = (container?.textContent || el?.textContent || "");

            if (/[\d,.]+\s*[\/]/.test(contextText)) {
                translatedText = '맞은 사람';
            }
        } else if (/^Finished$/i.test(originalText)) {
            translatedText = '실행 완료';
        } else if (/^Users Accepted$/i.test(originalText)) {
            translatedText = '맞은 사람';
        } else if (/^Total Accepted$/i.test(originalText)) {
            translatedText = '전체 맞은 횟수';
        }
    }

    if (translatedText === originalText && activeTranslations[originalText]) {
        if (!node.parentElement?.hasAttribute('data-keep-original-text')) {
            const isPostContent = window.location.pathname.includes('/post-solution/') || window.location.pathname.includes('/discuss/');
            const isMarkdownTag = node.parentElement?.closest('h1, h2, h3, h4, h5, h6, p, blockquote');

            if (isPostContent && isMarkdownTag) {

            } else if (isFeedPage && !isNavbar && skipWordsInFeed.includes(originalText.toLowerCase())) {
            } else {
                translatedText = activeTranslations[originalText];
            }
        }
    }

    if (translatedText !== originalText) {
        if (node._originalValue === undefined) {
            node._originalValue = node.nodeValue;
        }
        node.nodeValue = node.nodeValue.replace(originalText, translatedText);
    }
}

function translateElementAttributes(element) {
    const attrs = ['placeholder', 'title', 'data-title', 'data-tooltip', 'aria-label'];
    attrs.forEach(attr => {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr).trim();
            if (val === "Premium" && (attr === "aria-label" || attr === "title")) return;
            if (attr === 'placeholder' && element.hasAttribute('data-keep-original-placeholder')) return;
            if (attr === 'placeholder' && val === 'Search...') {
                element.setAttribute(attr, '검색');
                return;
            }
            if (activeTranslations[val]) element.setAttribute(attr, activeTranslations[val]);
        }
    });
}

function translateBeatsElement(element, beatsMatch) {
    if (!beatsMatch) {
        beatsMatch = element.textContent.match(/Beats\s*([\d.]+)%/i);
    }
    if (!beatsMatch) return false;

    if (element.textContent.includes('상위')) return false;

    const percentage = parseFloat(beatsMatch[1]);
    if (isNaN(percentage)) return false;

    const topPercentage = (100 - percentage).toFixed(2);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let currNode;
    let didTranslate = false;
    while ((currNode = walker.nextNode())) {
        if (/Beats/i.test(currNode.nodeValue)) {
            currNode.nodeValue = currNode.nodeValue.replace(/Beats/i, "상위 ");
            didTranslate = true;
        }
        if (currNode.nodeValue.includes(beatsMatch[1] + "%")) {
            currNode.nodeValue = currNode.nodeValue.replace(beatsMatch[1] + "%", `${topPercentage}%`);
            didTranslate = true;
        } else if (currNode.nodeValue.includes(beatsMatch[1])) {
            currNode.nodeValue = currNode.nodeValue.replace(beatsMatch[1], topPercentage);
            didTranslate = true;
        }
    }
    return didTranslate;
}

function handleSpecialUIPatterns(element) {
    const originalText = element.textContent.trim();
    if (originalText.length > 3000) return false;

    if (element.matches('div.description')) {
        if (!element.hasAttribute('data-translated-card-topics')) {
            const normalized = originalText.replace(/\s+/g, ' ');
            const match = normalized.match(/^(\d+)\s+topics?\s+-\s+share ideas and ask questions about this card$/i);
            if (match) {
                element.textContent = `${match[1]}개의 토픽: 이 카드에 대한 아이디어 공유 및 질문`;
                element.setAttribute('data-translated-card-topics', 'true');
                return true;
            }
        }

        if (!element.hasAttribute('data-translated-description')) {
            const normalized = originalText.replace(/\s+/g, ' ').trim();
            if (normalized && activeTranslations[normalized]) {
                element.textContent = activeTranslations[normalized];
                element.setAttribute('data-translated-description', 'true');
                return true;
            }
        }
    }

    if (originalText.includes("Thank you for completing your profile!")) {
        element.setAttribute('data-translated-profile', 'true');
    }

    if (originalText.includes("Welcome to LeetCode!") && originalText.includes("guide")) {
        element.setAttribute('data-translated-welcome', 'true');
    }


    if (originalText.includes("Check out our") && (originalText.includes("leaderboard") || originalText.includes("리더보드")) && originalText.length < 400) {
        if (!element.closest('[data-translated-checkout]')) {
            const aTags = Array.from(element.querySelectorAll('a'));
            const leaderboardLink = aTags.find(a => a.textContent.toLowerCase().includes('leaderboard') || a.textContent.includes('리더보드'));
            const contestLink = aTags.find(a => a.textContent.toLowerCase().includes('contest'));

            if (leaderboardLink && contestLink) {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                let checkOutTextNode = null;
                let forTextNode = null;
                let n;
                while ((n = walker.nextNode())) {
                    if (n.nodeValue.includes("Check out our")) checkOutTextNode = n;
                    if (/\bfor\b/i.test(n.nodeValue) && !leaderboardLink.contains(n) && !contestLink.contains(n)) {
                        forTextNode = n;
                    }
                }

                if (checkOutTextNode) {
                    const container = checkOutTextNode.parentElement;

                    checkOutTextNode.nodeValue = checkOutTextNode.nodeValue.replace(/Check out our\s*/i, "");
                    if (forTextNode) {
                        forTextNode.nodeValue = forTextNode.nodeValue.replace(/\s*\bfor\b\s*/i, "");
                    }

                    leaderboardLink.textContent = "리더보드";

                    container.insertBefore(contestLink, checkOutTextNode);
                    container.insertBefore(document.createTextNode("의 "), checkOutTextNode);
                    container.insertBefore(leaderboardLink, checkOutTextNode);
                    container.insertBefore(document.createTextNode("를 확인해 보세요!"), checkOutTextNode);

                    element.setAttribute('data-translated-checkout', 'true');
                }
            }
        }
    }

    if (originalText.includes("has been published") && originalText.length < 800) {
        if (!element.closest('[data-translated-published]')) {
            let isSolutionLink = false;
            const aTags = Array.from(element.querySelectorAll('a'));
            aTags.forEach(a => {
                if (!a.hasAttribute('data-solution-stripped') && /\s+solution\s*$/i.test(a.textContent)) {
                    let stripped = false;
                    const aWalker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, null, false);
                    let n;
                    while ((n = aWalker.nextNode())) {
                        if (/\s+solution\s*$/i.test(n.nodeValue)) {
                            n.nodeValue = n.nodeValue.replace(/\s+solution\s*$/i, "");
                            stripped = true;
                        } else if (n.nodeValue.trim().toLowerCase() === "solution") {
                            n.nodeValue = "";
                            stripped = true;
                        }
                    }
                    if (stripped) {
                        a.setAttribute('data-solution-stripped', 'true');
                        isSolutionLink = true;
                    }
                }
            });

            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let n;
            let replaced = false;
            while ((n = walker.nextNode())) {
                if (n.parentElement && n.parentElement.closest('a')) continue;

                let val = n.nodeValue;

                if (/^\s*The\s*$/i.test(val)) {
                    val = val.replace(/^\s*The\s*/i, "");
                } else if (/^\s*The\s+/i.test(val)) {
                    val = val.replace(/^\s*The\s+/i, "");
                }

                val = val.replace(/\balgorithms\b/i, "알고리즘");
                val = val.replace(/\bdatabase\b/i, "데이터베이스");
                val = val.replace(/\bshell\b/i, "Shell 스크립트");
                val = val.replace(/\bconcurrency\b/i, "동시성");
                val = val.replace(/\bjavascript\b/i, "Javascript");
                val = val.replace(/\bpandas\b/i, "pandas");

                val = val.replace(/\bquestion\b/i, "문제");

                if (/^\s*solution\s*$/i.test(val)) {
                    val = "";
                    isSolutionLink = true;
                } else if (/solution\s+has\s+been\s+published/i.test(val)) {
                    val = val.replace(/\s*solution\s+has\s+been\s+published\.?/i, "의 솔루션이 등록되었습니다.");
                } else if (isSolutionLink) {
                    val = val.replace(/\s*has\s+been\s+published\.?/i, "의 솔루션이 등록되었습니다.");
                } else {
                    val = val.replace(/\s*has\s+been\s+published\.?/i, "이(가) 등록되었습니다.");
                }

                if (n.nodeValue !== val) {
                    n.nodeValue = val;
                    replaced = true;
                }
            }
            if (replaced || isSolutionLink) {
                element.setAttribute('data-translated-published', 'true');
            }
        }
    }

    if (originalText.includes("Top 3 Contestants:")) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while ((n = walker.nextNode())) {
            if (n.nodeValue.includes("Top 3 Contestants:")) {
                n.nodeValue = n.nodeValue.replace(/Top 3 Contestants:/i, "상위 3명 참가자:");
            }
        }
    }

    if (originalText.includes("Today") && originalText.length < 30) {
        const isCalendar = element.closest('.rdp') ||
            element.closest('[class*="calendar"]') ||
            element.closest('[class*="Calendar"]') ||
            element.querySelector('[data-translated-weekday]') ||
            element.closest('div[class*="popover"]') ||
            (element.parentElement && element.parentElement.querySelector('[data-translated-weekday]'));

        if (isCalendar) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let replaced = false;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.trim() === "Today") {
                    node.nodeValue = node.nodeValue.replace("Today", "돌아가기");
                    replaced = true;
                }
            }
            if (replaced) {
                return true;
            }
        }
    }

    if (/Day\s+\d+/i.test(originalText) && originalText.length < 30) {
        let isCalendar = false;
        let current = element;
        for (let depth = 0; depth < 5; depth++) {
            if (!current) break;
            if (
                current.querySelector('[data-translated-weekday]') ||
                (current.classList && (
                    current.classList.contains('rdp') ||
                    Array.from(current.classList).some(c => c.toLowerCase().includes('calendar') || c.toLowerCase().includes('popover'))
                ))
            ) {
                isCalendar = true;
                break;
            }
            current = current.parentElement;
        }

        if (isCalendar) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let replaced = false;
            while ((node = walker.nextNode())) {
                if (/Day\s+\d+/i.test(node.nodeValue)) {
                    node.nodeValue = node.nodeValue.replace(/Day\s+(\d+)/gi, '$1일');
                    replaced = true;
                }
            }
            if (replaced) {
                return true;
            }
        }
    }

    const parent = element.parentElement;
    if (parent && !element.hasAttribute('data-translated-weekday')) {
        const childElements = Array.from(parent.children);
        if (childElements.length >= 7) {
            const texts = childElements.map(el => el.textContent.trim().toUpperCase());
            const targetSequence = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

            for (let i = 0; i <= texts.length - 7; i++) {
                let match = true;
                for (let j = 0; j < 7; j++) {
                    if (texts[i + j] !== targetSequence[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const koreanDays = ['일', '월', '화', '수', '목', '금', '토'];
                    for (let j = 0; j < 7; j++) {
                        const el = childElements[i + j];
                        el.textContent = koreanDays[j];
                        el.setAttribute('data-translated-weekday', 'true');
                    }
                    return true;
                }
            }
        }
    }

    const text = element.textContent.trim();

    if (element.classList && element.classList.contains('btn') && text.replace(/\s+/g, ' ').trim() === "Clear Console") {
        const innerSpan = element.querySelector('.unify-too-small, .split-too-small');
        if (innerSpan && innerSpan.textContent.trim() === "Console") {
            if (element.hasAttribute('data-translated-clear-console')) return true;

            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let clearNode = null;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.includes("Clear")) {
                    clearNode = node;
                    break;
                }
            }

            if (clearNode) {
                innerSpan.textContent = "콘솔";
                clearNode.nodeValue = " 비우기";
                element.insertBefore(innerSpan, clearNode);
                element.setAttribute('data-translated-clear-console', 'true');
                return true;
            }
        }
    }

    if (element.tagName === 'BUTTON' && element.classList.contains('run-code-btn')) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let modified = false;
        while ((node = walker.nextNode())) {
            const val = node.nodeValue.trim();
            if (val === "Run") {
                node.nodeValue = node.nodeValue.replace("Run", "코드");
                modified = true;
            } else if (val === "Code") {
                node.nodeValue = node.nodeValue.replace("Code", "실행");
                modified = true;
            }
        }
        if (modified) return true;
    }

    if (element.tagName === 'SPAN' && element.classList.contains('split-too-small')) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        let modified = false;
        while ((node = walker.nextNode())) {
            const val = node.nodeValue.trim();
            if (val === "Output") {
                node.nodeValue = node.nodeValue.replace("Output", "출력");
                modified = true;
            } else if (val === "Input") {
                node.nodeValue = node.nodeValue.replace("Input", "입력");
                modified = true;
            }
        }
        if (modified) return true;
    }

    if (text === "Ask Leet" && !hasChildWithSameText(element, "Ask Leet")) {
        const span = element.querySelector('span');
        if (span && span.textContent.trim() === "Leet") {
            const clone = span.cloneNode(true);
            element.textContent = '';
            element.appendChild(clone);
            element.appendChild(document.createTextNode('에게 질문하기'));
        } else {
            element.textContent = activeTranslations["Ask Leet"] || "Leet에게 질문하기";
        }
        return true;
    }

    if (handleBannerTranslations(element, text)) return true;
    if (handleKeywordPopovers(element, text)) return true;

    if (/^Conv\.\s*\d+$/.test(text) && window.location.href.includes('/contest/')) {
        const m = text.match(/^Conv\.\s*(\d+)$/i);
        if (m) {
            const result = `대화 ${m[1]}`;
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let first = true;
            while ((node = walker.nextNode())) {
                if (first && node.nodeValue.trim().length > 0) {
                    node.nodeValue = result;
                    first = false;
                } else if (!first) {
                    node.nodeValue = '';
                }
            }
            return true;
        }
    }

    if (/^Trials?\s*\d+$/.test(text) && window.location.href.includes('/contest/')) {
        const m = text.match(/^Trials?\s*(\d+)$/i);
        if (m) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.trim().length > 0) {
                    node.nodeValue = `시도 ${m[1]}`;
                    break;
                }
            }
            return true;
        }
    }

    if (/^\d+\/\d+\s*Lang\.$/.test(text)) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (/Lang\./.test(node.nodeValue)) {
                node.nodeValue = node.nodeValue.replace(/Lang\./, '언어');
                return true;
            }
        }
    }

    if (/^~?\d+\s*Avg\.?\s*Trials?$/.test(text)) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (/Avg/i.test(node.nodeValue)) {
                node.nodeValue = node.nodeValue.replace(/Avg\.?\s*Trials?/i, '평균 시도');
                return true;
            }
        }
    }

    if (/^Solved\s+[\d,]+\s+problems?$/i.test(text)) {
        const m = text.match(/^Solved\s+([\d,]+)\s+problems?$/i);
        if (m) {
            element.setAttribute('data-translated-title', 'true');
            element.textContent = `${m[1]}문제 해결`;
            return true;
        }
    }

    if (/^Your last submission beat ([\d.]+)% of other submissions' (runtime|memory usage)\.?$/i.test(text)) {
        const m = text.match(/^Your last submission beat ([\d.]+)% of other submissions' (runtime|memory usage)\.?$/i);
        if (m) {
            const typeKr = m[2].toLowerCase().includes('runtime') ? '실행 시간' : '메모리 사용량';
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (/Your last submission beat/i.test(node.nodeValue)) {
                    node.nodeValue = '최근 제출이 다른 제출의 ';
                } else if (/of other submissions'/i.test(node.nodeValue)) {
                    node.nodeValue = `보다 ${typeKr} 성능이 우수합니다.`;
                }
            }
            return true;
        }
    }


    if (text.includes("Ranking of") && text.length < 200) {
        const contestLink = element.querySelector('a[href*="/contest/"]');
        if (contestLink) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let replaced = false;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.includes("Ranking of")) {
                    node.nodeValue = node.nodeValue.replace(/Ranking of\s*/i, "");
                    replaced = true;
                }
            }
            if (replaced) {
                const suffix = document.createTextNode(" 순위");
                if (contestLink.nextSibling) {
                    contestLink.parentNode.insertBefore(suffix, contestLink.nextSibling);
                } else {
                    contestLink.parentNode.appendChild(suffix);
                }
                return true;
            }
        }
    }

    const beatsMatch = text.match(/Beats\s*([\d.]+)%/i);
    if (beatsMatch && text.length < 150) {
        if (translateBeatsElement(element, beatsMatch)) {
            return true;
        }
    }

    if (text.includes("Your code is saved to local") && text.includes("enable cloud saving") && text.length < 200) {
        const linkNode = element.querySelector('a');
        if (linkNode && linkNode.textContent.includes("upgrade to Premium")) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let currNode;
            while ((currNode = walker.nextNode())) {
                if (currNode.nodeValue.includes("Your code is saved to local")) {
                    currNode.nodeValue = "작성한 코드가 로컬에 저장되었습니다. 클라우드 저장을 활성화하려면";
                } else if (currNode.nodeValue.includes("to enable cloud saving")) {
                    currNode.nodeValue = "을 구독해 주세요.";
                }
            }
            linkNode.textContent = "프리미엄";
            return true;
        }
    }

    const earnMatch = text.match(/^Earn\s+(.+)$/i);
    if (earnMatch && text.length < 50) {
        let hasChildWithSameEarn = false;
        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 1 && element.childNodes[i].textContent.trim().match(/^Earn\s+(.+)$/i)) {
                hasChildWithSameEarn = true;
                break;
            }
        }
        if (!hasChildWithSameEarn) {
            let earnRemoved = false;
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let currNode;
            while ((currNode = walker.nextNode())) {
                if (/^Earn\s*/i.test(currNode.nodeValue.trim())) {
                    currNode.nodeValue = currNode.nodeValue.replace(/Earn\s*/i, "");
                    earnRemoved = true;
                }
            }
            if (earnRemoved) {
                element.appendChild(document.createTextNode(" 획득하기"));
            }
        }
    }

    if (text.includes("Completed a daily challenge for") && text.length < 150) {
        let hasChildWithSamePrefix = false;
        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 1 && element.childNodes[i].textContent.trim().startsWith("Completed a daily challenge for")) {
                hasChildWithSamePrefix = true;
                break;
            }
        }
        if (!hasChildWithSamePrefix) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let prefixFound = false;
            while ((node = walker.nextNode())) {
                if (/Completed a daily challenge for\s*/i.test(node.nodeValue)) {
                    node.nodeValue = node.nodeValue.replace(/Completed a daily challenge for\s*/i, "");
                    prefixFound = true;
                }
            }
            if (prefixFound) {
                element.appendChild(document.createTextNode("의 일일 챌린지 완료"));
                return true;
            }
        }
    }

    if (text.startsWith("Completed an explore card:") && text.length < 200) {
        if (translationMappings.length === 0) return false;

        if (!element.hasAttribute('data-translated-explore-card')) {
            const exploreMapping = translationMappings.find(m => {
                const patterns = Array.isArray(m.urlPattern) ? m.urlPattern : [m.urlPattern];
                return patterns.some(p => typeof p === 'string' && p.toLowerCase().includes('explore'));
            });
            const exploreTranslations = exploreMapping ? exploreMapping.translations : {};

            const allTranslations = {};
            for (const mapping of translationMappings) {
                if (mapping.translations) {
                    Object.assign(allTranslations, mapping.translations);
                }
            }

            const targetTranslations = Object.assign({}, allTranslations, exploreTranslations);
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let replaced = false;
            while ((node = walker.nextNode())) {
                let val = node.nodeValue;
                if (/Completed\s+an\s+explore\s+card:\s*/i.test(val)) {
                    val = val.replace(/Completed\s+an\s+explore\s+card:\s*/gi, "학습 카드 완료: ");
                    replaced = true;
                }

                const sortedKeys = Object.keys(targetTranslations).sort((a, b) => b.length - a.length);
                for (const key of sortedKeys) {
                    if (key.length > 2 && val.includes(key)) {
                        val = val.replace(key, targetTranslations[key]);
                        replaced = true;
                        break;
                    }
                }

                if (node.nodeValue !== val) {
                    node.nodeValue = val;
                }
            }
            if (replaced) {
                element.setAttribute('data-translated-explore-card', 'true');
                return true;
            }
        }
    }

    if (/\d+\s*Streaks?/i.test(text) && text.length < 50) {
        let hasChildWithSameText = false;
        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 1 && /\d+\s*Streaks?/i.test(element.childNodes[i].textContent)) {
                hasChildWithSameText = true;
                break;
            }
        }
        if (!hasChildWithSameText) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let replacedFull = false;
            let foundNumber = false;
            while ((node = walker.nextNode())) {
                if (/(\d+)\s*Streaks?/i.test(node.nodeValue)) {
                    node.nodeValue = node.nodeValue.replace(/(\d+)\s*Streaks?/i, "현재 스트릭 $1일");
                    replacedFull = true;
                }

                if (/Consistency is key,\s*see you tomorrow!/i.test(node.nodeValue)) {
                    node.nodeValue = node.nodeValue.replace(/Consistency is key,\s*see you tomorrow!/i, "꾸준함이 핵심입니다. 내일 만나요!");
                }
            }
            if (replacedFull) {
                element.setAttribute('data-is-streak-container', 'true');
            }
            if (!replacedFull) {
                let numberNodes = [];
                let streakNodes = [];
                const walker2 = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                while ((node = walker2.nextNode())) {
                    if (/\d+/.test(node.nodeValue)) {
                        numberNodes.push(node);
                    }
                    if (/Streaks?/i.test(node.nodeValue)) {
                        streakNodes.push(node);
                    }
                }

                if (numberNodes.length > 0 && streakNodes.length > 0) {
                    let firstNumNode = numberNodes[0];
                    let lastStreakNode = streakNodes[streakNodes.length - 1];

                    let targetBefore = firstNumNode;
                    if (firstNumNode.parentNode !== element && firstNumNode.parentNode.nodeType === 1) {
                        targetBefore = firstNumNode.parentNode;
                    }

                    let alreadyPrefixed = false;
                    let prev = targetBefore.previousSibling;
                    if (prev) {
                        if (prev.nodeType === 3 && prev.nodeValue.includes("현재 스트릭")) alreadyPrefixed = true;
                        if (prev.nodeType === 1 && prev.textContent.includes("현재 스트릭")) alreadyPrefixed = true;
                    }

                    if (!alreadyPrefixed) {
                        let prefixElement;
                        if (lastStreakNode.parentNode !== element && lastStreakNode.parentNode.nodeType === 1) {
                            prefixElement = lastStreakNode.parentNode.cloneNode(false);
                            prefixElement.textContent = "현재 스트릭 ";
                        } else {
                            prefixElement = document.createTextNode("현재 스트릭 ");
                        }

                        if (targetBefore.parentNode) {
                            targetBefore.parentNode.insertBefore(prefixElement, targetBefore);
                        }
                    }

                    streakNodes.forEach(node => {
                        node.nodeValue = node.nodeValue.replace(/Streaks?/i, "일").replace(/^\s+/, "");
                    });

                    element.setAttribute('data-is-streak-container', 'true');
                }
            }
            return true;
        }
    }

    if (text.includes("Buy Time Travel Ticket") && text.includes("now!")) {
        const linkNode = element.querySelector('a');
        if (linkNode && linkNode.textContent.includes("Buy Time Travel Ticket")) {
            linkNode.textContent = "스트릭 티켓";
            element.setAttribute('data-translated-ticket', 'true');
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let n;
            while ((n = walker.nextNode())) {
                if (n.nodeValue.includes("now!")) {
                    n.nodeValue = n.nodeValue.replace(/now!/i, "을 구매하세요!");
                }
            }
            return true;
        }
    }

    const AUTH_METHOD_MAP = [
        { regex: /^WhatsApp to\s+/i, prefix: 'WhatsApp으로 인증:\u00a0' },
        { regex: /^Email to\s+/i, prefix: '이메일로 인증: \u00a0', suffix: '' },
        { regex: /^Text message to\s+/i, prefix: '문자 메시지로 인증:\u00a0', suffix: '' }
    ];
    for (const { regex, prefix, suffix = '' } of AUTH_METHOD_MAP) {
        if (regex.test(text) && !element.hasAttribute('data-translated-auth-method')) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            const firstNode = walker.nextNode();
            if (!firstNode) continue;

            if (regex.test(firstNode.nodeValue)) {
                firstNode.nodeValue = firstNode.nodeValue.replace(regex, prefix);
                element.appendChild(document.createTextNode(suffix));
            } else {
                const fullRegex = new RegExp(regex.source + '(.+)$', 'i');
                firstNode.nodeValue = firstNode.nodeValue.replace(fullRegex, (_, dest) => prefix + dest + suffix);
            }
            element.setAttribute('data-translated-auth-method', 'true');
            return true;
        }
    }

    return false;
}

function handleKeywordPopovers(element, text) {
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    const KEYWORD_DEFS = {
        // substring-nonempty
        "A substring is a contiguous non-empty sequence of characters within a string.":
            "<strong>부분 문자열</strong>은 문자열 내의 연속적이고 <strong>비어 있지 않은</strong> 문자 시퀀스입니다.",
        // palindromic-string
        "A string is palindromic if it reads the same forward and backward.":
            "문자열이 <strong>팰린드롬</strong>이라는 것은 앞에서부터 읽었을 때와 뒤에서부터 읽었을 때가 동일한 경우를 의미합니다.",
        // palindrome-integer
        "An integer is a palindrome when it reads the same forward and backward. For example, 121 is a palindrome while 123 is not.":
            "<p>정수가 <strong>팰린드롬</strong>이라는 것은 앞에서부터 읽었을 때와 뒤에서부터 읽었을 때가 동일한 경우를 의미합니다.</p><p style='margin-top: 8px;'>예를 들어, <code>121</code>은 팰린드롬이지만 <code>123</code>은 아닙니다.</p>",
        // frequency-array
        "The frequency of an element x is the number of times it occurs in the array.":
            "요소 <code>x</code>의 <strong>빈도</strong>는 해당 요소가 배열에 나타나는 횟수를 의미합니다.",
        // permutation-array
        "A permutation is a rearrangement of all the elements of an array.":
            "<strong>순열</strong>은 배열의 모든 요소를 재배치한 것을 의미합니다.",
        // anagram
        "An anagram is a word or phrase formed by rearranging the letters of a different word or phrase, using all the original letters exactly once.":
            "<strong>애너그램</strong>은 다른 단어나 구의 문자를 재배치하여 만든 단어 혹은 구로, 모든 원래 문자를 정확히 한 번씩 사용해야 합니다.",
        // subarray-nonempty
        "A subarray is a contiguous non-empty sequence of elements within an array.":
            "<strong>부분 배열</strong>은 배열 내의 연속적이고 <strong>비어 있지 않은</strong> 요소들의 시퀀스입니다.",
        // subset
        "A subset of an array is a selection of elements (possibly none) of the array.":
            "배열의 <strong>부분 집합</strong>은 배열의 요소들 중 일부(하나도 선택하지 않는 경우 포함)를 선택한 것입니다.",
        // subtree
        "A subtree of treeName is a tree consisting of a node in treeName and all of its descendants.":
            "<code>treeName</code>의 <strong>서브트리</strong>는 <code>treeName</code> 내의 노드와 그 노드의 모든 후손으로 구성된 트리입니다.",
        // height-balanced
        "A height-balanced binary tree is a binary tree in which the depth of the two subtrees of every node never differs by more than one.":
            "<strong>높이 균형</strong> 이진 트리는 모든 노드의 두 서브트리의 깊이 차이가 1보다 크지 않은 이진 트리를 의미합니다.",
        // palindrome-string
        "A substring is a contiguous non-empty sequence of characters within a string.":
            "<strong>부분 문자열</strong>은 문자열 내의 연속적이고 <strong>비어 있지 않은</strong> 문자 시퀀스입니다.",
        // set-bit
        "A set bit refers to a bit in the binary representation of a number that has a value of 1.":
            "<strong>1로 설정된 비트</strong>는 숫자의 이진 표현에서 값이 <code>1</code>인 비트를 의미합니다.",
        // frequency-textfile
        "The frequency of a word x is the number of times it occurs in the text file.":
            "단어 <code>x</code>의 <strong>빈도</strong>는 텍스트 파일에 해당 단어가 나타나는 횟수를 의미합니다.",
        // palindrome-sequence
        "A palindrome is a sequence that reads the same forward and backward.":
            "<strong>팰린드롬</strong>은 앞으로 읽으나 뒤로 읽으나 동일한 순서를 가진 서열을 의미합니다.",
        // subsequence-array
        "A subsequence is an array that can be derived from another array by deleting some or no elements without changing the order of the remaining elements.":
            "<strong>부분 수열</strong>은 원래 배열에서 일부 요소를 삭제하거나 삭제하지 않고, 남은 요소들의 순서를 바꾸지 않은 채 얻을 수 있는 배열을 의미합니다.",
        // lexicographically-smaller-string
        "A string a is lexicographically smaller than a string b if in the first position where a and b differ, string a has a letter that appears earlier in the alphabet than the corresponding letter in b. If the first min(a.length, b.length) characters do not differ, then the shorter string is the lexicographically smaller one.":
            "문자열 <code>a</code>가 문자열 <code>b</code>보다 <strong>사전순으로 작다</strong>는 것은, <code>a</code>와 <code>b</code>가 처음으로 달라지는 위치에서 <code>a</code>의 문자가 <code>b</code>의 해당 문자보다 알파벳 순서상 앞에 오는 경우를 의미합니다. 만약 처음 <code>min(a.length, b.length)</code>개의 문자가 모두 같다면, 더 짧은 문자열이 사전순으로 더 작은 문자열입니다.",
        // array-intersection
        "The intersection of two arrays is defined as the set of elements that are present in both arrays.":
            "두 배열의 <strong>교집합</strong>은 두 배열 모두에 존재하는 요소들의 집합으로 정의됩니다.",
        // subsequence-string
        "A subsequence is a string that can be derived from another string by deleting some or no characters without changing the order of the remaining characters.":
            "<strong>부분 수열</strong>은 원래 문자열에서 일부 문자를 삭제하거나 삭제하지 않고, 남은 문자들의 순서를 바꾸지 않은 채 얻을 수 있는 문자열을 의미합니다.",
        // permutation-string
        "A permutation is a rearrangement of all the characters of a string.":
            "<strong>순열</strong>은 문자열의 모든 문자를 재배치한 것을 의미합니다.",
        // lexicographically-smaller-array
        "An array a is lexicographically smaller than an array b if in the first position where a and b differ, array a has an element that is less than the corresponding element in b. If the first min(a.length, b.length) elements do not differ, then the shorter array is the lexicographically smaller one.":
            "배열 <code>a</code>가 배열 <code>b</code>보다 <strong>사전순으로 작다</strong>는 것은, <code>a</code>와 <code>b</code>가 처음으로 달라지는 위치에서 <code>a</code>의 요소가 <code>b</code>의 해당 요소보다 작은 경우를 의미합니다. 만약 처음 <code>min(a.length, b.length)</code>개의 요소가 모두 같다면, 더 짧은 배열이 사전순으로 더 작은 배열입니다.",
        // strictly-increasing-array
        "An array is said to be strictly increasing if each element is strictly greater than its previous one (if exists).":
            "배열의 각 요소가 이전 요소보다 (존재하는 경우) <strong>엄격하게 크다</strong>면, 그 배열은 <strong>엄격하게 증가</strong>한다고 합니다.",
        // prime-number
        "A prime number is a natural number greater than 1 with only two factors, 1 and itself.":
            "<strong>소수</strong>는 1보다 큰 자연수 중 1과 자기 자신만을 약수로 갖는 수를 의미합니다.",
        // perfect-square
        "A perfect square is a number that can be expressed as the product of an integer by itself, like 1, 4, 9, 16.":
            "<strong>완전 제곱수</strong>는 <code>1, 4, 9, 16</code>과 같이 어떤 정수를 자기 자신과 곱하여 얻을 수 있는 수를 의미합니다.",
        // prefix
        "A prefix of a string is a substring that starts from the beginning of the string and extends to any point within it.":
            "문자열의 <strong>접두사</strong>는 문자열의 시작부터 임의의 지점까지 이어지는 부분 문자열입니다.",
        // suffix
        "A suffix of a string is a substring that begins at any point in the string and extends to its end.":
            "문자열의 <strong>접미사</strong>는 문자열의 임의의 지점부터 끝까지 이어지는 부분 문자열입니다.",
        // subarray
        "A subarray is a contiguous sequence of elements within an array.":
            "<strong>부분 배열</strong>은 배열 내의 연속적인 요소들의 시퀀스입니다.",
        // submatrix
        "A submatrix (x1, y1, x2, y2) is a matrix that forms by choosing all cells matrix[x][y] where x1 <= x <= x2 and y1 <= y <= y2.":
            "<strong>부분 행렬</strong> <code>(x1, y1, x2, y2)</code>는 <code>x1 <= x <= x2</code> 및 <code>y1 <= y <= y2</code>를 만족하는 모든 셀 <code>matrix[x][y]</code>를 선택하여 형성된 행렬입니다.",
        // substring
        "A substring is a contiguous sequence of characters within a string.":
            "<strong>부분 문자열</strong>은 문자열 내의 연속적인 문자들의 시퀀스입니다.",
        // frequency-letter
        "The frequency of a letter x is the number of times it occurs in the string.":
            "문자 <code>x</code>의 <strong>빈도</strong>는 해당 문자가 문자열에 나타나는 횟수를 의미합니다.",
        // binary-array
        "A binary array is an array which contains only 0 and 1.":
            "<strong>이진 배열</strong>은 0과 1만을 포함하는 배열입니다.",
        // manhattan-distance
        "The Manhattan Distance between two cells (xi, yi) and (xj, yj) is |xi - xj| + |yi - yj|.":
            "두 셀 <code>(xi, yi)</code>와 <code>(xj, yj)</code> 사이의 <strong>맨해튼 거리</strong>는 <code>|xi - xj| + |yi - yj|</code>입니다.",
        // strictly-decreasing-array
        "An array is said to be strictly decreasing if each element is strictly smaller than its previous one (if exists).":
            "배열의 각 요소가 이전 요소보다 (존재하는 경우) <strong>엄격하게 작다</strong>면, 그 배열은 <strong>엄격하게 감소</strong>한다고 합니다.",
        // permutation
        "A permutation is a rearrangement of all the elements of a set.":
            "<strong>순열</strong>은 집합의 모든 요소를 재배치한 것을 의미합니다.",
        // gcd-function
        "The term gcd(a, b) denotes the greatest common divisor of a and b.":
            "용어 <code>gcd(a, b)</code>는 <code>a</code>와 <code>b</code>의 <strong>최대공약수</strong>를 나타냅니다.",
        // lcm-function
        "The term lcm(a, b) denotes the least common multiple of a and b.":
            "용어 <code>lcm(a, b)</code>는 <code>a</code>와 <code>b</code>의 <strong>최소공배수</strong>를 나타냅니다.",
        // array-prefix
        "A prefix of an array is a subarray that starts from the beginning of the array and extends to any point within it.":
            "배열의 <strong>접두사</strong>는 배열의 시작부터 임의의 지점까지 이어지는 부분 배열입니다.",
        // subsequence-sequence-nonempty
        "A subsequence is a non-empty sequence that can be derived from another sequence by deleting some or no elements without changing the order of the remaining elements.":
            "<strong>부분 수열</strong>은 원래 수열에서 순서를 바꾸지 않고 일부 요소를 삭제하거나 삭제하지 않고 얻을 수 있는 <strong>비어 있지 않은</strong> 수열입니다.",
        // subsequence-string-nonempty
        "A subsequence is a non-empty string that can be derived from another string by deleting some or no characters without changing the order of the remaining characters.":
            "<strong>부분 수열</strong>은 원래 문자열에서 순서를 바꾸지 않고 일부 문자를 삭제하거나 삭제하지 않고 얻을 수 있는 <strong>비어 있지 않은</strong> 문자열입니다.",
        // subtree-of-node
        "In a rooted tree, the subtree of some node v is the set of all vertices whose their path to the root, contains v.":
            "루트가 있는 트리에서 어떤 노드 <code>v</code>의 <strong>서브트리</strong>는 루트까지의 경로에 <code>v</code>를 포함하는 모든 정점의 집합입니다.",
        // subsequence-array-nonempty
        "A subsequence is an non-empty array that can be derived from another array by deleting some or no elements without changing the order of the remaining elements.":
            "<strong>부분 수열</strong>은 원래 배열에서 순서를 바꾸지 않고 일부 요소를 삭제하거나 삭제하지 않고 얻을 수 있는 <strong>비어 있지 않은</strong> 배열입니다.",
        // subsequence-sequence
        "A subsequence is a sequence that can be derived from another sequence by deleting some or no elements without changing the order of the remaining elements.":
            "<strong>부분 수열</strong>은 원래 수열에서 순서를 바꾸지 않고 일부 요소를 삭제하거나 삭제하지 않고 얻을 수 있는 수열입니다.",
        "A subsequence is a sequence that can be derived from another sequence by deleting zero or more elements without changing the order of the remaining elements.":
            "<strong>부분 수열</strong>은 원래 수열에서 순서를 바꾸지 않고 0개 이상의 요소를 삭제하여 얻을 수 있는 수열입니다.",
        "A palindrome is a string that reads the same backward as forward.":
            "팰린드롬은 앞뒤가 똑같이 읽히는 문자열을 의미합니다.",
    };

    if (KEYWORD_DEFS[normalizedText]) {
        const doc = new DOMParser().parseFromString(KEYWORD_DEFS[normalizedText], 'text/html');
        element.replaceChildren(...doc.body.childNodes);
        return true;
    }
    return false;
}

function hasChildWithSameText(element, text) {
    for (const child of element.childNodes) {
        if (child.nodeType === 1 && child.textContent.trim() === text) return true;
    }
    return false;
}

function handleBannerTranslations(element, text) {

    const normalizedText = text.replace(/\s+/g, ' ').trim();

    if (normalizedText.includes("Join our next Contest") && (normalizedText.includes("Weekly Contest") || normalizedText.includes("Biweekly Contest"))) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes("Join our next Contest")) {
                let parentEl = node.parentNode;
                while (parentEl && parentEl !== element) {
                    const parentText = parentEl.textContent.replace(/\s+/g, ' ').trim();
                    if (parentText.includes("Join our next Contest") && parentEl.querySelector('a[href*="/contest/"]')) {
                        break;
                    }
                    parentEl = parentEl.parentNode;
                }
                if (parentEl && parentEl !== element && !parentEl.hasAttribute('data-translated-contest-join')) {
                    const pWalker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT, null, false);
                    let pNode;
                    let replaced = false;
                    while ((pNode = pWalker.nextNode())) {
                        if (pNode.nodeValue.includes("Join our next Contest")) {
                            pNode.nodeValue = pNode.nodeValue.replace(/\s*Join our next Contest\s*/i, "다음 대회 ");
                            replaced = true;
                            break;
                        }
                    }
                    if (replaced) {
                        const linkNode = parentEl.querySelector('a[href*="/contest/"]');
                        if (linkNode) {
                            const suffix = document.createTextNode("에 참여해보세요!");
                            if (linkNode.nextSibling) {
                                linkNode.parentNode.insertBefore(suffix, linkNode.nextSibling);
                            } else {
                                linkNode.parentNode.appendChild(suffix);
                            }
                            parentEl.setAttribute('data-translated-contest-join', 'true');
                            return true;
                        }
                    }
                }
            }
        }
    }

    if (normalizedText.includes("An anonymous user posted") && window.location.pathname === '/') {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes("An anonymous user")) {
                let parentEl = node.parentNode;
                while (parentEl) {
                    const parentText = parentEl.textContent.replace(/\s+/g, ' ').trim();
                    if (parentText.includes("An anonymous user posted") && parentEl.querySelector('a')) {
                        break;
                    }
                    if (parentEl === element) break;
                    parentEl = parentEl.parentNode;
                }
                if (parentEl && !parentEl.hasAttribute('data-translated-anonymous-post')) {
                    const pWalker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT, null, false);
                    let pNode;
                    let foundUser = false;
                    let foundPosted = false;
                    while ((pNode = pWalker.nextNode())) {
                        const val = pNode.nodeValue;
                        if (val.includes("An anonymous user")) {
                            pNode.nodeValue = val.replace("An anonymous user", "익명의 유저가 ");
                            foundUser = true;
                        }
                        if (val.includes("posted")) {
                            pNode.nodeValue = val.replace("posted", "");
                            foundPosted = true;
                        }
                    }
                    if (foundUser || foundPosted) {
                        const linkNode = parentEl.querySelector('a');
                        if (linkNode) {
                            const suffix = document.createTextNode("을(를) 작성했습니다.");
                            if (linkNode.nextSibling) {
                                linkNode.parentNode.insertBefore(suffix, linkNode.nextSibling);
                            } else {
                                linkNode.parentNode.appendChild(suffix);
                            }
                            parentEl.setAttribute('data-translated-anonymous-post', 'true');
                            return true;
                        }
                    }
                }
            }
        }
    }

    if (normalizedText.includes("posted") && !normalizedText.includes("An anonymous user") && window.location.pathname === '/') {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes("posted")) {
                let parentEl = node.parentNode;
                while (parentEl) {
                    const links = Array.from(parentEl.querySelectorAll('a'));
                    const textLinks = links.filter(a => a.textContent.trim().length > 0);
                    if (textLinks.length >= 2 && parentEl.textContent.replace(/\s+/g, ' ').trim().length < 600) {
                        break;
                    }
                    if (parentEl === element) break;
                    parentEl = parentEl.parentNode;
                }
                if (parentEl && !parentEl.hasAttribute('data-translated-user-post')) {
                    const links = Array.from(parentEl.querySelectorAll('a'));
                    const textLinks = links.filter(a => a.textContent.trim().length > 0);
                    if (textLinks.length >= 2) {
                        const userLink = textLinks[0];
                        const postLink = textLinks[1];
                        node.nodeValue = node.nodeValue.replace(/\s*posted\s*/i, "");
                        const userSuffix = document.createTextNode(" 님이 ");
                        if (userLink.nextSibling) {
                            userLink.parentNode.insertBefore(userSuffix, userLink.nextSibling);
                        } else {
                            userLink.parentNode.appendChild(userSuffix);
                        }
                        const postSuffix = document.createTextNode("을(를) 작성했습니다.");
                        if (postLink.nextSibling) {
                            postLink.parentNode.insertBefore(postSuffix, postLink.nextSibling);
                        } else {
                            postLink.parentNode.appendChild(postSuffix);
                        }
                        parentEl.setAttribute('data-translated-user-post', 'true');
                        return true;
                    }
                }
            }
        }
    }

    if (element.querySelector('div')) {
        return false;
    }

    if (normalizedText.startsWith("We sent a verification code to") && !normalizedText.includes("Enter it below") && !element.hasAttribute('data-translated-sent-code')) {
        const emailMatch = normalizedText.match(/We sent a verification code to\s+(.+?)\.?$/i);
        if (emailMatch) {
            const dest = emailMatch[1].trim();
            const strongEl = element.querySelector('strong, span[class*="font-bold"], b');
            if (strongEl) {
                const destClone = strongEl.cloneNode(true);
                destClone.textContent = dest;
                element.textContent = '';
                element.appendChild(document.createTextNode('인증 코드를 '));
                element.appendChild(destClone);
                element.appendChild(document.createTextNode('(으)로 전송했습니다.'));
                element.setAttribute('data-translated-sent-code', 'true');
                return true;
            } else {
                element.textContent = `인증 코드를 ${dest}(으)로 전송했습니다.`;
                element.setAttribute('data-translated-sent-code', 'true');
                return true;
            }
        }
    }

    if (normalizedText.startsWith("We sent a verification code to") && normalizedText.includes("Enter it below")) {
        const sentMatch = normalizedText.match(/We sent a verification code to\s+(\+?[\d\s\-*]+)\s+via\s+(.+?)\.?\s*Enter it below/i);
        if (sentMatch) {
            const phone = sentMatch[1].trim();
            const method = sentMatch[2].trim();
            let methodKr = method;
            if (method.toLowerCase().includes('text') || method.toLowerCase().includes('sms') || method.includes('문자')) {
                methodKr = '문자 메시지';
            } else if (method.toLowerCase().includes('whatsapp')) {
                methodKr = 'WhatsApp';
            }

            const strongEl = element.querySelector('strong, span[class*="font-bold"]');
            if (strongEl) {
                const phoneClone = strongEl.cloneNode(true);
                phoneClone.textContent = phone;

                element.textContent = '';
                element.appendChild(phoneClone);
                element.appendChild(document.createTextNode(`(으)로 ${methodKr}를 통해 인증 코드를 전송했습니다. 아래에 입력해 주세요.`));
                return true;
            } else {
                element.textContent = `${phone}(으)로 ${methodKr}를 통해 인증 코드를 전송했습니다. 아래에 입력해 주세요.`;
                return true;
            }
        }
    }

    const priceCurrencyMatch = normalizedText.match(/^(?:Prices are marked in|가격 표기 기준:)\s*([a-zA-Z]+)\.?$/i);
    if (priceCurrencyMatch) {
        const currency = priceCurrencyMatch[1].trim();
        element.textContent = `가격은 ${currency} 기준으로 표기됩니다.`;
        return true;
    }

    if (text.includes("Submissions Detail -") && text.length < 200) {
        const link = element.querySelector('a[href*="/problems/"]');
        if (link) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.includes("Submissions Detail -")) {
                    node.nodeValue = node.nodeValue.replace("Submissions Detail -", "제출 상세 정보 -");
                }
            }
            const urlMatch = link.href.match(/\/problems\/([^/?#]+)/);
            if (urlMatch && problemDataCache) {
                const slug = urlMatch[1];
                const data = problemDataCache[slug];
                if (data && data.title) {
                    link.textContent = data.title;
                }
            }
            return true;
        }
    }

    if (text.startsWith("Evaluated") && text.includes("based on") && text.includes("brand-new problems")) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            let val = node.nodeValue;
            if (val.includes("Evaluated")) val = val.replace("Evaluated", "평가 모델:");
            if (val.includes("based on")) val = val.replace("based on", "/ 기준:");
            if (val.includes(", featuring")) val = val.replace(", featuring", "(신규 문제");
            if (val.includes("brand-new problems")) val = val.replace(/\s*brand-new problems, with a total score of\s*/, "개, 총 ");
            if (val.includes("points. The results are as follows:")) val = val.replace(/\s*points\. The results are as follows:/, "점). 결과는 다음과 같습니다:");
            if (val !== node.nodeValue) {
                node.nodeValue = val;
            }
        }
        return true;
    }

    if (normalizedText === "For additional LeetCoins, please refer to this discuss post.") {
        const linkNode = element.querySelector('a');
        if (linkNode && linkNode.textContent.trim() === "this") {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "해당 게시글";
            element.textContent = "추가 LeetCoin 관련 상세 내용은 ";
            element.appendChild(clone);
            element.appendChild(document.createTextNode("을 확인하세요."));
            return true;
        }
    }

    if (normalizedText === "For security, your card information is stored on stripe.com.") {
        const linkNode = element.querySelector('a');
        if (linkNode && linkNode.textContent.trim().includes("stripe.com")) {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "stripe.com";
            element.textContent = "보안을 위해 카드 정보는 ";
            element.appendChild(clone);
            element.appendChild(document.createTextNode("에 저장됩니다."));
            return true;
        }
    }

    if (normalizedText === "Gain exclusive access to our ever-growing collection of premium content, such as questions, Explore cards, and premium solutions like this.") {
        const linkNode = element.querySelector('a');
        if (linkNode && linkNode.textContent.trim() === "this") {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "이와 같은";
            element.textContent = "지속적으로 추가되는 프리미엄 문제, 학습 카드, 그리고 ";
            element.appendChild(clone);
            element.appendChild(document.createTextNode(" 프리미엄 솔루션 등 엄선된 프리미엄 콘텐츠를 독점으로 이용해 보세요."));
            return true;
        }
    }

    if (normalizedText === "LeetCode offers high-quality official solutions for a large selection of our problems. Some of these solutions are only available to premium subscribers. You can view a sample article here for free. We are constantly adding new solutions.") {
        const linkNode = element.querySelector('a');
        if (linkNode) {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "여기";
            element.textContent = '';
            element.appendChild(document.createTextNode("LeetCode는 수많은 문제에 대해 고품질의 공식 솔루션을 제공합니다. 이 중 일부 솔루션은 프리미엄 구독자만 이용할 수 있습니다. 샘플 솔루션은 "));
            element.appendChild(clone);
            element.appendChild(document.createTextNode("에서 무료로 확인하실 수 있습니다. 새로운 솔루션이 지속적으로 추가되고 있습니다."));
            return true;
        }
    }

    if (normalizedText === "We compile lists of questions asked by specific companies based on data from user surveys: e.g., \"Have you seen this question in a real interview?\" These lists are frequently updated with our ever-growing survey data. You can find the list of companies on the Problem List page.") {
        const linkNode = element.querySelector('a');
        if (linkNode) {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "문제 리스트 페이지";
            element.textContent = '';
            element.appendChild(document.createTextNode("저희는 사용자 설문 조사 데이터(예: \"실제 면접에서 이 문제를 보신 적이 있습니까?\")를 바탕으로 특정 기업에서 출제된 문제 리스트를 구성합니다. 이 리스트는 계속 늘어나는 설문 조사 데이터를 통해 수시로 업데이트됩니다. 기업 리스트는 "));
            element.appendChild(clone);
            element.appendChild(document.createTextNode("에서 확인하실 수 있습니다."));
            return true;
        }
    }

    if (normalizedText === "You may access your subscription page to confirm your subscription. Please check your billing history to make sure the transaction went through. If you didn't see a new transaction, your card has probably been declined. Please try subscribing again with a different debit/credit card or contact your bank for more information. Please contact us if you still encounter issues.") {
        const links = element.querySelectorAll('a');
        if (links.length >= 3) {
            const subLink = links[0].cloneNode(true);
            subLink.textContent = "구독 페이지";

            const billingLink = links[1].cloneNode(true);
            billingLink.textContent = "결제 내역";

            const contactLink = links[2].cloneNode(true);
            contactLink.textContent = "문의하기";

            element.textContent = '';
            element.appendChild(document.createTextNode("구독 신청을 확인하려면 "));
            element.appendChild(subLink);
            element.appendChild(document.createTextNode("를 이용하실 수 있습니다. 결제가 정상적으로 처리되었는지 확인하려면 "));
            element.appendChild(billingLink);
            element.appendChild(document.createTextNode("을 확인해 주세요. 새로운 결제 내역이 보이지 않는다면 카드가 거절되었을 수 있습니다. 다른 체크/신용 카드로 다시 구독을 시도하거나 은행에 문의해 주시기 바랍니다. 문제가 지속될 경우 "));
            element.appendChild(contactLink);
            element.appendChild(document.createTextNode("를 이용해 주세요."));
            return true;
        }
    }

    if (normalizedText === "You can cancel your subscription here at any time. Once canceled, your subscription will remain active until the end of the current period.") {
        const linkNode = element.querySelector('a');
        if (linkNode) {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "여기";
            element.textContent = '';
            element.appendChild(document.createTextNode("구독은 언제든지 "));
            element.appendChild(clone);
            element.appendChild(document.createTextNode("에서 취소하실 수 있습니다. 취소하더라도 현재 구독 기간이 만료될 때까지는 구독 상태가 활성 상태로 유지됩니다."));
            return true;
        }
    }

    if (normalizedText === "Get started with a LeetCode Subscription that works for you.") {
        element.textContent = "나에게 맞는 LeetCode 구독을 시작해 보세요.";
        return true;
    }

    if (normalizedText === "Our monthly plan grants access to all premium features, the best plan for short-term subscribers.") {
        const boldSpan = element.querySelector('[class*="font-semibold"]');
        const cls = boldSpan ? boldSpan.className : 'font-semibold';

        element.textContent = '';
        element.appendChild(document.createTextNode('월간 요금제는 '));
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = '모든 프리미엄 기능';
        element.appendChild(span);
        element.appendChild(document.createTextNode('을 제공하며, 단기 구독자에게 가장 적합한 요금제입니다.'));
        return true;
    }

    {
        const yearlyMatch = normalizedText.match(/^Our most popular plan previously sold for \$299 and is now only (.+?)\/month\.\s*This plan saves you over 62% in comparison to the monthly plan\.$/i);
        if (yearlyMatch && normalizedText.length < 200) {
            const price = yearlyMatch[1];
            const boldSpan = element.querySelector('[class*="font-semibold"]');
            const cls = boldSpan ? boldSpan.className : 'font-semibold';

            element.textContent = '';
            element.appendChild(document.createTextNode('기존 $299에서 할인된 가격으로, 현재 월 ' + price + '에 이용할 수 있는 '));
            const span1 = document.createElement('span');
            span1.className = cls;
            span1.textContent = '가장 인기 있는';
            element.appendChild(span1);
            element.appendChild(document.createTextNode(' 요금제입니다.'));
            element.appendChild(document.createElement('br'));
            element.appendChild(document.createTextNode('월간 요금제 대비 '));
            const span2 = document.createElement('span');
            span2.className = cls;
            span2.textContent = '62% 이상의 비용을 절약';
            element.appendChild(span2);
            element.appendChild(document.createTextNode('할 수 있습니다.'));
            return true;
        }
    }

    {
        const yearlyOnlyMatch = normalizedText.match(/^Our most popular plan previously sold for \$299 and is now only (.+?)\/month\.?$/i);
        if (yearlyOnlyMatch && normalizedText.length < 120) {
            const price = yearlyOnlyMatch[1];
            const boldSpan = element.querySelector('[class*="font-semibold"]');
            const cls = boldSpan ? boldSpan.className : 'font-semibold';

            element.textContent = '';
            element.appendChild(document.createTextNode('기존 $299에서 할인된 가격으로, 현재 월 ' + price + '에 이용할 수 있는 '));
            const span = document.createElement('span');
            span.className = cls;
            span.textContent = '가장 인기 있는';
            element.appendChild(span);
            element.appendChild(document.createTextNode(' 요금제입니다.'));
            return true;
        }
    }

    if (normalizedText === "This plan saves you over 62% in comparison to the monthly plan.") {
        const boldSpan = element.querySelector('[class*="font-semibold"]');
        const cls = boldSpan ? boldSpan.className : 'font-semibold';

        element.textContent = '';
        element.appendChild(document.createTextNode('월간 요금제 대비 '));
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = '62% 이상의 비용을 절약';
        element.appendChild(span);
        element.appendChild(document.createTextNode('할 수 있습니다.'));
        return true;
    }

    const coolOffMatch = normalizedText.match(/^You are currently under a (\d+)-day cool-off period until (\d{4}-\d{2}-\d{2}) UTC\.?\s*During this cool-off period, you can cancel your account deletion\.?$/i);
    if (coolOffMatch && normalizedText.length < 250) {
        const days = coolOffMatch[1];
        const [year, month, day] = coolOffMatch[2].split('-');
        element.textContent = `현재 ${year}년 ${month}월 ${parseInt(day, 10)}일 UTC까지 ${days}일간의 유예 기간 중입니다. 이 기간 동안 계정 삭제를 취소할 수 있습니다.`;
        return true;
    }

    if (normalizedText.includes("Review") && normalizedText.includes("regarding deletions") && normalizedText.length < 150) {
        const linkNode = element.querySelector('a');
        if (linkNode) {
            const clone = linkNode.cloneNode(true);
            clone.textContent = "개인정보 처리 방침";
            element.textContent = "계속하기 전에 계정 삭제에 관한 ";
            element.appendChild(clone);
            element.appendChild(document.createTextNode("을 검토하세요."));
            return true;
        }
    }

    if (normalizedText.includes("I have read and agreed to") && normalizedText.length < 100) {
        const linkNode = element.querySelector('a');
        if (linkNode) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (/I have read and agreed to/i.test(node.nodeValue)) {
                    node.nodeValue = node.nodeValue.replace(/I have read and agreed to\s*/i, "");
                }
            }
            const nextSib = linkNode.nextSibling;
            if (nextSib && nextSib.nodeType === 3) {
                nextSib.nodeValue = "을 읽었으며 이에 동의합니다.";
            } else {
                linkNode.parentNode.insertBefore(document.createTextNode("을 읽었으며 이에 동의합니다."), linkNode.nextSibling);
            }
            return true;
        }
    }

    if (text.startsWith("By continuing, you agree to") && text.length < 150) {
        const links = element.querySelectorAll('a');
        if (links.length >= 2) {
            const terms = links[0].cloneNode(true); terms.textContent = "이용 약관";
            const privacy = links[1].cloneNode(true); privacy.textContent = "개인정보 처리 방침";
            element.textContent = "계속 진행하면 ";
            element.appendChild(terms); element.appendChild(document.createTextNode(" 및 "));
            element.appendChild(privacy); element.appendChild(document.createTextNode("에 "));
            element.appendChild(document.createElement('br'));
            element.appendChild(document.createTextNode("동의하는 것으로 간주됩니다."));
            return true;
        }
    }

    if (normalizedText.startsWith("You need to log in / sign up") && normalizedText.length < 150) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            const val = node.nodeValue;
            if (/You\s+need\s+to/i.test(val)) {
                node.nodeValue = node.nodeValue.replace(/You\s+need\s+to/i, "코드를 실행하거나 제출하려면 ");
            } else if (/log\s+in\s*\/\s*sign\s+up/i.test(val)) {
                node.nodeValue = node.nodeValue.replace(/log\s+in\s*\/\s*sign\s+up/i, "회원가입 | 로그인");
            } else if (/to\s+run\s+or\s+submit/i.test(val)) {
                node.nodeValue = node.nodeValue.replace(/to\s+run\s+or\s+submit/i, "이 필요합니다.");
            }
        }
        return true;
    }

    if (text.startsWith("Added to ") && text.length < 100) {
        const link = element.querySelector('a');
        if (link) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                if (node.nodeValue.includes("Added to")) {
                    node.nodeValue = node.nodeValue.replace(/Added to\s*/i, "");
                }
            }

            link.parentNode.insertBefore(document.createTextNode(" 에 추가 완료!"), link.nextSibling);
            return true;
        }
    }

    if (text.startsWith("Removed from ") && text.length < 100) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.includes("Removed from")) {
                node.nodeValue = node.nodeValue.replace(/Removed from\s*/i, "");
            }
        }
        element.appendChild(document.createTextNode("에서 삭제 완료!"));
        return true;
    }

    if (text.startsWith("Are you sure you want to redeem a") && text.includes("LeetCoins?")) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
            const val = node.nodeValue.trim();
            if (val.startsWith("Are you sure")) node.nodeValue = " ";
            else if (val === "for") node.nodeValue = " 을(를) ";
            else if (val.includes("LeetCoins?")) node.nodeValue = node.nodeValue.replace(/(LeetCoins?)\?/i, "$1으로 교환하시겠습니까?");
            else translateTextNode(node);
        }
        return true;
    }

    const addToListMatch = text.match(/Are you sure you want to add (\d+) problems? to (.+?)\?/i);
    if (addToListMatch) {
        const count = addToListMatch[1];
        let listName = addToListMatch[2].trim();
        if (listName === 'Favorite') listName = '즐겨찾기';
        const translated = `${count} 문제를 ${listName}에 추가하시겠습니까?`;

        let sentenceEl = element;
        for (const el of element.querySelectorAll('*')) {
            if (/Are you sure you want to add/i.test(el.textContent) &&
                el.textContent.trim().length < sentenceEl.textContent.trim().length) {
                sentenceEl = el;
            }
        }
        sentenceEl.textContent = translated;

        for (const child of element.childNodes) {
            if (child !== sentenceEl && !(child.contains && child.contains(sentenceEl))) {
                translateNode(child);
            }
        }
        return true;
    }

    const bannerConfigs = [
        {
            key: "Please verify your email",
            check: "to unlock all features",
            prefix: "LeetCode의 모든 기능과 서비스를 이용하려면 ",
            link: "이메일 인증",
            suffix: "을 완료해 주세요."
        },
        {
            key: "Please verify your primary email",
            check: "to activate your account first",
            prefix: "계정을 활성화하려면 먼저 ",
            link: "기본 이메일 인증",
            suffix: "을 완료해 주세요."
        },
        {
            key: "You are submitting too frequently",
            check: "shorter wait times",
            prefix: "제출이 너무 빈번합니다. 잠시 후 다시 시도하시거나 대기 시간을 줄이려면 ",
            link: "프리미엄",
            suffix: "을 구독해 주세요."
        }
    ];

    for (const config of bannerConfigs) {
        if (text.includes(config.key) && text.includes(config.check) && text.length < 200) {
            const link = element.querySelector('a');
            if (link) {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while ((node = walker.nextNode())) {
                    if (node.nodeValue.includes("Please") || node.nodeValue.includes("submitting")) node.nodeValue = config.prefix;
                    else if (node.nodeValue.includes("to unlock") || node.nodeValue.includes("to activate") || node.nodeValue.includes("wait times")) node.nodeValue = config.suffix;
                }
                link.textContent = config.link;
                return true;
            }
        }
    }
    return false;
}

function translateNode(node) {
    if (!isTranslationEnabled) return;

    if (node.nodeType === 1 && node.children.length === 0 && node.textContent && /Consistency is key,\s*see you tomorrow!/i.test(node.textContent.replace(/\s+/g, ' ').trim())) {
        node.textContent = "꾸준함이 핵심입니다. 내일 만나요!";
        return;
    }

    if (node.nodeType === 1 && node.textContent) {
        const rawText = node.textContent.replace(/\s+/g, ' ').trim();
        const dayTimerRegex = /^Day\s*(\d+)(?:\s+(\d{1,2}:\d{2}:\d{2}))?(?:\s+(left|남음))?$/i;
        if (dayTimerRegex.test(rawText)) {
            const match = rawText.match(dayTimerRegex);
            const num = match[1];
            const time = match[2] || "";
            const left = match[3] ? "남음" : "";

            let result = `${num}일`;
            if (time) result += ` ${time}`;
            if (left) result += ` ${left}`;

            node.textContent = result.trim();
            return;
        }
    }

    const hasConsistencyText = node.nodeType === 1
        ? (node.textContent && /Consistency is key,\s*see you tomorrow!/i.test(node.textContent))
        : false;

    if (!hasConsistencyText && Object.keys(activeTranslations).length === 0) return;

    if (node.nodeType === 3) {
        if (!shouldSkipNode(node)) translateTextNode(node);
    } else if (node.nodeType === 1) {
        if (!hasConsistencyText && shouldSkipNode(node)) return;

        let translatedHtml = false;
        for (const [key, value] of Object.entries(activeHtmlTranslations)) {
            if (node.textContent.includes(key)) {
                if (!Array.from(node.children).some(child => child.textContent.includes(key))) {
                    safeSetInnerHTML(node, value);
                    translatedHtml = true;
                    break;
                }
            }
        }
        if (translatedHtml) return;

        if (node.textContent.includes("Quit the study plan by typing")) {
            const input = node.querySelector('input');
            if (input?.hasAttribute('placeholder')) {
                input.setAttribute('data-keep-original-placeholder', 'true');
                const title = input.getAttribute('placeholder');
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
                let n; while ((n = walker.nextNode())) {
                    if (n.nodeValue.trim() === title) n.parentElement?.setAttribute('data-keep-original-text', 'true');
                }
            }
        }

        translateElementAttributes(node);
        if (!handleSpecialUIPatterns(node)) {
            for (const child of node.childNodes) translateNode(child);
        }
    }
}

let debounceTimer = null;
let heavyScanDebounceTimer = null;
let needsFullScan = false;

const mainObserver = new MutationObserver((mutations) => {
    if (!isTranslationEnabled) return;

    mutations.forEach(m => {
        if (m.type === 'characterData') {
            translateNode(m.target);
        } else if (m.type === 'childList') {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1 || node.nodeType === 3) translateNode(node);
            });
            if (m.addedNodes.length > 0) needsFullScan = true;
        }
    });

    if (heavyScanDebounceTimer) clearTimeout(heavyScanDebounceTimer);
    heavyScanDebounceTimer = setTimeout(() => {
        if (!isTranslationEnabled) return;

        translateProblemList();
        if (extractProblemSlug()) initProblemTranslation();
        if (pendingHintTranslations && pendingHintTranslations.length > 0) {
            applyHintsIfExpanded();
        }

        if (needsFullScan) {
            needsFullScan = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (isTranslationEnabled) translateNode(document.body);
            }, 150);
        }
    }, 100);
});

let currentProblemSlug = null;

async function fetchProblemData() {
    return problemDataCache;
}

let isProblemTranslationApplied = false;

async function initProblemTranslation() {
    const slug = extractProblemSlug();
    if (!slug || !isValidProblemSlug(slug)) {
        currentProblemSlug = null;
        isProblemTranslationApplied = false;
        return;
    }

    if (slug !== currentProblemSlug) {
        currentProblemSlug = slug;
        isProblemTranslationApplied = false;
    } else if (isProblemTranslationApplied) {
        if (document.getElementById('lk-lang-toggle')) {
            return;
        }
        isProblemTranslationApplied = false;
    }

    if (!isProblemJsonEnabled) return;
    if (fetchingSlugs.has(slug)) return;

    try {
        if (!(slug in problemDataCache) || isCacheExpired(slug) || !problemDataCache[slug].description) {
            fetchingSlugs.add(slug);
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/problems2?slug=eq.${slug}`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.length > 0) {
                        const item = data[0];
                        problemDataCache[slug] = {
                            id: String(item.id),
                            title: item.title,
                            englishTitle: item.english_title,
                            description: item.description,
                            hints: item.hints || [],
                            fetchedAt: Date.now()
                        };
                    } else {
                        problemDataCache[slug] = { id: null, title: null, fetchedAt: Date.now() };
                    }
                } else {
                    problemDataCache[slug] = { id: null, title: null, fetchedAt: Date.now() };
                }
                saveCacheToStorage();
            } catch (err) {
                problemDataCache[slug] = { id: null, title: null, fetchedAt: Date.now() };
                saveCacheToStorage();
                console.error("Fetch request failed for individual problem", err);
            } finally {
                fetchingSlugs.delete(slug);
            }
        }

        if (problemDataCache[slug]) {
            const appliedImmediately = applyProblemTranslation(slug, problemDataCache[slug]);
            if (appliedImmediately) {
                isProblemTranslationApplied = true;
            } else {
                let attempts = 0;
                const tryApply = setInterval(() => {
                    if (currentProblemSlug !== slug) {
                        clearInterval(tryApply);
                        return;
                    }
                    const applied = applyProblemTranslation(slug, problemDataCache[slug]);
                    if (applied) {
                        isProblemTranslationApplied = true;
                        clearInterval(tryApply);
                    }
                    attempts++;
                    if (attempts > 30) clearInterval(tryApply);
                }, 100);
            }
        }
    } catch (e) {
        console.error("Failed to load individual problem translation", e);
    }
}

let lastPathname = location.pathname;
function handleUrlChange() {
    if (location.pathname !== lastPathname) {
        lastPathname = location.pathname;
        updateActiveTranslations();
        initProblemTranslation();
    }
}
const urlObserver = new MutationObserver(handleUrlChange);
window.addEventListener('popstate', handleUrlChange);

function findDescriptionElement() {
    const selectors = [
        '[data-track-load="description_content"]',
        '.elfjS'
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 50) return el;
    }
    return null;
}

function setTitleText(titleEl, newText) {
    if (titleEl.children.length === 0) {
        titleEl.textContent = newText;
        return;
    }

    const walker = document.createTreeWalker(titleEl, NodeFilter.SHOW_TEXT);
    let longestNode = null;
    let longestLen = 0;
    let node;
    while ((node = walker.nextNode())) {
        const len = node.nodeValue.trim().length;
        if (len > longestLen) {
            longestLen = len;
            longestNode = node;
        }
    }

    if (longestNode) {
        longestNode.nodeValue = newText;
    } else {
        titleEl.textContent = newText;
    }
}

function findTitleElement(expectedId, englishTitle, koreanTitle) {
    const isTarget = (txt) => {
        if (englishTitle && txt.includes(englishTitle)) return true;
        if (koreanTitle && txt.includes(koreanTitle)) return true;

        if (expectedId) {
            const regex = new RegExp(`^(Q)?${expectedId}\\.\\s*`);
            return regex.test(txt);
        }
        return /^(Q)?\d+\.\s+.+/.test(txt);
    };

    const candidates = document.querySelectorAll('div[class*="text-title"], a[class*="text-title"], span[class*="text-title"]');
    for (const el of candidates) {
        if (isTarget(el.textContent.trim())) return el;
    }

    const allHeaders = document.querySelectorAll('div, span');
    for (const el of allHeaders) {
        const txt = el.textContent.trim();
        if (isTarget(txt) && el.children.length === 0 && txt.length < 100) {
            if (el.hasAttribute('data-translated-title') || el.closest('[data-translated-title]')) continue;
            return el;
        }
    }

    return null;
}

function findHintContent(headerEl) {
    const parent = headerEl.parentElement;
    if (!parent) return null;

    let sibling = headerEl.nextElementSibling;
    if (sibling && sibling.textContent.trim().length > 10 && !/^Hint \d+$/.test(sibling.textContent.trim())) {
        return sibling;
    }

    sibling = parent.nextElementSibling;
    if (sibling && sibling.textContent.trim().length > 10 && !/^Hint \d+$/.test(sibling.textContent.trim())) {
        return sibling;
    }

    for (const child of parent.children) {
        if (child !== headerEl && child.textContent.trim().length > 10) {
            return child;
        }
    }

    return null;
}

function extractProblemSlug() {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    if (match) return match[1];

    const questMatch = window.location.pathname.match(/\/quiz\/([^/]+)/);
    if (questMatch) return questMatch[1];

    return null;
}

function safeSetInnerHTML(element, htmlString) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
    const parsedDoc = new DOMParser().parseFromString(htmlString, 'text/html');
    element.replaceChildren(...parsedDoc.body.childNodes);
}

function findBadgeContainer(titleEl) {
    if (!titleEl) return null;

    let parent = titleEl.parentElement;
    for (let depth = 0; depth < 5 && parent; depth++) {
        const diffBadges = Array.from(parent.querySelectorAll('div, span')).filter(el => {
            const txt = el.textContent.trim();
            return ['Easy', 'Medium', 'Hard', '쉬움', '보통', '어려움'].includes(txt) && el.children.length === 0;
        });

        if (diffBadges.length > 0) {
            const badge = diffBadges[0];
            const container = badge.parentElement;
            if (container && (container.classList.contains('flex') || container.tagName === 'DIV')) {
                return container;
            }
        }
        parent = parent.parentElement;
    }

    return null;
}

function injectTogglePill(slug) {
    const href = window.location.href;
    const isValidTab = href.includes('/description/') || (!href.includes('/solutions/') && !href.includes('/submissions/') && !href.includes('/editorial/') && !href.includes('/discussion/') && !href.includes('/articles/'));

    if (!isValidTab) {
        const existingToggle = document.getElementById('lk-lang-toggle');
        if (existingToggle) existingToggle.remove();
        return;
    }

    const data = problemDataCache[slug];
    const expectedId = data ? data.id : null;
    const englishTitle = data ? data.englishTitle : null;
    const koreanTitle = data ? data.title : null;
    const titleEl = findTitleElement(expectedId, englishTitle, koreanTitle);
    if (!titleEl) return;

    let container = findBadgeContainer(titleEl);
    let insertAsSibling = false;
    if (!container) {
        container = titleEl.parentElement;
        insertAsSibling = true;
    }
    if (!container) return;

    const existingToggle = document.getElementById('lk-lang-toggle');
    if (existingToggle) {
        if (existingToggle.parentElement === container) {
            updateToggleButtonsUI();
            return;
        } else {
            existingToggle.remove();
        }
    }


    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'lk-toggle-container';
    toggleContainer.id = 'lk-lang-toggle';
    safeSetInnerHTML(toggleContainer, `
        <div class="lk-toggle-btn ${currentToggleLanguage === 'KO' ? 'active' : ''}" id="lk-btn-ko">KO</div>
        <div class="lk-toggle-divider"></div>
        <div class="lk-toggle-btn ${currentToggleLanguage === 'EN' ? 'active' : ''}" id="lk-btn-en">EN</div>
    `);

    const btnKo = toggleContainer.querySelector('#lk-btn-ko');
    const btnEn = toggleContainer.querySelector('#lk-btn-en');

    btnKo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentToggleLanguage === 'KO') return;
        currentToggleLanguage = 'KO';
        browserAPI.storage.local.set({ preferredLanguage: 'KO' });
        updateToggleButtonsUI();
        const activeSlug = extractProblemSlug();
        if (activeSlug && problemDataCache[activeSlug]) {
            applyProblemTranslation(activeSlug, problemDataCache[activeSlug]);
        }
    });

    btnEn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentToggleLanguage === 'EN') return;
        currentToggleLanguage = 'EN';
        browserAPI.storage.local.set({ preferredLanguage: 'EN' });
        updateToggleButtonsUI();
        const activeSlug = extractProblemSlug();
        restoreOriginalProblem(activeSlug || slug);
    });

    if (insertAsSibling) {
        titleEl.insertAdjacentElement('afterend', toggleContainer);
    } else {
        container.appendChild(toggleContainer);
    }
}

function updateToggleButtonsUI() {
    const btnKo = document.getElementById('lk-btn-ko');
    const btnEn = document.getElementById('lk-btn-en');
    if (btnKo && btnEn) {
        if (currentToggleLanguage === 'KO') {
            btnKo.classList.add('active');
            btnEn.classList.remove('active');
        } else {
            btnEn.classList.add('active');
            btnKo.classList.remove('active');
        }
    }
}

function restoreOriginalNodes(node) {
    if (node.nodeType === 3) {
        if (node._originalValue !== undefined) {
            node.nodeValue = node._originalValue;
        }
    } else if (node.nodeType === 1) {
        if (node._originalChildNodes) {
            node.replaceChildren(...node._originalChildNodes);
        }
        for (const child of node.childNodes) {
            restoreOriginalNodes(child);
        }
    }
}

function restoreOriginalProblem(slug) {
    const data = problemDataCache[slug];
    const expectedId = data ? data.id : null;
    const englishTitle = data ? data.englishTitle : null;
    const koreanTitle = data ? data.title : null;
    const titleEl = findTitleElement(expectedId, englishTitle, koreanTitle);
    if (titleEl) {
        titleEl.setAttribute('data-leetcode-korean-problem-area', 'true');
        if (originalProblemDataCache[slug] && originalProblemDataCache[slug].title) {
            setTitleText(titleEl, originalProblemDataCache[slug].title);
        }
    }

    const descEl = findDescriptionElement();
    if (descEl) {
        descEl.setAttribute('data-leetcode-korean-problem-area', 'true');
        descEl.setAttribute('data-lk-links', 'true');
        if (originalProblemDataCache[slug] && originalProblemDataCache[slug].originalNodes) {
            descEl.replaceChildren(...originalProblemDataCache[slug].originalNodes);
            restoreOriginalNodes(descEl);
        }
    }

    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
        const text = div.textContent.trim();
        if ((/^Hint \d+$/.test(text) || /^힌트 \d+$/.test(text)) && div.children.length === 0) {
            const clickTarget = div.closest('[class*="cursor-pointer"]') || div.parentElement;
            if (clickTarget) {
                const contentEl = findHintContent(clickTarget);
                if (contentEl && originalProblemDataCache[slug] && originalProblemDataCache[slug].hints) {
                    const idx = contentEl._hintIndex;
                    if (idx !== undefined && originalProblemDataCache[slug].hints[idx] !== undefined) {
                        safeSetInnerHTML(contentEl, originalProblemDataCache[slug].hints[idx]);
                    }
                }
            }
        }
    }
}

function applyProblemTranslation(slug, data) {
    let titleFound = !data.title;
    let success = false;

    if (data.title) {
        const titleEl = findTitleElement(data.id, data.englishTitle, data.title);
        if (titleEl) {
            titleEl.setAttribute('data-leetcode-korean-problem-area', 'true');
            const prefixMatch = titleEl.textContent.match(/^([a-zA-Z0-9]+)\.\s*/);
            const containsTitle = (data.englishTitle && titleEl.textContent.includes(data.englishTitle)) ||
                (data.title && titleEl.textContent.includes(data.title));

            if (prefixMatch && !containsTitle) {
                const prefixVal = prefixMatch[1];
                if (/^\d+$/.test(prefixVal) && prefixVal !== data.id) {
                    return false;
                }
                if (/^Q\d+$/.test(prefixVal) && (data.englishTitle || data.title)) {
                    return false;
                }
            }

            if (!originalProblemDataCache[slug] || !originalProblemDataCache[slug].title) {
                if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(titleEl.textContent)) {
                    return false;
                }
            }

            if (!originalProblemDataCache[slug]) {
                originalProblemDataCache[slug] = {};
            }
            if (!originalProblemDataCache[slug].title) {
                if (data.englishTitle) {
                    originalProblemDataCache[slug].title = prefixMatch ? `${prefixMatch[1]}. ${data.englishTitle}` : data.englishTitle;
                } else {
                    originalProblemDataCache[slug].title = titleEl.textContent.trim();
                }
            }

            const translatedTitle = prefixMatch ? `${prefixMatch[1]}. ${data.title}` : data.title;

            if (currentToggleLanguage === 'KO') {
                setTitleText(titleEl, translatedTitle);
            } else if (originalProblemDataCache[slug].title) {
                setTitleText(titleEl, originalProblemDataCache[slug].title);
            }
            titleFound = true;
            success = true;
        }
    }

    if (data.description) {
        const descEl = findDescriptionElement();
        if (descEl) {
            descEl.setAttribute('data-leetcode-korean-problem-area', 'true');
            descEl.setAttribute('data-lk-links', 'true');
            if (!originalProblemDataCache[slug] || !originalProblemDataCache[slug].originalNodes) {
                if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(descEl.textContent)) {
                    return false;
                }
            }

            if (!originalProblemDataCache[slug]) {
                originalProblemDataCache[slug] = {};
            }

            if (!originalProblemDataCache[slug].originalNodes) {
                originalProblemDataCache[slug].originalNodes = Array.from(descEl.childNodes);
            }

            if (currentToggleLanguage === 'KO') {
                descEl.replaceChildren(...originalProblemDataCache[slug].originalNodes);
                restoreOriginalNodes(descEl);

                const interactiveSelectors = 'button, a, [data-keyword]';
                const globalInteractivePool = new Map();
                const orderedKeywordElements = [];

                descEl.querySelectorAll(interactiveSelectors).forEach(el => {
                    const kw = el.getAttribute('data-keyword');
                    if (kw) {
                        if (!globalInteractivePool.has(kw)) globalInteractivePool.set(kw, []);
                        globalInteractivePool.get(kw).push(el);
                        orderedKeywordElements.push(el);
                    } else {
                        const id = el.tagName + ":" + el.textContent.trim();
                        if (!globalInteractivePool.has(id)) globalInteractivePool.set(id, []);
                        globalInteractivePool.get(id).push(el);
                    }
                });

                const tempDiv = document.createElement('div');
                const parsedDoc = new DOMParser().parseFromString(data.description, 'text/html');
                tempDiv.replaceChildren(...parsedDoc.body.childNodes);

                function patchNodes(original, translated) {
                    if (original.nodeType === 3) {
                        if (original._originalValue === undefined) {
                            original._originalValue = original.nodeValue;
                        }
                    } else if (original.nodeType === 1) {
                        if (!original._originalChildNodes) {
                            original._originalChildNodes = Array.from(original.childNodes);
                        }
                    }

                    if (translated.nodeType === 3) {
                        if (original.nodeType === 3) {
                            if (original.nodeValue !== translated.nodeValue) original.nodeValue = translated.nodeValue;
                        } else {
                            original.parentNode?.replaceChild(document.createTextNode(translated.nodeValue), original);
                        }
                        return;
                    }

                    if (translated.nodeType === 1) {
                        if (original.nodeType !== 1 || original.tagName !== translated.tagName) {
                            if (!translated.querySelector(interactiveSelectors)) {
                                original.parentNode?.replaceChild(translated.cloneNode(true), original);
                                return;
                            }
                        }

                        if (!original.querySelector(interactiveSelectors) && !translated.querySelector(interactiveSelectors)) {
                            if (original.innerHTML !== translated.innerHTML) {
                                original.replaceChildren(...Array.from(translated.childNodes).map(n => n.cloneNode(true)));
                            }
                            return;
                        }

                        const oChildren = Array.from(original.childNodes);
                        const tChildren = Array.from(translated.childNodes);

                        const tagPool = {};
                        oChildren.forEach(node => {
                            if (node.nodeType === 1 && !node.getAttribute('data-keyword')) {
                                const tag = node.tagName;
                                if (!tagPool[tag]) tagPool[tag] = [];
                                tagPool[tag].push(node);
                            }
                        });

                        while (original.firstChild) original.removeChild(original.firstChild);

                        tChildren.forEach(tChild => {
                            if (tChild.nodeType === 3) {
                                original.appendChild(document.createTextNode(tChild.nodeValue));
                            } else if (tChild.nodeType === 1) {
                                let match = null;
                                const kw = tChild.getAttribute('data-keyword');
                                const id = tChild.tagName + ":" + tChild.textContent.trim();

                                if (kw) {
                                    if (globalInteractivePool.has(kw) && globalInteractivePool.get(kw).length > 0) {
                                        match = globalInteractivePool.get(kw).shift();
                                    } else {
                                        for (const [poolKw, list] of globalInteractivePool.entries()) {
                                            if (list.length > 0 && (poolKw.includes(kw) || kw.includes(poolKw))) {
                                                match = list.shift();
                                                break;
                                            }
                                        }
                                    }

                                    if (!match) {
                                        while (orderedKeywordElements.length > 0) {
                                            const candidate = orderedKeywordElements.shift();
                                            const candidateKw = candidate.getAttribute('data-keyword');
                                            const list = globalInteractivePool.get(candidateKw);
                                            if (list && list.includes(candidate)) {
                                                const idx = list.indexOf(candidate);
                                                if (idx > -1) list.splice(idx, 1);
                                                match = candidate;
                                                break;
                                            }
                                        }
                                    }
                                } else if (globalInteractivePool.has(id) && globalInteractivePool.get(id).length > 0) {
                                    match = globalInteractivePool.get(id).shift();
                                } else {
                                    const tag = tChild.tagName;
                                    if (tagPool[tag] && tagPool[tag].length > 0) match = tagPool[tag].shift();
                                }

                                if (match) {
                                    if (match.parentNode && match.parentNode !== original) {
                                        match.parentNode.removeChild(match);
                                    }
                                    patchNodes(match, tChild);
                                    original.appendChild(match);
                                } else {
                                    original.appendChild(tChild.cloneNode(true));
                                }
                            }
                        });
                    }
                }

                patchNodes(descEl, tempDiv);
            } else {
                descEl.replaceChildren(...originalProblemDataCache[slug].originalNodes);
                restoreOriginalNodes(descEl);
            }
            success = true;
        }
    }

    if (data.hints && data.hints.length > 0) {
        pendingHintTranslations = data.hints;
        applyHintsIfExpanded();
    }

    injectTogglePill(slug);
    return success && titleFound;
}

let pendingHintTranslations = null;

function applyHintsIfExpanded() {
    if (!pendingHintTranslations || pendingHintTranslations.length === 0) return;

    const slug = extractProblemSlug();
    if (!slug) return;

    if (!originalProblemDataCache[slug]) {
        originalProblemDataCache[slug] = {};
    }
    if (!originalProblemDataCache[slug].hints) {
        originalProblemDataCache[slug].hints = [];
    }

    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
        const text = div.textContent.trim();
        const match = text.match(/^(?:Hint|힌트)\s+(\d+)$/i);
        if (match && div.children.length === 0) {
            const currentHintIndex = parseInt(match[1], 10) - 1;
            const clickTarget = div.closest('[class*="cursor-pointer"]') || div.parentElement;
            if (clickTarget) {
                const contentEl = findHintContent(clickTarget);
                if (contentEl && currentHintIndex >= 0 && currentHintIndex < pendingHintTranslations.length) {
                    contentEl.setAttribute('data-leetcode-korean-problem-area', 'true');
                    contentEl.setAttribute('data-lk-links', 'true');
                    const originalText = contentEl.textContent.trim();
                    const originalHtml = contentEl.innerHTML;

                    contentEl._hintIndex = currentHintIndex;

                    if (originalProblemDataCache[slug].hints[currentHintIndex] === undefined) {
                        originalProblemDataCache[slug].hints[currentHintIndex] = originalHtml;
                    }

                    if (originalText.length > 5 && contentEl._currentLang !== currentToggleLanguage) {
                        contentEl._currentLang = currentToggleLanguage;
                        if (currentToggleLanguage === 'KO') {
                            safeSetInnerHTML(contentEl, pendingHintTranslations[currentHintIndex]);
                        } else {
                            safeSetInnerHTML(contentEl, originalProblemDataCache[slug].hints[currentHintIndex]);
                        }
                    }
                }
            }
        }
    }
}

let englishToKoreanTitleMap = null;

function buildTitleMap() {
    const cacheSize = Object.keys(problemDataCache).length;
    if (englishToKoreanTitleMap && englishToKoreanTitleMap.size === cacheSize) return;

    englishToKoreanTitleMap = new Map();
    for (const slug in problemDataCache) {
        const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedSlug.length > 3 && problemDataCache[slug].title) {
            englishToKoreanTitleMap.set(normalizedSlug, problemDataCache[slug].title);
        }
    }
}

async function translateProblemList() {
    if (!isTranslationEnabled || !isProblemJsonEnabled) return;

    if (!problemDataCache) {
        await fetchProblemData();
        if (!problemDataCache) return;
    }

    if (window.location.href.includes('/studyplan/') || window.location.href.includes('/u/') || window.location.href.includes('/contest/') || window.location.href.includes('/quest/') || window.location.href.includes('/quiz/')) {
        buildTitleMap();
    }

    const candidates = document.querySelectorAll('div, span, a, p');

    for (const el of candidates) {
        if (el.hasAttribute('data-translated-title')) {
            const currentText = el.textContent.trim();
            const normalizedCurrent = currentText.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (englishToKoreanTitleMap && englishToKoreanTitleMap.has(normalizedCurrent) && currentText !== englishToKoreanTitleMap.get(normalizedCurrent)) {
                el.removeAttribute('data-translated-title');
            } else {
                continue;
            }
        }
        if (shouldSkipNode(el)) continue;

        let targetTextNode = null;
        let text = "";

        if (el.children.length === 0) {
            text = el.textContent.trim();
        } else if (!Array.from(el.childNodes).some(n => n.nodeType === 1)) {
            text = el.textContent.trim();
        } else {
            for (const child of el.childNodes) {
                if (child.nodeType === 3 && child.nodeValue.trim().length > 5) {
                    targetTextNode = child;
                    text = child.nodeValue.trim();
                    break;
                }
            }
        }

        if (!text) continue;

        let translated = false;

        const match = text.match(/^(\d+)\.\s+(.+)$/);
        const contestMatch = text.match(/^(Q\d+)\.\s+(.+)$/i);

        if (match) {
            const id = match[1];
            const titlePart = match[2].trim();

            let foundData = null;
            let alreadySearched = false;
            let expiredSlug = null;
            for (const slug in problemDataCache) {
                if (problemDataCache[slug].id === id) {
                    alreadySearched = true;
                    if (isCacheExpired(slug)) {
                        expiredSlug = slug;
                    }
                    if (problemDataCache[slug].title) {
                        foundData = problemDataCache[slug];
                        break;
                    }
                }
            }

            if (foundData) {
                const isTitleMatch = titlePart === foundData.englishTitle ||
                    (foundData.englishTitle && foundData.englishTitle.length > 5 &&
                        new RegExp(`(^|\\s)${foundData.englishTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(text)) ||
                    window.location.href.includes('/studyplan/') || window.location.href.includes('/u/');

                if (isTitleMatch) {
                    const activeSlug = extractProblemSlug();
                    if (activeSlug && problemDataCache[activeSlug] && problemDataCache[activeSlug].id === id) {
                        if (currentToggleLanguage === 'EN') {
                            const engTitle = `${id}. ${foundData.englishTitle || titlePart}`;
                            if (targetTextNode) {
                                targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, engTitle);
                            } else {
                                el.textContent = engTitle;
                            }
                            el.setAttribute('data-translated-title', 'true');
                            translated = true;
                            if (expiredSlug) {
                                queueSlugFetch(expiredSlug);
                            }
                            continue;
                        }
                    }

                    if (targetTextNode) {
                        targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, `${id}. ${foundData.title}`);
                    } else {
                        el.textContent = `${id}. ${foundData.title}`;
                    }
                    el.setAttribute('data-translated-title', 'true');
                    translated = true;
                    if (expiredSlug) {
                        queueSlugFetch(expiredSlug);
                    }
                }
            } else if (!alreadySearched) {
                queueIdFetch(id);
            }
        }

        if (!translated && (window.location.href.includes('/contest/') || window.location.href.includes('/studyplan/') || window.location.href.includes('/u/') || window.location.href.includes('/quest/') || window.location.href.includes('/quiz/'))) {
            const cMatch = text.match(/^(Q\d+)\.\s+(.+)$/i);
            const effectiveText = cMatch ? cMatch[2].trim() : text;
            const prefix = cMatch ? cMatch[1] + ". " : "";

            const normalizedText = effectiveText.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedText.length > 3 && englishToKoreanTitleMap.has(normalizedText)) {
                const activeSlug = extractProblemSlug();
                if (activeSlug && normalizedText === activeSlug.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                    if (currentToggleLanguage === 'EN') {
                        continue;
                    }
                }

                const translatedTitle = englishToKoreanTitleMap.get(normalizedText);
                const result = `${prefix}${translatedTitle}`;
                if (targetTextNode) {
                    targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, result);
                } else {
                    el.textContent = result;
                }
                el.setAttribute('data-translated-title', 'true');
                translated = true;
            }
        }

        if (!translated && (window.location.href.includes('/studyplan/') || window.location.href.includes('/u/') || window.location.href.includes('/contest/') || window.location.href.includes('/quest/') || window.location.href.includes('/quiz/'))) {
            const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedText.length > 3 && englishToKoreanTitleMap.has(normalizedText)) {
                const activeSlug = extractProblemSlug();
                if (activeSlug && normalizedText === activeSlug.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                    if (currentToggleLanguage === 'EN') {
                        continue;
                    }
                }

                const translatedTitle = englishToKoreanTitleMap.get(normalizedText);
                if (targetTextNode) {
                    targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, translatedTitle);
                } else {
                    el.textContent = translatedTitle;
                }
                el.setAttribute('data-translated-title', 'true');
                translated = true;
            }
        }

        if (!translated) {
            let aTag = el.tagName === 'A' ? el : el.closest('a');
            if (!aTag) {
                let parent = el.parentElement;
                for (let i = 0; i < 4 && parent && !aTag; i++) {
                    aTag = parent.querySelector('a[href*="/problems/"], a[href*="/quiz/"]');
                    parent = parent.parentElement;
                }
            }

            if (aTag && aTag.href) {
                if (aTag.href.includes('/solutions/')) continue;
                const urlMatch = aTag.href.match(/\/(?:problems|quiz)\/([^/?#]+)/);
                if (urlMatch) {
                    const slug = urlMatch[1];
                    if (slug in problemDataCache) {
                        const data = problemDataCache[slug];
                        if (data && data.title) {
                            const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const cleanText = normalizedText.replace(/^q\d+/, '');
                            if ((normalizedText === normalizedSlug || cleanText === normalizedSlug) && normalizedText.length > 0) {
                                const activeSlug = extractProblemSlug();
                                if (activeSlug && slug === activeSlug) {
                                    if (currentToggleLanguage === 'EN') {
                                        const engTitle = data.englishTitle || text;
                                        if (targetTextNode) {
                                            targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, engTitle);
                                        } else {
                                            el.textContent = engTitle;
                                        }
                                        el.setAttribute('data-translated-title', 'true');
                                        if (isCacheExpired(slug)) {
                                            queueSlugFetch(slug);
                                        }
                                        continue;
                                    }
                                }

                                const localContestMatch = text.match(/^(Q\d+)\.\s+(.+)$/i);
                                const numMatch = text.match(/^(\d+)\.\s+(.+)$/);
                                const prefix = localContestMatch ? localContestMatch[1] + ". " : (numMatch ? numMatch[1] + ". " : "");
                                const resultTitle = `${prefix}${data.title}`;

                                if (targetTextNode) {
                                    targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, resultTitle);
                                } else {
                                    el.textContent = resultTitle;
                                }
                                el.setAttribute('data-translated-title', 'true');
                                translated = true;
                            }
                        }
                        if (isCacheExpired(slug)) {
                            queueSlugFetch(slug);
                        }
                    } else {
                        queueSlugFetch(slug);
                    }
                }
            }
        }

        if (!translated) {
            const localContestMatch = text.match(/^(Q\d+)\.\s+(.+)$/i);
            const numMatch = text.match(/^(\d+)\.\s+(.+)$/);
            const effectiveText = localContestMatch ? localContestMatch[2].trim() : (numMatch ? numMatch[2].trim() : text.trim());

            const cleanText = effectiveText.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            const lowerClean = cleanText.toLowerCase();
            const IGNORED_WORDS = new Set(['easy', 'medium', 'hard', 'solved', 'acceptance', 'difficulty', 'solution', 'discussion', 'submissions', 'description', 'editorial', 'submissions', 'solutions']);
            if (cleanText.length > 3 && !/^\d+$/.test(cleanText) && !/ago$/i.test(cleanText) && !IGNORED_WORDS.has(lowerClean)) {
                const guessedSlug = lowerClean
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-');

                if (guessedSlug.length > 3) {
                    if (guessedSlug in problemDataCache) {
                        const data = problemDataCache[guessedSlug];
                        if (data && data.title) {
                            const prefix = localContestMatch ? localContestMatch[1] + ". " : (numMatch ? numMatch[1] + ". " : "");
                            const resultTitle = `${prefix}${data.title}`;
                            if (targetTextNode) {
                                targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, resultTitle);
                            } else {
                                el.textContent = resultTitle;
                            }
                            el.setAttribute('data-translated-title', 'true');
                            translated = true;
                        }
                    }
                }
            }
        }
    }
}