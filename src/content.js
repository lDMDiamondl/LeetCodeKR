let translationMappings = [];
let isTranslationEnabled = true;
let activeTranslations = {};

function injectStyles() {
    if (document.getElementById('leetcode-korean-styles')) return;
    const style = document.createElement('style');
    style.id = 'leetcode-korean-styles';
    style.textContent = `
        pre, code, .monaco-editor, .ace_editor, [class*="example-block"] pre {
            font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", "Segoe UI Mono", "Liberation Mono", Menlo, Monaco, Consolas, "Courier New", "GulimChe", monospace !important;
        }
        code {
            background-color: rgba(0, 0, 0, 0.05) !important;
            padding: 2px 4px !important;
            border-radius: 3px !important;
            margin: 0 2px !important;
        }
        .dark code, [data-theme="dark"] code {
            background-color: rgba(255, 255, 255, 0.15) !important;
        }
    `;
    document.head.appendChild(style);
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
    { pattern: /^Accepted\s+([\d,.]+)\s*\/\s*([\d,.]+[KMB])$/i, replacement: '맞은 사람 $1 / $2' },
    { pattern: /^([\d,.]+)\s*\/\s*([\d,.]+[KMB])$/, replacement: '$1 / $2' },
    { pattern: /^(\d+)([KMB])$/, replacement: '$1$2' },
    { pattern: /(\d+) months? ago/i, replacement: '$1개월 전' },
    { pattern: /a month ago/i, replacement: '1달 전' },
    { pattern: /(\d+) years? ago/i, replacement: '$1년 전' },
    { pattern: /a year ago/i, replacement: '1년 전' },
    { pattern: /(\d+) days? ago/i, replacement: '$1일 전' },
    { pattern: /a day ago/i, replacement: '하루 전' },
    { pattern: /yesterday/i, replacement: '어제' },
    { pattern: /(\d+) hours? ago/i, replacement: '$1시간 전' },
    { pattern: /(1|an) hour ago/i, replacement: '1시간 전' },
    { pattern: /(\d+) minutes? ago/i, replacement: '$1분 전' },
    { pattern: /(a|1) minute ago/i, replacement: '1분 전' },
    { pattern: /(\d+) seconds? ago/i, replacement: '$1초 전' },
    { pattern: /a few seconds ago/i, replacement: '몇 초 전' },
    { pattern: /just now/i, replacement: '방금' },
    { pattern: /in (\d+) days?/i, replacement: '$1일 후' },
    { pattern: /in a day/i, replacement: '하루 후' },
    { pattern: /^Rating:\s*([\d,.]+)/i, replacement: '레이팅: $1' },
    { pattern: /^Attended:\s*([\d,]+)/i, replacement: '참가 횟수: $1' },
    { pattern: /^Avg\. score:\s*([\d,.]+)/i, replacement: '평균 점수: $1' },
    { pattern: /^(\d+)\s+of\s+(\d+)$/i, replacement: '$1 / $2' },
    { pattern: /^Runtime:\s*(.+)$/i, replacement: '실행시간: $1' },
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
        pattern: /^([a-zA-Z]{3,})\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4}),\s+(\d{1,2}:\d{2})\s+(AM|PM)$/i,
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
    { pattern: /^A verification code has (?:been )?sent to (.+?)\.?$/i, replacement: '인증 코드가 $1로 전송되었습니다.' },
    { pattern: /^(\d+)\s+Selected$/i, replacement: '$1개 선택됨' },
    { pattern: /^Case\s+(\d+)$/i, replacement: '케이스 $1' },
    { pattern: /^submitted at$/i, replacement: '제출 시간:' },
    { pattern: /^Total Participants:\s*([\d,]+)$/i, replacement: '총 참가 인원: $1' },
    { pattern: /^Discussion\s*\(([\d.K]+)\)$/i, replacement: '댓글 ($1)' },
    { pattern: /^Accepted\s+([\d,.\/KMB\s]+)$/i, replacement: '맞은 사람 $1' },
    { pattern: /^(\d+)\s+Questions?$/i, replacement: '$1 문제' },
    { pattern: /^\s*Questions?$/i, replacement: '문제' },
    { pattern: /^Add\s+(\d+)\s+questions?\s+to\s+list$/i, replacement: '$1 문제를 리스트에 추가' },
    {
        pattern: /^You are currently under a (\d+)-day cool-off period until (\d{4}-\d{2}-\d{2}) UTC\.\s*During this cool-off period, you can cancel your account deletion\.$/i,
        replacement: (match, days, date) => {
            const [year, month, day] = date.split('-');
            return `현재 ${year}년 ${month}월 ${parseInt(day, 10)}일까지 ${days}일간의 유예 기간 중입니다. 이 기간 동안 계정 삭제를 취소할 수 있습니다.`;
        }
    },
    { pattern: /^Starts in\s+(.+)$/i, replacement: (match, time) => `${handleRegexTranslations(time)} 후 시작` },
    { pattern: /^Ends in\s+(.+)$/i, replacement: (match, time) => `${handleRegexTranslations(time)} 후 종료` },
];

