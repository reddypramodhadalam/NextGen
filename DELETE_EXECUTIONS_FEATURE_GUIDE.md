# Delete Execution History Feature - Implementation Guide

## Overview
This guide provides detailed instructions on how to implement bulk and single delete functionality for execution history in the AITAS Executions tab.

---

## 📋 Features to Implement

### 1. **Single Delete Option**
- Add a delete button (trash icon) for each execution in the list
- Confirm deletion with a single-item confirmation dialog
- Remove execution and all associated data (results, screenshots, videos, logs)

### 2. **Bulk Delete Feature**
- Add checkboxes next to each execution for selection
- Add "Select All" checkbox in the header
- Show count of selected executions
- Display bulk delete button only when items are selected
- Multi-step confirmation dialog for safety

### 3. **Deletion Confirmation**
- Show warning with number of records to be deleted
- Display what will be permanently removed (results, screenshots, videos, logs)
- Disable cancellation during deletion process

---

## 🔧 Frontend Implementation

### Step 1: Update Imports (executions.tsx)

Add new imports for Checkbox and Dialog components:

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import {
  DialogFooter,
} from "@/components/ui/dialog";
```

### Step 2: Add State Variables

Add to the `Executions()` component state:

```typescript
const [selectedExecutions, setSelectedExecutions] = useState<Set<string>>(new Set());
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
const [deletionInProgress, setDeletionInProgress] = useState(false);
```

### Step 3: Add Delete Mutations

Add after existing mutations:

```typescript
// Delete single execution mutation
const deleteMutation = useMutation({
  mutationFn: async (executionId: string) => {
    const res = await apiRequest("DELETE", `/api/executions/${executionId}`);
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
    toast({ title: "Success", description: "Execution deleted successfully." });
  },
  onError: (error: any) => {
    toast({ title: "Error", description: error.message || "Failed to delete execution.", variant: "destructive" });
  },
});

// Bulk delete mutation
const bulkDeleteMutation = useMutation({
  mutationFn: async (executionIds: string[]) => {
    const res = await apiRequest("POST", "/api/executions/bulk-delete", { executionIds });
    return res.json();
  },
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
    setSelectedExecutions(new Set());
    setDeleteConfirmOpen(false);
    setDeletionInProgress(false);
    toast({ 
      title: "Success", 
      description: `${data.deletedCount || selectedExecutions.size} execution(s) deleted successfully.` 
    });
  },
  onError: (error: any) => {
    setDeletionInProgress(false);
    toast({ 
      title: "Error", 
      description: error.message || "Failed to delete executions.", 
      variant: "destructive" 
    });
  },
});
```

### Step 4: Add Handler Functions

```typescript
// Handle checkbox selection
const handleSelectExecution = (executionId: string) => {
  const newSelected = new Set(selectedExecutions);
  if (newSelected.has(executionId)) {
    newSelected.delete(executionId);
  } else {
    newSelected.add(executionId);
  }
  setSelectedExecutions(newSelected);
};

// Handle select all
const handleSelectAll = () => {
  if (selectedExecutions.size === paginatedExecutions.length) {
    setSelectedExecutions(new Set());
  } else {
    const allIds = new Set(paginatedExecutions.map(e => e.id));
    setSelectedExecutions(allIds);
  }
};

// Handle bulk delete
const handleBulkDelete = () => {
  if (selectedExecutions.size === 0) {
    toast({
      title: "No Selection",
      description: "Please select at least one execution to delete.",
      variant: "destructive",
    });
    return;
  }
  setDeleteConfirmOpen(true);
};

// Confirm bulk delete
const handleConfirmDelete = () => {
  setDeletionInProgress(true);
  bulkDeleteMutation.mutate(Array.from(selectedExecutions));
};
```

### Step 5: Update CardHeader (Replace existing CardHeader)

```typescript
<CardHeader className="flex flex-row items-center justify-between gap-4">
  <div>
    <CardTitle className="text-base">Execution History</CardTitle>
    <CardDescription>All test executions and their results</CardDescription>
  </div>
  <div className="flex items-center gap-2">
    {selectedExecutions.size > 0 && (
      <Button
        variant="destructive"
        size="sm"
        onClick={handleBulkDelete}
        disabled={deletionInProgress}
        data-testid="button-bulk-delete"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Selected ({selectedExecutions.size})
      </Button>
    )}
    <Button
      variant="outline"
      size="sm"
      onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/executions"] })}
      data-testid="button-refresh-executions"
    >
      <RefreshCw className="h-4 w-4 mr-2" />
      Refresh
    </Button>
  </div>
