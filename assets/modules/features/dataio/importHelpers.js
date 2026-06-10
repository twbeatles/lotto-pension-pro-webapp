function safeClone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function countStoredItems({
    favorites = [],
    history = [],
    ticketTotal = 0,
    campaigns = [],
    pension720Tickets = [],
    pension720Campaigns = [],
    localUpdates = [],
    presets = []
}) {
    return (
        favorites.length +
        history.length +
        ticketTotal +
        campaigns.length +
        pension720Tickets.length +
        pension720Campaigns.length +
        localUpdates.length +
        presets.length
    );
}

export { countStoredItems, safeClone };
