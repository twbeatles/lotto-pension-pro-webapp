import {
    assert,
    CheckModule,
    createDocumentStub,
    createField,
    DataManager,
    LottoApp,
    QrScannerModule,
    readFile,
    resolve,
    UIManager
} from './support.mjs';
import { regressionBarrelExportNames } from './manifest.mjs';

function runQrValidationRegression() {
    const parse = (value) => QrScannerModule.prototype.parseLottoQr.call({}, value);

    const ok = parse('https://m.dhlottery.co.kr/?v=0861q010203040506');
    assert.equal(ok.length, 1, 'valid official QR must be parsed');
    assert.equal(ok[0].targetDrawNo, 861, 'QR parser must preserve draw number');
    assert.deepEqual(ok[0].numbers, [1, 2, 3, 4, 5, 6], 'QR parser must preserve ticket numbers');

    assert.throws(
        () => parse('https://evil.example.com/?v=0861q010203040506'),
        /공식 큐알 코드/,
        'non-official host must be rejected'
    );

    assert.throws(
        () => parse('https://m.dhlottery.co.kr/?v=0861q010101020304'),
        /유효한 게임/,
        'duplicate-number game must be rejected'
    );
}

function runLatestWinPlaceholderRegression() {
    const previousDocument = globalThis.document;
    const latestDrawNo = createField();
    const latestWinBalls = createField();
    const latestWinMeta = createField();

    globalThis.document = createDocumentStub({
        '#latestDrawNo': latestDrawNo,
        '#latestWinBalls': latestWinBalls,
        '#latestWinMeta': latestWinMeta
    });

    try {
        const ctx = {
            data: {
                state: {
                    winningStats: []
                }
            },
            renderLatestWinPlaceholder: LottoApp.prototype.renderLatestWinPlaceholder
        };
        LottoApp.prototype.updateLatestWin.call(ctx, { offline: true });
        assert.equal(latestDrawNo.textContent, '오프라인', 'latest draw badge must show offline state');
        assert.match(
            latestWinBalls.innerHTML,
            /최신 당첨결과를 불러오지 못했습니다/,
            'latest win card must render offline placeholder'
        );
        assert.match(
            latestWinMeta.innerHTML,
            /오프라인 상태입니다/,
            'latest win card must explain offline placeholder'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runLatestWinDateEscapingRegression() {
    const previousDocument = globalThis.document;
    const latestDrawNo = createField();
    const latestWinBalls = createField();
    const latestWinMeta = createField();

    globalThis.document = createDocumentStub({
        '#latestDrawNo': latestDrawNo,
        '#latestWinBalls': latestWinBalls,
        '#latestWinMeta': latestWinMeta
    });

    try {
        const ctx = {
            data: {
                state: {
                    winningStats: [
                        {
                            draw_no: 1221,
                            date: '2026-04-25<script>alert(1)</script>',
                            numbers: [1, 2, 3, 4, 5, 6],
                            bonus: 7,
                            prize_amount: 0
                        }
                    ]
                },
                getDataFreshness() {
                    return {};
                }
            },
            getSuggestedNextDrawNo() {
                return 1222;
            },
            setTargetDrawInputValue() {
                return false;
            }
        };

        LottoApp.prototype.updateLatestWin.call(ctx);

        assert.doesNotMatch(latestWinMeta.innerHTML, /<script>/, 'latest win date must not render raw tags');
        assert.match(
            latestWinMeta.innerHTML,
            /2026-04-25&lt;script&gt;alert\(1\)&lt;\/script&gt;/,
            'latest win date must be HTML-escaped in metadata'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runQrScanReentryGuardRegression() {
    const previousDocument = globalThis.document;
    const calls = [];

    globalThis.document = {
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    try {
        const ctx = {
            isHandlingSuccess: false,
            parseLottoQr() {
                calls.push('parse');
                return [{ targetDrawNo: 861, numbers: [1, 2, 3, 4, 5, 6] }];
            },
            async stop() {
                calls.push('stop');
                await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
            },
            app: {
                async route(target) {
                    calls.push(`route:${target}`);
                },
                check: {
                    setScannedNumbers(items) {
                        calls.push(`set:${items.length}`);
                    }
                }
            }
        };

        await Promise.all([
            QrScannerModule.prototype.onScanSuccess.call(ctx, 'qr'),
            QrScannerModule.prototype.onScanSuccess.call(ctx, 'qr')
        ]);

        assert.equal(
            calls.filter((x) => x === 'parse').length,
            1,
            'QR success handler must parse only once while busy'
        );
        assert.equal(calls.filter((x) => x === 'stop').length, 1, 'QR success handler must stop scanner only once');
        assert.equal(calls.filter((x) => x === 'route:check').length, 1, 'QR success handler must route only once');
        assert.equal(
            calls.filter((x) => x === 'set:1').length,
            1,
            'QR success handler must set scanned numbers only once'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runQrRouteCleanupRegression() {
    const previousDocument = globalThis.document;
    const genPage = createField();
    genPage.classList = { add() {}, remove() {} };

    globalThis.document = createDocumentStub({
        '#page-gen': genPage
    });

    try {
        const calls = [];
        const ctx = {
            routeToken: 0,
            currentRoute: 'check',
            navItems: [],
            pageItems: [],
            navByTarget: new Map(),
            syncRouteDataNotice() {},
            renderRouteDataGate() {
                return false;
            },
            qr: {
                async stop() {
                    calls.push('qr.stop');
                }
            },
            updateLatestWin() {
                calls.push('updateLatestWin');
            }
        };

        await LottoApp.prototype.route.call(ctx, 'gen');
        assert.deepEqual(
            calls,
            ['qr.stop', 'updateLatestWin'],
            'leaving check route must stop QR scanner before rendering next route'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runNotificationPermissionRegression() {
    const previousToast = UIManager.toast;
    const toasts = [];
    UIManager.toast = (message, type = 'info') => {
        toasts.push(`${type}:${message}`);
    };

    try {
        const deniedCalls = [];
        await LottoApp.prototype.handleSystemNotificationToggle.call(
            {
                data: {
                    async requestNotificationPermission() {
                        deniedCalls.push('request');
                        return { code: 'denied', label: '차단됨' };
                    },
                    setAlertPrefs(next) {
                        deniedCalls.push(`set:${JSON.stringify(next)}`);
                    }
                },
                renderDataLists() {
                    deniedCalls.push('render');
                }
            },
            true
        );

        assert.deepEqual(
            deniedCalls,
            ['request', 'set:{"enableSystemNotification":false}', 'render'],
            'denied notification permission must revert the toggle state'
        );
        assert.ok(
            toasts.some((item) => item.startsWith('info:')),
            'denied flow must show 안내 toast'
        );

        toasts.length = 0;
        const grantedCalls = [];
        await LottoApp.prototype.handleSystemNotificationToggle.call(
            {
                data: {
                    async requestNotificationPermission() {
                        grantedCalls.push('request');
                        return { code: 'granted', label: '허용됨' };
                    },
                    setAlertPrefs(next) {
                        grantedCalls.push(`set:${JSON.stringify(next)}`);
                    }
                },
                renderDataLists() {
                    grantedCalls.push('render');
                }
            },
            true
        );

        assert.deepEqual(
            grantedCalls,
            ['request', 'set:{"enableSystemNotification":true}', 'render'],
            'granted notification permission must keep system notifications enabled'
        );
        assert.ok(
            toasts.some((item) => item.startsWith('success:')),
            'granted flow must show success toast'
        );
    } finally {
        UIManager.toast = previousToast;
    }
}

function runDataListPaginationRegression() {
    const ctx = {
        dataListPageSize: 20,
        dataListState: {
            ticket: { query: '', page: 3 }
        },
        getDataListState: LottoApp.prototype.getDataListState
    };
    const items = Array.from({ length: 55 }, (_, idx) => idx + 1);
    const page = LottoApp.prototype.paginateItems.call(ctx, 'ticket', items);
    assert.equal(page.page, 3, 'existing page must be preserved when in range');
    assert.equal(page.items.length, 15, 'last page must render only remaining items');
    assert.equal(page.items[0], 41, 'last page must start from the correct offset');

    LottoApp.prototype.setDataListQuery.call(ctx, 'ticket', '1210');
    assert.equal(ctx.dataListState.ticket.page, 1, 'changing search query must reset the page to 1');
}

function runDataListDomRegression() {
    const previousDocument = globalThis.document;
    const favSearch = createField();
    const historySearch = createField();
    const ticketSearch = createField();
    const campaignSearch = createField();
    const favList = createField();
    const historyList = createField();
    const ticketList = createField();
    const campaignList = createField();
    const favPagination = createField();
    const historyPagination = createField();
    const ticketPagination = createField();
    const campaignPagination = createField();
    const ticketFilter = createField({ value: 'all' });
    const localUpdatesSummary = createField();
    const localUpdatesMeta = createField();
    const clearLocalUpdatesBtn = createField();

    globalThis.document = createDocumentStub({
        '#favSearch': favSearch,
        '#historySearch': historySearch,
        '#ticketSearch': ticketSearch,
        '#campaignSearch': campaignSearch,
        '#favList': favList,
        '#historyList': historyList,
        '#ticketList': ticketList,
        '#campaignList': campaignList,
        '#favPagination': favPagination,
        '#historyPagination': historyPagination,
        '#ticketPagination': ticketPagination,
        '#campaignPagination': campaignPagination,
        '#ticketFilter': ticketFilter,
        '#localUpdatesSummary': localUpdatesSummary,
        '#localUpdatesMeta': localUpdatesMeta,
        '#clearLocalUpdatesBtn': clearLocalUpdatesBtn
    });

    try {
        const ctx = {
            data: {
                state: {
                    favorites: Array.from({ length: 25 }, (_, idx) => ({
                        numbers: [1, 2, 3, 4, 5, idx + 6],
                        date: `2026-03-${String((idx % 25) + 1).padStart(2, '0')}T00:00:00.000Z`
                    })),
                    history: [{ numbers: [6, 7, 8, 9, 10, 11], date: '2026-02-01T00:00:00.000Z' }],
                    ticketBook: [
                        {
                            id: 'ticket<&"\'',
                            numbers: [1, 2, 3, 4, 5, 6],
                            targetDrawNo: 1210,
                            checked: null,
                            quantity: 2
                        }
                    ],
                    campaigns: [
                        {
                            id: 'campaign_1',
                            name: '테스트 캠페인',
                            startDrawNo: 1210,
                            weeks: 4,
                            setsPerWeek: 3
                        }
                    ]
                },
                getTicketQuantity(ticket) {
                    return Number(ticket?.quantity || 1);
                },
                getTotalTicketCount(tickets = []) {
                    return (tickets || []).reduce((sum, ticket) => sum + Number(ticket?.quantity || 1), 0);
                },
                getLocalUpdates() {
                    return [{ draw_no: 1211 }];
                }
            },
            dateFormatter: new Intl.DateTimeFormat('ko-KR'),
            dataListPageSize: 20,
            dataListState: {
                fav: { query: '2026-03-10', page: 1 },
                history: { query: '', page: 1 },
                ticket: { query: '', page: 1 },
                campaign: { query: '', page: 1 }
            },
            renderSettingsPanel() {},
            escapeHtml: LottoApp.prototype.escapeHtml,
            getDataListState: LottoApp.prototype.getDataListState,
            matchesSearch: LottoApp.prototype.matchesSearch,
            paginateItems: LottoApp.prototype.paginateItems,
            renderPagination: LottoApp.prototype.renderPagination,
            getTicketStatusMeta: LottoApp.prototype.getTicketStatusMeta,
            formatDate: LottoApp.prototype.formatDate
        };

        LottoApp.prototype.renderDataLists.call(ctx);

        assert.equal(favSearch.value, '2026-03-10', 'favorite search input must reflect list state');
        assert.match(favList.innerHTML, /data-raw-index="/, 'favorite rows must keep raw index for delegated actions');
        assert.ok(!favList.innerHTML.includes('2026. 3. 11.'), 'favorite search must filter out unmatched rows');
        assert.match(favPagination.innerHTML, /총 1개/, 'favorite pagination summary must render');
        assert.match(favPagination.innerHTML, /1 \/ 1/, 'favorite pagination page text must render');
        assert.match(
            ticketList.innerHTML,
            /data-id="ticket&lt;&amp;&quot;&#39;"/,
            'ticket data-id must be HTML-escaped'
        );
        assert.match(ticketList.innerHTML, /x2/, 'ticket list must render grouped quantity badge');
        assert.match(
            ticketPagination.innerHTML,
            /총 2개 티켓/,
            'ticket pagination summary must use physical ticket count'
        );
        assert.match(
            localUpdatesSummary.textContent,
            /1개/,
            'local updates summary must reflect stored local update count'
        );
        assert.match(localUpdatesMeta.textContent, /1211회/, 'local updates meta must show latest local draw number');
        assert.equal(
            clearLocalUpdatesBtn.disabled,
            false,
            'local updates clear button must be enabled when updates exist'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

function runCheckTargetCardAttributeEscapingRegression() {
    const previousDocument = globalThis.document;
    const listEl = createField();
    const metaEl = createField();
    const ticketFilterRow = createField({ hidden: false });

    globalThis.document = createDocumentStub({
        '#checkTargetCards': listEl,
        '#checkSelectionMeta': metaEl,
        '#checkTicketStatusRow': ticketFilterRow
    });

    try {
        const ctx = {
            source: 'tickets',
            ticketStatusFilter: 'all',
            searchQuery: '',
            selectedItemKey: '',
            dateFormatter: new Intl.DateTimeFormat('ko-KR'),
            data: {
                state: {
                    ticketBook: [
                        {
                            id: 'ticket" autofocus onfocus="alert(1)',
                            numbers: [1, 2, 3, 4, 5, 6],
                            targetDrawNo: 1221,
                            checked: null,
                            quantity: 1
                        }
                    ]
                },
                getTicketQuantity(ticket) {
                    return Number(ticket?.quantity || 1);
                }
            },
            getList: CheckModule.prototype.getList,
            getTicketStatusLabel: CheckModule.prototype.getTicketStatusLabel,
            getTicketStatusCode: CheckModule.prototype.getTicketStatusCode,
            getItemQuantity: CheckModule.prototype.getItemQuantity,
            formatDate: CheckModule.prototype.formatDate,
            buildItemKey: CheckModule.prototype.buildItemKey,
            matchesQuery: CheckModule.prototype.matchesQuery,
            getVisibleItems: CheckModule.prototype.getVisibleItems,
            ensureSelection: CheckModule.prototype.ensureSelection
        };

        CheckModule.prototype.renderList.call(ctx);

        assert.doesNotMatch(
            listEl.innerHTML,
            /data-item-key="ticket" autofocus/,
            'check target card must not allow injected attributes through data-item-key'
        );
        assert.match(
            listEl.innerHTML,
            /data-item-key="ticket&quot; autofocus onfocus=&quot;alert\(1\)"/,
            'check target card must HTML-escape data-item-key values'
        );
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
}

async function runRecommendationCopyRegression() {
    const [
        indexSource,
        readmeSource,
        packageSource,
        manifestSource,
        deploySource,
        claudeSource,
        geminiSource,
        fetchPensionSource,
        catalogSource,
        aiRenderingSource
    ] = await Promise.all([
        readFile(resolve(process.cwd(), 'index.html'), 'utf8'),
        readFile(resolve(process.cwd(), 'README.md'), 'utf8'),
        readFile(resolve(process.cwd(), 'package.json'), 'utf8'),
        readFile(resolve(process.cwd(), 'manifest.json'), 'utf8'),
        readFile(resolve(process.cwd(), 'deploy_github_pages.md'), 'utf8'),
        readFile(resolve(process.cwd(), 'claude.md'), 'utf8'),
        readFile(resolve(process.cwd(), 'gemini.md'), 'utf8'),
        readFile(resolve(process.cwd(), 'scripts/fetch_pension720_stats.mjs'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/core/StrategyCatalog.js'), 'utf8'),
        readFile(resolve(process.cwd(), 'assets/modules/features/ai/rendering.js'), 'utf8')
    ]);
    const packageJson = JSON.parse(packageSource);
    const manifestJson = JSON.parse(manifestSource);
    const legacyBrandPattern = new RegExp(
        [`로또 6/45 ${'프로'}`, `lotto-${'webapp'}`, `lotto${'---'}webapp`].join('|')
    );

    assert.match(indexSource, /번호 추천/, 'UI must expose the new recommendation naming');
    assert.doesNotMatch(
        indexSource,
        /통계 추천|AI 추천|난수 시드|Merge|Overwrite|사용자 프록시|프록시 설정 적용/,
        'legacy beginner-facing copy must stay out of index.html'
    );
    assert.match(indexSource, /추천 시작/, 'recommendation CTA must use 추천 wording');
    assert.doesNotMatch(indexSource, /인공지능 예측/, 'legacy AI prediction wording must be removed from index');
    assert.match(readmeSource, /번호 추천:/, 'README must document the recommendation feature with the new wording');
    assert.doesNotMatch(readmeSource, /인공지능 예측:/, 'README must drop the legacy AI prediction section title');
    assert.equal(packageJson.name, 'lotto-pension-pro-webapp', 'package name must use the rebranded slug');
    assert.equal(manifestJson.name, '로또·연금복권 프로', 'manifest name must use the rebranded app name');
    assert.match(indexSource, /<title>로또·연금복권 프로<\/title>/, 'index title must use the rebranded app name');
    assert.match(indexSource, /dataStatusSummary/, 'data page must expose lottery data status summary panel');
    assert.match(deploySource, /lotto-pension-pro-webapp/, 'deploy guide must use the rebranded Pages slug');
    assert.match(deploySource, /기존 설치형 PWA/, 'deploy guide must document installed PWA migration');
    assert.match(readmeSource, /lotto_pension_pro_backup_v5/, 'README must document the backup v5 filename prefix');
    [indexSource, readmeSource, packageSource, manifestSource, claudeSource, geminiSource, fetchPensionSource].forEach(
        (source) => {
            assert.doesNotMatch(
                source,
                legacyBrandPattern,
                'legacy app/package names must not remain in active docs or metadata'
            );
        }
    );
    assert.doesNotMatch(catalogSource, /표준 인공지능/, 'strategy catalog must not claim a standard AI model');
    assert.doesNotMatch(
        catalogSource,
        /신경망 형태/,
        'strategy catalog must not describe heuristic logic as a neural network'
    );
    assert.doesNotMatch(
        catalogSource,
        /3개만 맞아도 최소 일정 등수/,
        'wheeling copy must not promise guaranteed hit behavior'
    );
    assert.match(
        aiRenderingSource,
        /const tierLabels = \{ A: '기본', B: '확장', C: '실험' \};/,
        'tier labels must use the softened wording'
    );
    assert.match(
        aiRenderingSource,
        /내부 랭킹 점수/,
        'recommendation detail copy must use the internal ranking wording'
    );
}

async function runLiveRegionAccessibilityRegression() {
    const indexSource = await readFile(resolve(process.cwd(), 'index.html'), 'utf8');
    ['genResultList', 'aiOutput', 'checkResultArea', 'syncLog'].forEach((id) => {
        const pattern = new RegExp(`id="${id}"[\\s\\S]*?aria-live="polite"[\\s\\S]*?aria-busy="false"`);
        assert.match(indexSource, pattern, `${id} must expose live and busy attributes`);
    });
}

function runFacadeExportParityRegression() {
    const lottoAppMethods = [
        'init',
        'route',
        'refreshCurrentRoute',
        'requestNumbers',
        'bindDataEvents',
        'bindSettingsModal'
    ];
    lottoAppMethods.forEach((name) => {
        assert.equal(typeof LottoApp.prototype[name], 'function', `LottoApp prototype must expose ${name}()`);
    });

    const dataManagerMethods = [
        'load',
        'save',
        'fetchWinningStats',
        'fetchLatestFromAPI',
        'addTicket',
        'clearTicketBook',
        'cleanupStoredRecords'
    ];
    dataManagerMethods.forEach((name) => {
        assert.equal(typeof DataManager.prototype[name], 'function', `DataManager prototype must expose ${name}()`);
    });

    const uiManagerMethods = [
        'init',
        'openModal',
        'closeModal',
        'toast',
        'renderBalls',
        'copyText',
        'copyNumbers',
        'showQR'
    ];
    uiManagerMethods.forEach((name) => {
        assert.equal(typeof UIManager[name], 'function', `UIManager must expose static ${name}()`);
    });

    const checkModuleMethods = ['bindEvents', 'onEnter', 'run', 'renderList', 'setScannedNumbers'];
    checkModuleMethods.forEach((name) => {
        assert.equal(typeof CheckModule.prototype[name], 'function', `CheckModule prototype must expose ${name}()`);
    });
}

async function runRegressionBarrelExportParityRegression() {
    const barrel = await import('../regressions.mjs');

    regressionBarrelExportNames.forEach((name) => {
        assert.equal(typeof barrel[name], 'function', `regressions barrel must export ${name}()`);
    });
}

export {
    runCheckTargetCardAttributeEscapingRegression,
    runDataListDomRegression,
    runDataListPaginationRegression,
    runFacadeExportParityRegression,
    runLatestWinDateEscapingRegression,
    runLatestWinPlaceholderRegression,
    runLiveRegionAccessibilityRegression,
    runNotificationPermissionRegression,
    runQrRouteCleanupRegression,
    runQrScanReentryGuardRegression,
    runQrValidationRegression,
    runRecommendationCopyRegression,
    runRegressionBarrelExportParityRegression
};
