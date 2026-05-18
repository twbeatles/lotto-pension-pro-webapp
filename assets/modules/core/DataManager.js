import { dataDefaultsMethods } from './data/defaults.js';
import { dataPersistenceMethods } from './data/persistence.js';
import { dataRecordMethods } from './data/records.js';
import { dataAnalyticsMethods } from './data/analytics.js';
import { dataSyncMethods } from './data/sync.js';
import { dataPension720Methods } from './data/pension720.js';

export class DataManager {
    constructor() {
        this.app = null;
        this.lastTicketAlertKey = '';
        this.state = {
            theme: 'dark',
            favorites: [],
            history: [],
            winningStats: [],
            staticLatestDrawNo: 0,
            pension720Stats: [],
            pension720Tickets: [],
            pension720Campaigns: [],
            pension720Results: [],
            generated: [],
            customProxy: '',
            aiResults: [],
            analytics: null,
            strategyPrefs: this.getDefaultStrategyPrefs(),
            ticketBook: [],
            campaigns: [],
            strategyPresets: [],
            alertPrefs: this.getDefaultAlertPrefs(),
            syncMeta: this.getDefaultSyncMeta()
        };
        this.dataHealth = this.getDefaultDataHealth();
        this._saveTimer = null;
        this._dirtyKeys = {
            fav: false,
            hist: false,
            settings: false,
            ticketBook: false,
            campaigns: false,
            alerts: false,
            presets: false,
            syncMeta: false,
            pension720Tickets: false,
            pension720Campaigns: false
        };
        this._lastStorageWriteFailures = new Map();
        this.pension720DataHealth = this.getDefaultPension720DataHealth();
        this.localUpdatesCache = null;
        this.RANGE_CHUNK_SIZE = 40;
        this.RANGE_CHUNK_CONCURRENCY = 2;
        this.FALLBACK_FETCH_CONCURRENCY = 3;
        this.SYNC_FETCH_TIMEOUT_MS = 4500;
        this.PARTIAL_RECOVERY_WINDOW = 24;
        this.STORAGE_WARNING_BYTES = 350000;
        this.STORAGE_DANGER_BYTES = 900000;
        this.syncInFlightPromise = null;
        this.syncAbortController = null;
        this.syncCancelable = false;
        this.lastWinningStatsLoad = {
            ok: false,
            offline: false,
            error: '',
            updatedAt: ''
        };
        this._syncRunId = 0;
        this._activeSyncRunId = 0;
        this._tabInstanceId = '';
        this._crossTabChannel = null;
        this._crossTabStorageHandler = null;
        this._crossTabSyncBound = false;
        this._suppressCrossTabBroadcast = false;
    }
}

Object.assign(
    DataManager.prototype,
    dataDefaultsMethods,
    dataPersistenceMethods,
    dataRecordMethods,
    dataAnalyticsMethods,
    dataSyncMethods,
    dataPension720Methods
);
