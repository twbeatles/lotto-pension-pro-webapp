const recordsPlan = [
    {
        name: 'runTicketDedupeRegression',
        label: 'ticket-dedupe regression'
    },
    {
        name: 'runTicketQuantityGroupingRegression',
        label: 'ticket-quantity grouping regression'
    },
    {
        name: 'runImmediateTicketSettlementRegression',
        label: 'immediate ticket settlement regression'
    },
    {
        name: 'runTicketReconcileRegression',
        label: 'ticket-reconcile regression',
        awaited: true
    },
    {
        name: 'runCampaignResetAutofillRecoveryRegression',
        label: 'campaign reset autofill recovery regression'
    },
    {
        name: 'runOrphanCampaignAutoCleanupRegression',
        label: 'orphan-campaign auto-cleanup regression'
    },
    {
        name: 'runLoadOrphanCampaignMigrationRegression',
        label: 'load orphan-campaign migration regression'
    },
    {
        name: 'runCheckTargetDrawRegression',
        label: 'check-target-draw regression'
    },
    {
        name: 'runStoredListNormalizationRegression',
        label: 'stored-list-normalization regression'
    },
    {
        name: 'runImportStoredListStrictNormalizationRegression',
        label: 'import stored-list strict normalization regression'
    },
    {
        name: 'runLocalUpdatesFutureGuardRegression',
        label: 'future local-updates guard regression'
    },
    {
        name: 'runGeneratedTicketProvenanceRegression',
        label: 'generated ticket provenance regression'
    },
    {
        name: 'runHistoryActualLogRegression',
        label: 'history actual-log regression',
        awaited: true
    },
    {
        name: 'runClearLocalUpdatesReconcileRegression',
        label: 'clear-local-updates reconcile regression',
        awaited: true
    },
    {
        name: 'runTargetDrawAutofillRegression',
        label: 'target-draw autofill regression'
    },
    {
        name: 'runLatestWinPlaceholderRegression',
        label: 'latest-win-placeholder regression'
    },
    {
        name: 'runStrategyPresetCrudRegression',
        label: 'strategy-preset-crud regression'
    }
];

export { recordsPlan };
