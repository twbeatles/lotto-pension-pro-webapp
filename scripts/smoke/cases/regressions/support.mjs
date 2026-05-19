import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { StrategyEngine } from '../../../../assets/modules/core/StrategyEngine.js';
import { Pension720Engine } from '../../../../assets/modules/core/Pension720Engine.js';
import { StrategyWorkerClient } from '../../../../assets/modules/core/StrategyWorkerClient.js';
import { createRuntimeRng, withRuntimeSeed } from '../../../../assets/modules/core/strategy/runtimeEntropy.js';
import { xorshift32 } from '../../../../assets/modules/core/strategy/shared.js';
import { DataManager } from '../../../../assets/modules/core/DataManager.js';
import { LottoApp } from '../../../../assets/modules/core/LottoApp.js';
import { UIManager } from '../../../../assets/modules/core/UIManager.js';
import { DataIOModule, runPostImportRefresh } from '../../../../assets/modules/features/DataIO.js';
import { GeneratorModule } from '../../../../assets/modules/features/Generator.js';
import { Pension720Module } from '../../../../assets/modules/features/Pension720.js';
import { CheckModule } from '../../../../assets/modules/features/Check.js';
import { buildBackupPayload, normalizeBackupPayload } from '../../../../assets/modules/utils/backup.js';
import { passesFilters } from '../../../../assets/modules/core/StrategyFilters.js';
import { CONFIG } from '../../../../assets/modules/utils/config.js';
import { QrScannerModule } from '../../../../assets/modules/features/QrScanner.js';
import { estimateLatestDrawKST } from '../../../../assets/modules/utils/utils.js';

import { assertTicketShape, buildSmokeRequest, createDocumentStub, createField } from '../../helpers/common.mjs';

export {
    assert,
    assertTicketShape,
    buildBackupPayload,
    buildSmokeRequest,
    CheckModule,
    CONFIG,
    createDocumentStub,
    createField,
    createRuntimeRng,
    DataIOModule,
    DataManager,
    estimateLatestDrawKST,
    GeneratorModule,
    LottoApp,
    normalizeBackupPayload,
    passesFilters,
    Pension720Module,
    Pension720Engine,
    QrScannerModule,
    readFile,
    resolve,
    runPostImportRefresh,
    StrategyEngine,
    StrategyWorkerClient,
    withRuntimeSeed,
    xorshift32,
    UIManager
};