let isProblemJsonEnabled = true;

chrome.storage.local.get(['translationEnabled', 'useProblemJson'], (result) => {
    if (result.translationEnabled === false) {
        isTranslationEnabled = false;
        return;
    }

    if (result.useProblemJson === false) {
        isProblemJsonEnabled = false;
    }

    initProblemTranslation();
    if (document.body) {
        translateProblemList();

        mainObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

        urlObserver.observe(document.body, { childList: true, subtree: true });
    }

    fetch(chrome.runtime.getURL('src/translations.json'))
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
    for (const mapping of translationMappings) {
        const isMatch = Array.isArray(mapping.urlPattern)
            ? mapping.urlPattern.some(p => currentPath.startsWith(p) || p === "/")
            : currentPath.startsWith(mapping.urlPattern) || mapping.urlPattern === "/";

        if (isMatch) {
            Object.assign(activeTranslations, mapping.translations);
        }
    }

    if (Object.keys(activeTranslations).length > 0) {
        translateNode(document.body);
    }
}

function shouldSkipNode(node) {
    const SKIP_SELECTORS = [
        'pre', 'code', '.monaco-editor', '.ace_editor', '[contenteditable="true"]',
        '.discussion-content', '[data-track-load="discussion_content"]',
        '.ant-modal', '.ant-popover', '.ant-tooltip'
    ];
    const parent = node.parentElement;
    if (parent && SKIP_SELECTORS.some(selector => parent.closest(selector))) return true;
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
        if (pattern.test(newText)) {
            newText = newText.replace(pattern, replacement);
            break;
        }
    }
    return newText;
}

function translateTextNode(node) {
    const originalText = node.nodeValue.trim();
    if (originalText.length === 0) return;

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

    if (translatedText === originalText && /^Accepted$/i.test(originalText)) {
        const el = node.parentElement;
        const container = el?.parentElement;
        const contextText = (container?.textContent || el?.textContent || "");

        if (/[\d,.]+\s*[\/]/.test(contextText)) {
            translatedText = '맞은 사람';
        }
    }

    if (translatedText === originalText && activeTranslations[originalText]) {
        if (!node.parentElement?.hasAttribute('data-keep-original-text')) {
            translatedText = activeTranslations[originalText];
        }
    }

    if (translatedText !== originalText) {
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
            if (activeTranslations[val]) element.setAttribute(attr, activeTranslations[val]);
        }
    });
}

