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
    const barrel = await import('../../regressions.mjs');

    regressionBarrelExportNames.forEach((name) => {
        assert.equal(typeof barrel[name], 'function', `regressions barrel must export ${name}()`);
    });
}

export { runFacadeExportParityRegression, runRegressionBarrelExportParityRegression };
