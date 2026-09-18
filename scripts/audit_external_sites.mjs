import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
    estimateLatestDrawKST,
    estimateLatestPension720DrawKST
} from '../assets/modules/utils/utils.js';
import { getDataBaseline } from './update_docs_data_baseline.mjs';

const execFileAsync = promisify(execFile);

const OFFICIAL_LOTTO_URL = 'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=';
const OFFICIAL_PENSION_URL = 'https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do';
const OFFICIAL_WEB_PROBE_URL = 'https://www.dhlottery.co.kr/';
const CORSPROXY_TEST_URL = 'https://corsproxy.io/?url=';

const LOTTO_PATH = resolve('data/winning_stats.json');
const PENSION_PATH = resolve('data/pension720_stats.json');

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

async function runNodeScript(scriptPath, args = []) {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 16
    });
    return result;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

async function checkLottoOfficial(targetDrawNo) {
    const url = `${OFFICIAL_LOTTO_URL}${targetDrawNo}`;
    try {
        const res = await fetchWithTimeout(url, {
            headers: { Origin: 'https://twbeatles.github.io' }
        });
        const text = await res.text();
        const json = JSON.parse(text);
        const item = json?.data?.list?.[0];
        if (!item || !item.ltEpsd) {
            return {
                ok: false,
                status: res.status,
                message: `응답에 ${targetDrawNo}회 데이터가 없습니다.`
            };
        }
        const acao = res.headers.get('access-control-allow-origin');
        return {
            ok: true,
            status: res.status,
            drawNo: Number(item.ltEpsd),
            date: item.ltRflYmd,
            numbers: [item.tm1WnNo, item.tm2WnNo, item.tm3WnNo, item.tm4WnNo, item.tm5WnNo, item.tm6WnNo],
            bonus: item.bnsWnNo,
            corsReflected: Boolean(acao && acao.includes('twbeatles.github.io'))
        };
    } catch (err) {
        return {
            ok: false,
            message: err.message
        };
    }
}

async function checkPensionOfficial() {
    try {
        const res = await fetchWithTimeout(OFFICIAL_PENSION_URL, {
            headers: { Origin: 'https://twbeatles.github.io' }
        });
        const text = await res.text();
        const json = JSON.parse(text);
        const list = json?.data?.result || json?.result;
        if (!Array.isArray(list) || !list.length) {
            return {
                ok: false,
                status: res.status,
                message: '응답에 연금복권 목록 데이터가 없습니다.'
            };
        }
        const latest = list[0];
        const acao = res.headers.get('access-control-allow-origin');
        return {
            ok: true,
            status: res.status,
            drawNo: Number(latest.psltEpsd),
            date: latest.psltRflYmd,
            group: latest.wnBndNo,
            number: latest.wnRnkVl,
            bonus: latest.bnsRnkVl,
            corsReflected: Boolean(acao && acao.includes('twbeatles.github.io'))
        };
    } catch (err) {
        return {
            ok: false,
            message: err.message
        };
    }
}