function handleSpecialUIPatterns(element) {
    const text = element.textContent.trim();

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

    const beatsMatch = text.match(/Beats\s*([\d.]+)%/i);
    if (beatsMatch && text.length < 150) {
        let hasChildWithSameBeats = false;
        for (let i = 0; i < element.childNodes.length; i++) {
            if (element.childNodes[i].nodeType === 1 && element.childNodes[i].textContent.match(/Beats\s*([\d.]+)%/i)) {
                hasChildWithSameBeats = true;
                break;
            }
        }
        if (!hasChildWithSameBeats) {
            const percentage = parseFloat(beatsMatch[1]);
            if (!isNaN(percentage)) {
                const topPercentage = (100 - percentage).toFixed(2);
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
                let currNode;
                while ((currNode = walker.nextNode())) {
                    if (/Beats/i.test(currNode.nodeValue)) {
                        currNode.nodeValue = currNode.nodeValue.replace(/Beats/i, "상위 ");
                    }
                    if (currNode.nodeValue.includes(beatsMatch[1] + "%")) {
                        currNode.nodeValue = currNode.nodeValue.replace(beatsMatch[1] + "%", `${topPercentage}%`);
                    } else if (currNode.nodeValue.includes(beatsMatch[1])) {
                        currNode.nodeValue = currNode.nodeValue.replace(beatsMatch[1], topPercentage);
                    }
                }
                return true;
            }
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
        element.innerHTML = KEYWORD_DEFS[normalizedText];
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
    if (!isTranslationEnabled || Object.keys(activeTranslations).length === 0) return;

    if (node.nodeType === 3) {
        if (!shouldSkipNode(node)) translateTextNode(node);
    } else if (node.nodeType === 1) {
        if (shouldSkipNode(node)) return;

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
const mainObserver = new MutationObserver((mutations) => {
    if (!isTranslationEnabled) return;

    let needsFullScan = false;
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

    translateProblemList();
    if (extractProblemSlug()) initProblemTranslation();
    if (pendingHintTranslations && pendingHintTranslations.length > 0) {
        applyHintsIfExpanded();
    }

    if (needsFullScan) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (isTranslationEnabled) translateNode(document.body);
        }, 150);
    }
});

let currentProblemSlug = null;
let problemDataCache = null;

let isProblemTranslationApplied = false;

async function initProblemTranslation() {
    const slug = extractProblemSlug();
    if (!slug) {
        currentProblemSlug = null;
        isProblemTranslationApplied = false;
        return;
    }

    if (slug === currentProblemSlug && isProblemTranslationApplied) return;

    if (slug !== currentProblemSlug) {
        currentProblemSlug = slug;
        isProblemTranslationApplied = false;
    }

    if (!isProblemJsonEnabled) return;

    try {
        if (!problemDataCache) {
            const res = await fetch(chrome.runtime.getURL('src/problem.json'));
            problemDataCache = await res.json();
        }

        if (problemDataCache[slug]) {
            let attempts = 0;
            const tryApply = setInterval(() => {
                const applied = applyProblemTranslation(slug, problemDataCache[slug]);
                if (applied) {
                    isProblemTranslationApplied = true;
                    clearInterval(tryApply);
                }
                attempts++;
                if (attempts > 20) clearInterval(tryApply);
            }, 500);
        }
    } catch { }
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
        '.elfjS',
        '[class*="description"]'
    ];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 50) return el;
    }
    return null;
}