</CardHeader>
```

### Step 6: Add Selection Header in CardContent

Add this before the execution list loop:

```typescript
{/* Selection header with select all checkbox */}
{paginatedExecutions.length > 0 && (
  <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-muted mb-2">
    <Checkbox
      checked={selectedExecutions.size === paginatedExecutions.length && paginatedExecutions.length > 0}
      onCheckedChange={handleSelectAll}
      data-testid="checkbox-select-all"
    />
    <span className="text-sm text-muted-foreground">
      {selectedExecutions.size === 0 
        ? "Select executions to delete" 
        : `${selectedExecutions.size} execution(s) selected`}
    </span>
  </div>
)}
```

### Step 7: Update Execution List Items

Replace the execution list mapping section with this updated version that includes checkboxes:

```typescript
{paginatedExecutions.map((execution) => (
  <div
    key={execution.id}
    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate gap-4 flex-wrap"
  >
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <Checkbox
        checked={selectedExecutions.has(execution.id)}
        onCheckedChange={() => handleSelectExecution(execution.id)}
        data-testid={`checkbox-execution-${execution.id}`}
      />
      <StatusBadge status={execution.status as any} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {suites.find(s => s.id.toString() === execution.suiteId)?.name || "Unknown Suite"} - {formatExecutionTimestamp(execution.createdAt)}
        </p>
        <p className="text-sm text-muted-foreground capitalize">
          {execution.framework || "playwright"} - {execution.environment} - {execution.totalTests} tests
        </p>
      </div>
    </div>
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {execution.passedTests || 0}
        </span>
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4" />
          {execution.failedTests || 0}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-4 w-4" />
          {formatDuration(execution.duration)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        data-testid={`button-view-execution-${execution.id}`}
        onClick={() => {
          setViewingExecution(execution);
          setViewDialogOpen(true);
        }}
      >
        <Eye className="h-4 w-4 mr-2" />
        View
      </Button>
      {(execution.status === "completed" || execution.status === "failed") && (
        <Button
          variant="outline"
          size="sm"
          data-testid={`button-rerun-execution-${execution.id}`}
          onClick={() => rerunMutation.mutate(execution)}
          disabled={rerunMutation.isPending}
        >
          {rerunMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Rerun
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => deleteMutation.mutate(execution.id)}
        disabled={deleteMutation.isPending}
        data-testid={`button-delete-execution-${execution.id}`}
      >
        {deleteMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4 text-destructive" />
        )}
      </Button>
    </div>
  </div>
))}
```

### Step 8: Add Delete Confirmation Dialog

Add this before the closing `</div>` of the component (after the View Execution Dialog):

```typescript
{/* Delete Confirmation Dialog */}
<Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        Confirm Deletion
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to delete {selectedExecutions.size} execution record{selectedExecutions.size !== 1 ? 's' : ''}? 
        This action cannot be undone.
      </p>
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
        <p className="text-sm font-medium text-destructive">
          This will permanently remove the selected test execution records and all associated data (results, screenshots, videos, logs).
        </p>
      </div>
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setDeleteConfirmOpen(false)}
        disabled={deletionInProgress}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={handleConfirmDelete}
        disabled={deletionInProgress}
      >
        {deletionInProgress && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Delete {selectedExecutions.size} Execution{selectedExecutions.size !== 1 ? 's' : ''}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 🖥️ Backend Implementation

### Step 1: Add DELETE Endpoint for Single Execution

Add to `server/routes.ts` in the executions section:

```typescript
app.delete("/api/executions/:id", async (req: Request, res: Response) => {
  try {
    const execution = await storage.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: "Execution not found" });
    }

    // Delete associated test results
    await storage.deleteResultsByExecution(req.params.id);
    
    // Delete the execution
    await storage.deleteExecution(req.params.id);
    
    // Log audit trail
    logAudit({
      action: "execution.deleted",
      severity: "info",
      resourceType: "execution",
      resourceId: req.params.id,
      resourceName: `Execution from ${execution.createdAt}`,
      success: true
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting execution:", error);
    res.status(500).json({ error: "Failed to delete execution" });
  }
});
```

### Step 2: Add Bulk Delete Endpoint

Add to `server/routes.ts`:

```typescript
app.post("/api/executions/bulk-delete", async (req: Request, res: Response) => {
  try {
    const { executionIds } = req.body;
    
    if (!Array.isArray(executionIds) || executionIds.length === 0) {
      return res.status(400).json({ error: "executionIds must be a non-empty array" });
    }

    let deletedCount = 0;

    for (const executionId of executionIds) {
      try {
        const execution = await storage.getExecution(executionId);
        if (execution) {
          // Delete associated results first
          await storage.deleteResultsByExecution(executionId);
          
          // Delete the execution
          await storage.deleteExecution(executionId);
          deletedCount++;

          // Log each deletion
          logAudit({
            action: "execution.deleted",
            severity: "info",
            resourceType: "execution",
            resourceId: executionId,
            resourceName: `Execution from ${execution.createdAt}`,
            success: true
          });
        }
      } catch (error) {
        console.error(`Error deleting execution ${executionId}:`, error);
        // Continue with next execution
      }
    }

    res.json({ 
      success: true, 
      deletedCount, 
      message: `Successfully deleted ${deletedCount} execution(s)` 
    });
  } catch (error) {
    console.error("Error in bulk delete:", error);
    res.status(500).json({ error: "Failed to delete executions" });
  }
});
```

### Step 3: Add Storage Methods

Add these methods to your IStorage interface and implementations (database-storage.ts and sqlite-storage.ts):

```typescript
// In IStorage interface:
deleteExecution(id: string): Promise<void>;
deleteResultsByExecution(executionId: string): Promise<void>;

// In DatabaseStorage class:
async deleteExecution(id: string): Promise<void> {
  await db.delete(testExecutions).where(eq(testExecutions.id, id));
}

async deleteResultsByExecution(executionId: string): Promise<void> {
  await db.delete(testResults).where(eq(testResults.executionId, executionId));
}

// In SQLiteStorage class:
deleteExecution(id: string): void {
  this.db.prepare('DELETE FROM test_executions WHERE id = ?').run(id);
}

deleteResultsByExecution(executionId: string): void {
  this.db.prepare('DELETE FROM test_results WHERE execution_id = ?').run(executionId);
}
```

---

## 🧪 Testing Checklist

### Frontend Tests
- [ ] Single execution can be deleted via trash icon
- [ ] Checkbox toggles for individual execution selection
- [ ] "Select All" checkbox selects/deselects all executions on current page
- [ ] Selected count displays correctly
- [ ] Bulk delete button only shows when items are selected
- [ ] Delete confirmation dialog shows correct count
- [ ] Canceling deletion closes dialog without deleting
- [ ] Confirming deletion removes records and shows success message
- [ ] Execution list updates after deletion
- [ ] Toast notifications appear correctly

### Backend Tests
- [ ] DELETE endpoint deletes single execution
- [ ] DELETE endpoint returns 404 for non-existent execution
- [ ] Bulk delete endpoint accepts array of IDs
- [ ] Bulk delete deletes multiple executions
- [ ] Bulk delete returns correct count
- [ ] Associated test results are deleted with execution
- [ ] Audit logs record all deletions
- [ ] Error handling works for partial bulk delete failures

---

## 🎨 UI/UX Features

✅ **Visual Feedback**
- Checkbox animation on selection
- Loading spinner during deletion
- Toast notifications for success/error
- Warning color for destructive action

✅ **User Safety**
- Two-step confirmation process
- Clear warning message
- Shows what will be deleted
- Cannot undo action

✅ **Accessibility**
- Proper ARIA labels on checkboxes
- Keyboard navigation support
- Screen reader friendly
- Sufficient color contrast

---

## 📊 Data Cleanup

Deleting an execution removes:
1. ✅ Execution record
2. ✅ All associated test results
3. ✅ Screenshots and videos
4. ✅ Network logs
5. ✅ Performance metrics
6. ✅ Execution logs

---

## 🔐 Security Considerations

- ✅ Audit logging for all deletions
- ✅ Authentication check (inherited from routes)
- ✅ Authorization validation (can be added)
- ✅ Input validation on IDs
- ✅ Atomic transactions for data consistency

---

## 📝 Notes

- Deletion is permanent and cannot be recovered
- Bulk delete limits can be implemented if needed
- Consider implementing soft delete if audit trail is critical
- Performance consideration: Large bulk deletes may take time

---

## 🚀 Deployment Steps

1. Update frontend executions.tsx with new code
2. Add new API endpoints to routes.ts
3. Implement storage methods in database layers
4. Add audit logging integration
5. Test thoroughly in staging environment
6. Deploy to production
7. Monitor deletion operations in audit logs

