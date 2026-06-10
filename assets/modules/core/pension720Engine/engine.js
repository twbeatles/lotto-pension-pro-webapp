import { buildPension720Analysis } from './analysis.js';
import { pension720CandidateMethods } from './candidates.js';
import { normalizeDraw } from './normalization.js';
import { createPension720Rng } from './random.js';
import { pension720SelectionMethods } from './selection.js';

export class Pension720Engine {
    constructor(stats = []) {
        this.data = (Array.isArray(stats) ? stats : [])
            .map((row) => normalizeDraw(row))
            .filter(Boolean)
            .sort((a, b) => a.draw_no - b.draw_no);
        this.analysis = this.buildAnalysis(this.data);
    }

    buildAnalysis(sourceData = this.data) {
        return buildPension720Analysis(sourceData);
    }

    getAnalysisForRequest(request) {
        const lookback = request?.params?.lookbackWindow || this.data.length;
        const sourceData = this.data.slice(-Math.max(1, lookback));
        return this.buildAnalysis(sourceData);
    }

    createRng(seed) {
        return createPension720Rng(seed);
    }
}

Object.assign(Pension720Engine.prototype, pension720SelectionMethods, pension720CandidateMethods);
