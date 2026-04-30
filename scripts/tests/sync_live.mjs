import { DataManager } from '../../assets/modules/core/DataManager.js';
import { estimateLatestDrawKST } from '../../assets/modules/utils/utils.js';

async function main() {
    const dm = new DataManager();
    const drawNo = Number(process.argv[2] || estimateLatestDrawKST());
    const logs = [];
    const item = await dm.fetchOneDraw(drawNo, { url: '', source: 'built-in' }, (message, code, meta) => {
        logs.push({ message, code, meta });
    });

    if (!item) {
        console.error(JSON.stringify({ ok: false, drawNo, logs }, null, 2));
        process.exitCode = 1;
        return;
    }

    console.log(
        JSON.stringify(
            {
                ok: true,
                drawNo,
                item,
                warnings: logs.filter((entry) => entry.code === 'SYNC_FETCH_ONE_INVALID_PAYLOAD')
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
