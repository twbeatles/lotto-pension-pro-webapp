function deriveCampaignRuntimeRequest(baseRequest, weekIndex = 0) {
    const normalizedWeekIndex = Math.max(0, Math.floor(Number(weekIndex) || 0));
    const baseSeed = baseRequest?.params?.seed;
    const hasSeed = baseSeed !== null && baseSeed !== undefined && baseSeed !== '' && Number.isFinite(Number(baseSeed));

    return {
        ...baseRequest,
        params: {
            ...(baseRequest?.params || {}),
            seed: hasSeed ? Math.floor(Number(baseSeed)) + normalizedWeekIndex : null
        }
    };
}

export const generatorActionHelperMethods = {
    getGeneratedEntry(index) {
        return this.data.getGeneratedEntries()[Number(index)] || null;
    },

    saveGeneratedEntryToTicket(entry, targetDrawNo) {
        const generatedEntry = this.data.normalizeGeneratedEntry(entry, { source: 'generator' });
        if (!generatedEntry) return null;
        return this.app.data.addTicket(generatedEntry.numbers, {
            source: generatedEntry.source || 'generator',
            targetDrawNo,
            strategyRequest: generatedEntry.strategyRequest || this.getStrategyRequestFromUI()
        });
    },

    getCampaignRuntimeRequest(baseRequest, weekIndex = 0) {
        return deriveCampaignRuntimeRequest(baseRequest, weekIndex);
    }
};

export { deriveCampaignRuntimeRequest };