// Script to delete all failed executions except the latest one, and keep all passed executions
// Usage: Run with `ts-node` or add as a backend utility

import { sqliteStorage } from './sqlite-storage';

interface Execution {
  id: string;
  status: string;
  createdAt: Date;
}

(async () => {
  const executions: Execution[] = await sqliteStorage.getAllExecutions();
  const failed = executions.filter((e) => e.status === 'failed');
  const passed = executions.filter((e) => e.status === 'passed');

  // Sort failed by createdAt descending (latest first)
  const failedSorted = failed.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const toDelete = failedSorted.slice(1); // Keep the latest failed one

  for (const exec of toDelete) {
    console.log(`Deleting failed execution: ${exec.id} (${exec.createdAt})`);
    await sqliteStorage.deleteExecution(exec.id);
  }

  console.log(`Kept ${passed.length} passed executions and 1 latest failed execution.`);
})();
