export const CONFIG = {
    KEYS: {
        FAV: 'lotto_pro_fav_v2',
        HIST: 'lotto_pro_hist_v2',
        SETTINGS: 'lotto_pro_settings_v2',
        TICKET_BOOK: 'lotto_pro_ticketbook_v1',
        CAMPAIGNS: 'lotto_pro_campaigns_v1',
        ALERT_PREFS: 'lotto_pro_alerts_v1',
        STRATEGY_PRESETS: 'lotto_pro_strategy_presets_v1',
        SYNC_META: 'lotto_pro_sync_meta_v1',
        LOCAL_UPDATES: 'lotto_pro_updates_v2',
        PENSION720_STATS_CACHE: 'lotto_pro_pension720_stats_cache_v1',
        PENSION720_TICKETS: 'lotto_pro_pension720_tickets_v1',
        PENSION720_CAMPAIGNS: 'lotto_pro_pension720_campaigns_v1',
        LEGACY_PROXY: 'lotto_webapp_settings_v1.proxyLatestUrl',
        LEGACY_SETTINGS: 'lotto_webapp_settings_v1',
        SESSION_DATA_LIST_STATE: 'lotto_pro_datalist_state',
        SESSION_RESULTS_STATE: 'lotto_pro_temp_results_state',
        SESSION_QUERY_PROXY_ACK: 'lotto_pro_query_proxy_ack'
    },
    LIMITS: {
        MAX_SET: 20,
        RANGE: 45,
        MAX_HIST: 500,
        MAX_FIXED: 5,
        MAX_BACKTEST_SPAN: 300,
        MAX_CAMPAIGN_WEEKS: 52,
        MAX_CAMPAIGN_SETS_PER_WEEK: 20,
        MAX_CAMPAIGN_TOTAL_TICKETS: 500,
        MAX_IMPORT_BYTES: 32 * 1024 * 1024,
        IMPORT_SIZE_WARNING_BYTES: 8 * 1024 * 1024,
        MAX_IMPORT_TICKETS: 2000,
        MAX_PENSION720_TICKETS: 1000,
        MAX_STRATEGY_REQUEST_BYTES: 8000,
        MAX_SERIALIZABLE_DEPTH: 8,
        MAX_SERIALIZABLE_KEYS: 80,
        MAX_SERIALIZABLE_ARRAY_ITEMS: 500,
        MAX_SYNC_FALLBACK_DRAWS: 120,
        // 정적 데이터에서 누락된 것이 확인된 회차 목록
        MISSING_DRAWS: [146]
    }
};