function findTitleElement() {
    const candidates = document.querySelectorAll('div[class*="text-title"], a[class*="text-title"], span[class*="text-title"]');
    for (const el of candidates) {
        if (/^\d+\.\s+.+/.test(el.textContent.trim())) return el;
    }

    const allHeaders = document.querySelectorAll('div, span');
    for (const el of allHeaders) {
        if (/^\d+\.\s+.+/.test(el.textContent.trim()) && el.children.length === 0 && el.textContent.length < 100) {
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
    return match ? match[1] : null;
}

function applyProblemTranslation(slug, data) {
    let success = false;
    if (data.title) {
        const titleEl = findTitleElement();
        if (titleEl) {
            const numMatch = titleEl.textContent.match(/^(\d+)\.\s*/);
            if (numMatch && numMatch[1] !== data.id) {
                return false;
            }

            if (!titleEl.hasAttribute('data-original-title')) {
                titleEl.setAttribute('data-original-title', titleEl.textContent.trim());
            }
            titleEl.textContent = numMatch ? `${numMatch[1]}. ${data.title}` : data.title;
            titleEl.setAttribute('data-translated-title', data.title);
            success = true;
        }
    }
    if (data.description) {
        const descEl = findDescriptionElement();
        if (descEl) {
            const interactiveSelectors = 'button, a, [data-keyword]';

            const globalInteractivePool = new Map();
            descEl.querySelectorAll(interactiveSelectors).forEach(el => {
                const kw = el.getAttribute('data-keyword');
                if (kw) {
                    if (!globalInteractivePool.has(kw)) globalInteractivePool.set(kw, []);
                    globalInteractivePool.get(kw).push(el);
                } else {
                    const id = el.tagName + ":" + el.textContent.trim();
                    if (!globalInteractivePool.has(id)) globalInteractivePool.set(id, []);
                    globalInteractivePool.get(id).push(el);
                }
            });

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = data.description;

            function patchNodes(original, translated) {
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
                        if (original.innerHTML !== translated.innerHTML) original.innerHTML = translated.innerHTML;
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

                            if (kw && globalInteractivePool.has(kw) && globalInteractivePool.get(kw).length > 0) {
                                match = globalInteractivePool.get(kw).shift();
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
            success = true;
        }
    }
    if (data.hints && data.hints.length > 0) {
        pendingHintTranslations = data.hints;
        applyHintsIfExpanded();
    }
    return success;
}

let pendingHintTranslations = null;

function applyHintsIfExpanded() {
    if (!pendingHintTranslations || pendingHintTranslations.length === 0) return;

    const allDivs = document.querySelectorAll('div');
    let hintIndex = 0;

    for (const div of allDivs) {
        const text = div.textContent.trim();
        if ((/^Hint \d+$/.test(text) || /^힌트 \d+$/.test(text)) && div.children.length === 0) {
            const clickTarget = div.closest('[class*="cursor-pointer"]') || div.parentElement;
            if (clickTarget) {
                const contentEl = findHintContent(clickTarget);
                if (contentEl && hintIndex < pendingHintTranslations.length) {
                    const originalText = contentEl.textContent.trim();

                    if (originalText !== pendingHintTranslations[hintIndex] && originalText.length > 5) {
                        if (!contentEl.hasAttribute('data-original-hint')) {
                            contentEl.setAttribute('data-original-hint', originalText);
                        }
                        contentEl.textContent = pendingHintTranslations[hintIndex];
                    }
                }
            }
            hintIndex++;
        }
    }
}

let englishToKoreanTitleMap = null;

function buildTitleMap() {
    if (englishToKoreanTitleMap) return;
    englishToKoreanTitleMap = new Map();
    for (const slug in problemDataCache) {
        const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedSlug.length > 3) {
            englishToKoreanTitleMap.set(normalizedSlug, problemDataCache[slug].title);
        }
    }
}

async function translateProblemList() {
    if (!isTranslationEnabled || !isProblemJsonEnabled) return;

    if (!problemDataCache) {
        try {
            const res = await fetch(chrome.runtime.getURL('src/problem.json'));
            problemDataCache = await res.json();
        } catch { return; }
    }

    if (window.location.href.includes('/studyplan/') || window.location.href.includes('/u/')) {
        buildTitleMap();
    }

    const candidates = document.querySelectorAll('div, span, a, p');
    const isProblemPage = window.location.pathname.includes('/problems/');

    for (const el of candidates) {
        if (el.hasAttribute('data-translated-title')) continue;
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
        if (match && !isProblemPage) {
            const id = match[1];
            const titlePart = match[2].trim();

            for (const slug in problemDataCache) {
                const data = problemDataCache[slug];
                if (data.id === id) {
                    const isTitleMatch = titlePart === data.englishTitle ||
                        text.toLowerCase().includes(data.englishTitle.toLowerCase()) ||
                        window.location.href.includes('/studyplan/') || window.location.href.includes('/u/');

                    if (isTitleMatch) {
                        if (targetTextNode) {
                            targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, `${id}. ${data.title}`);
                        } else {
                            el.textContent = `${id}. ${data.title}`;
                        }
                        el.setAttribute('data-translated-title', 'true');
                        translated = true;
                    }
                    break;
                }
            }
        }

        if (!translated && (window.location.href.includes('/studyplan/') || window.location.href.includes('/u/'))) {
            const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedText.length > 3 && englishToKoreanTitleMap.has(normalizedText)) {
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
                    aTag = parent.querySelector('a[href*="/problems/"]');
                    parent = parent.parentElement;
                }
            }

            if (aTag && aTag.href) {
                const urlMatch = aTag.href.match(/\/problems\/([^/?#]+)/);
                if (urlMatch) {
                    const slug = urlMatch[1];
                    const data = problemDataCache[slug];
                    if (data && data.title) {
                        const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (normalizedText === normalizedSlug && normalizedText.length > 0) {
                            if (targetTextNode) {
                                targetTextNode.nodeValue = targetTextNode.nodeValue.replace(text, data.title);
                            } else {
                                el.textContent = data.title;
                            }
                            el.setAttribute('data-translated-title', 'true');
                        }
                    }
                }
            }
        }
    }
}
