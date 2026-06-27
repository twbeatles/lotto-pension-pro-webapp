import { DataManager } from '../DataManager.js';
import { StrategyWorkerClient } from '../StrategyWorkerClient.js';

export class LottoApp {
    constructor() {
        this.data = new DataManager();
        this.generator = null;
        this.stats = null;
        this.ai = null;
        this.check = null;
        this.dataIO = null;
        this.backtest = null;
        this.pension720 = null;
        this.qr = null;
        this.currentRoute = 'gen';
        this.moduleConstructors = {};
        this.pendingModulePromises = new Map();
        this.dataListDelegationBound = false;
        this.dataHealthActionsBound = false;
        this.routeToken = 0;
        this.navItems = [];
        this.pageItems = [];
        this.navByTarget = new Map();
        this.strategyWorker = new StrategyWorkerClient();
        this.dataListRenderToken = 0;
        this.dateFormatter = new Intl.DateTimeFormat('ko-KR');
        this.dataListPageSize = 20;
        this.dataListState = this._loadDataListStateFromSession();
        this.targetDrawInputIds = ['genTargetDrawNo', 'campStartDraw', 'aiTargetDrawNo'];
        this._pwaInstallPrompt = null;
        this._pwaCacheHealth = null;
        this._networkProbePromise = null;
        this._autoSyncTimer = null;
        this._autoSyncPendingForce = false;
        this._lastAutoSyncAt = 0;
        this._remoteStateSyncTimer = null;
        this._remoteStateSyncKeys = new Set();
        this.AUTO_SYNC_MIN_INTERVAL_MS = 60000;
        this.NETWORK_PROBE_TIMEOUT_MS = 3200;
        this.OFFLINE_CONFIRM_RETRY_MS = 1200;
    }
}