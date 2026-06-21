/* eslint-disable no-unused-vars */
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
} from '../support.mjs';

import { regressionBarrelExportNames } from '../manifest.mjs';

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

    assert.match(readmeSource, /### 번호 추천/, 'README must document the recommendation feature with the new wording');

    assert.doesNotMatch(readmeSource, /인공지능 예측:/, 'README must drop the legacy AI prediction section title');

    assert.equal(packageJson.name, 'lotto-pension-pro-webapp', 'package name must use the rebranded slug');

    assert.equal(manifestJson.name, '로또·연금복권 프로', 'manifest name must use the rebranded app name');

    assert.match(indexSource, /<title>로또·연금복권 프로<\/title>/, 'index title must use the rebranded app name');

    assert.match(indexSource, /dataStatusSummary/, 'data page must expose lottery data status summary panel');

    assert.match(deploySource, /lotto-pension-pro-webapp/, 'deploy guide must use the rebranded Pages slug');

    assert.match(readmeSource, /데이터 백업 및 복원/, 'README must document the backup and restore feature');

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

export { runLatestWinPlaceholderRegression, runLatestWinDateEscapingRegression, runRecommendationCopyRegression };