async function checkWebProbe() {
    try {
        const res = await fetchWithTimeout(OFFICIAL_WEB_PROBE_URL, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return { ok: res.ok, status: res.status };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

async function checkCorsProxy() {
    try {
        const testTarget = encodeURIComponent(`${OFFICIAL_LOTTO_URL}1200`);
        const res = await fetchWithTimeout(`${CORSPROXY_TEST_URL}${testTarget}`, {
            headers: { Origin: 'http://127.0.0.1' }
        });
        if (res.status === 401) {
            return { ok: false, status: 401, note: 'API 키 필요 (앱은 공식 CORS를 기본 사용하므로 정상)' };
        }
        return { ok: res.ok, status: res.status };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

async function main() {
    const doFix = process.argv.includes('--fix');
    console.log('===============================================================');
    console.log(' [로또·연금복권 프로] 외부 사이트 및 데이터 무결성 종합 점검');
    console.log('===============================================================');

    const estimatedLottoDraw = estimateLatestDrawKST();
    const estimatedPensionDraw = estimateLatestPension720DrawKST();

    const lottoRows = await readJson(LOTTO_PATH);
    const pensionRows = await readJson(PENSION_PATH);
    const baseline = getDataBaseline(lottoRows, pensionRows);

    console.log(`\n1. 로컬 정적 데이터 현황:`);
    const lottoBehind = Math.max(0, estimatedLottoDraw - baseline.lottoLatestDrawNo);
    const pensionBehind = Math.max(0, estimatedPensionDraw - baseline.pensionLatestDrawNo);
    console.log(
        `   • 로또 6/45:    최신 ${baseline.lottoLatestDrawNo}회 (추정: ${estimatedLottoDraw}회, 지연: ${lottoBehind}회) ` +
            (lottoBehind === 0 ? '[OK]' : '[STALE]')
    );
    console.log(
        `   • 연금복권720+: 최신 ${baseline.pensionLatestDrawNo}회 (추정: ${estimatedPensionDraw}회, 지연: ${pensionBehind}회) ` +
            (pensionBehind === 0 ? '[OK]' : '[STALE]')
    );

    console.log(`\n2. 외부 사이트 연동 상태 점검:`);

    process.stdout.write('   • 동행복권 웹 루트 프로브 (dhlottery.co.kr)... ');
    const probeRes = await checkWebProbe();
    console.log(probeRes.ok ? `[OK] (HTTP ${probeRes.status})` : `[FAIL] (${probeRes.message || probeRes.status})`);

    process.stdout.write(`   • 동행복권 로또 API (${estimatedLottoDraw}회 조회)... `);
    const lottoOfficial = await checkLottoOfficial(estimatedLottoDraw);
    if (lottoOfficial.ok) {
        const corsText = lottoOfficial.corsReflected ? 'CORS 반영 [OK]' : 'CORS 미반영 [WARN]';
        console.log(`[OK] (공식 최신: ${lottoOfficial.drawNo}회, 일자: ${lottoOfficial.date}, ${corsText})`);
    } else {
        console.log(`[FAIL] (${lottoOfficial.message})`);
    }

    process.stdout.write('   • 동행복권 연금복권 API (목록 조회)... ');
    const pensionOfficial = await checkPensionOfficial();
    if (pensionOfficial.ok) {
        const corsText = pensionOfficial.corsReflected ? 'CORS 반영 [OK]' : 'CORS 미반영 [WARN]';
        console.log(
            `[OK] (공식 최신: ${pensionOfficial.drawNo}회, 1등: ${pensionOfficial.group}조 ${pensionOfficial.number}, ${corsText})`
        );
    } else {
        console.log(`[FAIL] (${pensionOfficial.message})`);
    }

    process.stdout.write('   • 공개 프록시 (corsproxy.io)... ');
    const corsProxyRes = await checkCorsProxy();
    if (corsProxyRes.status === 401) {
        console.log(`[INFO] HTTP 401: API 키 필요 (공식 CORS 직통 경로가 1순위이므로 정상)`);
    } else if (corsProxyRes.ok) {
        console.log(`[OK] (HTTP ${corsProxyRes.status})`);
    } else {
        console.log(`[WARN] (${corsProxyRes.message || corsProxyRes.status})`);
    }

    console.log(`\n3. 문서 베이스라인 일치 검사:`);
    let docsStale = false;
    try {
        await runNodeScript('scripts/update_docs_data_baseline.mjs', ['--check']);
        console.log('   • README, claude.md, gemini.md, deploy_github_pages.md, PROJECT_AUDIT.md: [OK]');
    } catch (_err) {
        docsStale = true;
        console.log('   • 문서 베이스라인 불일치 발견: [STALE]');
    }

    const needsFix = lottoBehind > 0 || pensionBehind > 0 || docsStale;

    console.log('\n---------------------------------------------------------------');
    if (!needsFix) {
        console.log(' [결과] 모든 외부 사이트 및 데이터가 정상이며 최신 상태입니다. (수정 불필요)');
        console.log('---------------------------------------------------------------\n');
        return;
    }

    if (!doFix) {
        console.log(' [결과] 최신 회차 데이터 갱신 또는 문서 동기화가 필요합니다!');
        console.log('       자동 수정을 수행하려면 다음 명령을 실행하세요:');
        console.log('       >> npm run sync:all (또는 node scripts/audit_external_sites.mjs --fix)');
        console.log('---------------------------------------------------------------\n');
        process.exitCode = 1;
        return;
    }

    console.log(' [자동 수정] --fix 옵션이 활성화되었습니다. 최신 데이터 갱신을 시작합니다...');
    console.log('---------------------------------------------------------------');

    console.log('\n[1/3] 공식 사이트 최신 데이터 동기화 및 SW 매니페스트 재생성...');
    const refreshRes = await runNodeScript('scripts/refresh_ci_data.mjs');
    if (refreshRes.stdout) process.stdout.write(refreshRes.stdout);

    console.log('\n[2/3] 문서 데이터 베이스라인 동기화...');
    const docRes = await runNodeScript('scripts/update_docs_data_baseline.mjs');
    if (docRes.stdout) process.stdout.write(docRes.stdout);

    console.log('\n[3/3] 전체 릴리스 게이트 무결성 검증...');
    const releaseRes = await runNodeScript('scripts/check_static_data_freshness.mjs', ['--strict']);
    if (releaseRes.stdout) process.stdout.write(releaseRes.stdout);

    console.log('\n===============================================================');
    console.log(' [완료] 최신 데이터 동기화 및 무결성 검증이 성공적으로 완료되었습니다.');
    console.log('===============================================================\n');
}

main().catch((err) => {
    console.error('\n[ERROR] 진단 중 오류가 발생했습니다:', err);
    process.exitCode = 1;
});
