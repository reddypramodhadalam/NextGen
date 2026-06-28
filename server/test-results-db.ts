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

/** Delete all analytics rows for a single test name. Returns rows removed. */
export function deleteTestResultsByName(testName: string): number {
  const info = sqliteConnection
    .prepare(`DELETE FROM test_result_analytics WHERE test_name = ?`)
    .run(testName);
  return info.changes ?? 0;
}

/**
 * Bulk-delete analytics rows for the given test names.
 * Runs inside a transaction so it's atomic. Returns total rows removed.
 */
export function deleteTestResultsByNames(testNames: string[]): number {
  if (!testNames || testNames.length === 0) return 0;
  const stmt = sqliteConnection.prepare(
    `DELETE FROM test_result_analytics WHERE test_name = ?`
  );
  const tx = sqliteConnection.transaction((names: string[]) => {
    let removed = 0;
    for (const name of names) {
      removed += stmt.run(name).changes ?? 0;
    }
    return removed;
  });
  return tx(testNames) as number;
}

/** Delete every analytics row. Returns rows removed. */
export function deleteAllTestResults(): number {
  const info = sqliteConnection.prepare(`DELETE FROM test_result_analytics`).run();
  return info.changes ?? 0;
}
