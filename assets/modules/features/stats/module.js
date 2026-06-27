import { statsChartMethods } from './charts.js';
import { statsDistributionMethods } from './distribution.js';
import { statsHotColdMethods } from './hotCold.js';
import { statsPairsMethods } from './pairs.js';

export class StatsModule {
    constructor(app) {
        this.app = app;
        this.data = app.data;
        this.lastAnalyticsId = '';
        this.hasRendered = false;
    }

    render(force = false) {
        if (!this.data.state.winningStats.length) return;
        const analytics = this.data.getAnalytics();
        if (!analytics) return;
        if (!force && this.hasRendered && analytics.id === this.lastAnalyticsId) return;
        this.lastAnalyticsId = analytics.id;
        this.hasRendered = true;

        // Optimize rendering to prevent UI blocking
        requestAnimationFrame(() => {
            this.renderCharts(analytics);
            this.renderNumberDist(analytics);
            this.renderHotCold(analytics);
            this.renderPairs(analytics);
        });
    }
}

Object.assign(
    StatsModule.prototype,
    statsChartMethods,
    statsDistributionMethods,
    statsHotColdMethods,
    statsPairsMethods
);