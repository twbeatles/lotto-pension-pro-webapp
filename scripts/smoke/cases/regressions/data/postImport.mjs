/* eslint-disable no-unused-vars */
import {
    assert,
    buildBackupPayload,
    buildSmokeRequest,
    CheckModule,
    CONFIG,
    createDocumentStub,
    createField,
    DataIOModule,
    DataManager,
    estimateLatestDrawKST,
    GeneratorModule,
    LottoApp,
    normalizeBackupPayload,
    runPostImportRefresh,
    UIManager
} from '../support.mjs';

async function runPostImportRefreshRegression() {
    const calls = [];

    const data = {
        state: {
            winningStats: [{ draw_no: 1211 }]
        },

        dataHealth: {
            availability: 'none'
        },

        async fetchWinningStats(options) {
            calls.push(`fetchWinningStats:${JSON.stringify(options)}`);

            data.dataHealth = { availability: 'full' };

            return true;
        },

        markLocalRestoreSuccess(options) {
            calls.push(`markLocalRestoreSuccess:${JSON.stringify(options)}`);
        },

        markLocalRestoreFailure(message) {
            calls.push(`markLocalRestoreFailure:${message}`);
        }
    };

    const app = {
        updateLatestWin() {
            calls.push('updateLatestWin');
        },

        async refreshCurrentRoute() {
            calls.push('refreshCurrentRoute');
        },

        renderDataLists() {
            calls.push('renderDataLists');
        }
    };

    await runPostImportRefresh({ data, app });

    assert.deepEqual(
        calls,

        [
            'fetchWinningStats:{"notifyTicketSettle":false,"preserveExistingOnFailure":false}',

            'markLocalRestoreSuccess:{"drawNo":1211}',

            'updateLatestWin',

            'refreshCurrentRoute',

            'renderDataLists'
        ],

        'post-import refresh order must be preserved'
    );
}

async function runPostImportRefreshFailureRegression() {
    const calls = [];

    const data = {
        state: {
            winningStats: []
        },

        dataHealth: {
            availability: 'none',

            message: '백업 복원 후 당첨 데이터를 다시 구성하지 못했습니다.'
        },

        async fetchWinningStats(options) {
            calls.push(`fetchWinningStats:${JSON.stringify(options)}`);

            return false;
        },

        markLocalRestoreSuccess(options) {
            calls.push(`markLocalRestoreSuccess:${JSON.stringify(options)}`);
        },

        markLocalRestoreFailure(message) {
            calls.push(`markLocalRestoreFailure:${message}`);
        }
    };

    const app = {
        updateLatestWin() {
            calls.push('updateLatestWin');
        },

        async refreshCurrentRoute() {
            calls.push('refreshCurrentRoute');
        },

        renderDataLists() {
            calls.push('renderDataLists');
        }
    };

    await runPostImportRefresh({ data, app });

    assert.deepEqual(
        calls,

        [
            'fetchWinningStats:{"notifyTicketSettle":false,"preserveExistingOnFailure":false}',

            'markLocalRestoreFailure:백업 복원 후 당첨 데이터를 다시 구성하지 못했습니다.',

            'updateLatestWin',

            'refreshCurrentRoute',

            'renderDataLists'
        ],

        'post-import refresh must mark a local-restore failure when winning data rebuild fails'
    );
}

export { runPostImportRefreshRegression, runPostImportRefreshFailureRegression };
