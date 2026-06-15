import { sqliteConnection } from "./db-sqlite";

// Create analytics table if not exists
sqliteConnection.exec(`
CREATE TABLE IF NOT EXISTS test_result_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_name TEXT NOT NULL,
  pass INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  error TEXT
);
`);

export function insertTestResult(testName: string, pass: boolean, error?: string) {
  sqliteConnection.prepare(
    `INSERT INTO test_result_analytics (test_name, pass, timestamp, error) VALUES (?, ?, ?, ?)`
  ).run(testName, pass ? 1 : 0, new Date().toISOString(), error || null);
}

export function getAllTestResults() {
  return sqliteConnection.prepare(
    `SELECT test_name, pass, timestamp, error FROM test_result_analytics`
  ).all() as Array<{ test_name: string; pass: number; timestamp: string; error?: string }>;

}

export function getTestResultsGrouped() {
  // Returns: { [testName]: TestResult[] }
  const rows = getAllTestResults();
  const grouped: Record<string, { pass: boolean; timestamp: string; error?: string }[]> = {};
  for (const row of rows) {
    if (!grouped[row.test_name]) grouped[row.test_name] = [];
    grouped[row.test_name].push({
      pass: !!row.pass,
      timestamp: row.timestamp,
      error: row.error,
    });
  }
  return grouped;
}
