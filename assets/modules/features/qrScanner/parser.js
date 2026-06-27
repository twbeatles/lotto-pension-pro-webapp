export const qrScannerParserMethods = {
    parseLottoQr(url) {
        // Expected format: http://m.dhlottery.co.kr/?v=0861q020612162843q...

        if (!url || typeof url !== 'string') throw new Error('잘못된 주소입니다.');
        const allowedHosts = new Set(['m.dhlottery.co.kr', 'www.dhlottery.co.kr']);
        let host;
        try {
            host = new URL(url).hostname.toLowerCase();
        } catch (e) {
            const hostMatch = String(url).match(/^(?:https?:\/\/)?([^/?#]+)/i);
            host = hostMatch?.[1]?.toLowerCase() || '';
        }

        if (!host || !allowedHosts.has(host)) {
            throw new Error('로또 6/45 공식 큐알 코드가 아닙니다.');
        }

        // Extract 'v' parameter
        let vParam = '';
        try {
            const urlObj = new URL(url);
            vParam = urlObj.searchParams.get('v');
        } catch (e) {
            // Fallback for partial URLs or weird formats
            const match = url.match(/[?&]v=([^&]+)/);
            if (match) vParam = match[1];
        }

        if (!vParam) throw new Error('큐알 코드에 로또 데이터(v 파라미터)가 없습니다.');

        // Parse games (separated by 'q')
        // Format: [DrawNo]q[Game1]q[Game2]...
        const parts = vParam.split('q');
        if (parts.length < 2) throw new Error('데이터 형식이 올바르지 않습니다.');
        const drawNo = Number.parseInt(parts[0], 10);
        if (!Number.isInteger(drawNo) || drawNo < 1) {
            throw new Error('큐알 코드에 유효한 회차 정보가 없습니다.');
        }

        const games = [];
        for (let i = 1; i < parts.length; i++) {
            const gameStr = parts[i].trim();
            // Need at least 12 digits (6 numbers * 2 chars)
            if (gameStr.length < 12) continue;

            const numsStr = gameStr.substring(0, 12);
            const nums = [];
            // Parse pairs
            for (let j = 0; j < 12; j += 2) {
                const n = parseInt(numsStr.substring(j, j + 2), 10);
                if (!isNaN(n) && n >= 1 && n <= 45) {
                    nums.push(n);
                }
            }

            if (nums.length === 6 && new Set(nums).size === 6) {
                nums.sort((a, b) => a - b);
                games.push({
                    targetDrawNo: drawNo,
                    numbers: nums
                });
            }
        }

        if (games.length === 0) throw new Error('큐알 코드에서 유효한 게임을 찾을 수 없습니다.');
        return games;
    }
};