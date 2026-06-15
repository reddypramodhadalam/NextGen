import { Request, Response } from 'express';
import { insertTestResult, getTestResultsGrouped } from './test-results-db';

// Call this after each test execution to record results
export function storeTestResult(testName: string, passed: boolean, error?: string) {
  insertTestResult(testName, passed, error);
}

// Predictive Failure Analysis
export function getPredictiveFailureAnalysis(_: Request, res: Response) {
  const testHistory = getTestResultsGrouped();
  const analysis = Object.entries(testHistory).map(([testName, results]) => {
    const total = results.length;
    const fails = results.filter(r => !r.pass).length;
    const lastFail = results.slice().reverse().find(r => !r.pass)?.timestamp;
    return {
      testName,
      failureRate: total ? fails / total : 0,
      lastFail,
      prediction: fails / total > 0.5 ? 'Likely to fail' : 'Likely to pass',
    };
  });
  res.json(analysis);
}

// Test Optimization Recommendations
export function getTestOptimizationRecommendations(_: Request, res: Response) {
  const testHistory = getTestResultsGrouped();
  const recommendations = Object.entries(testHistory).map(([testName, results]) => {
    const total = results.length;
    const fails = results.filter(r => !r.pass).length;
    const passes = results.filter(r => r.pass).length;
    let recommendation = 'Stable';
    if (fails / total > 0.5) recommendation = 'Prioritize fixing';
    else if (fails && passes) recommendation = 'Flaky, consider refactoring';
    else if (passes === total) recommendation = 'Low risk, consider skipping occasionally';

    // Find the most common error message
    let commonError = "";
    if (fails > 0) {
      const errorCounts: Record<string, number> = {};
      results.filter(r => !r.pass && r.error).forEach(r => {
        const err = r.error || "";
        errorCounts[err] = (errorCounts[err] || 0) + 1;
      });
      // Get the most frequent error
      commonError = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    }

    return { testName, recommendation, commonError };
  });
  res.json(recommendations);
}

// Pass/Fail stats for graphs
export function getPassFailStats(_: Request, res: Response) {
  const testHistory = getTestResultsGrouped();
  const stats = Object.entries(testHistory).map(([testName, results]) => {
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    return { testName, passed, failed };
  });
  res.json(stats);
}