import { strategyEvaluationScoreMethods } from './evaluation/scoreSetCandidate.js';
import { strategyEvaluationExplainMethods } from './evaluation/explainSet.js';
import { strategyEvaluationTicketMethods } from './evaluation/ticketEval.js';

export const strategyEvaluationMethods = {
    ...strategyEvaluationScoreMethods,
    ...strategyEvaluationExplainMethods,
    ...strategyEvaluationTicketMethods
};