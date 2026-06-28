import { useCallback, useState } from 'react';

export interface TestStep {
  stepId: number;
  action: string;
  target: string;
  value: string;
  timeoutMs?: number;
  waitEnabled?: boolean;
  retries?: number;
  expected: string;
  /** Human-readable instruction (canonical `step` text persisted in the DB). */
  description?: string;
  alternatives?: Array<{ target: string; reason: string }>;
}

interface UseStepManagementProps {
  initialSteps?: TestStep[];
  onStepsChange?: (steps: TestStep[]) => void;
}

/**
 * Hook for managing test steps with auto-numbering, insertion, and deletion
 */
export const useStepManagement = ({
  initialSteps = [],
  onStepsChange,
}: UseStepManagementProps = {}) => {
  const [steps, setSteps] = useState<TestStep[]>(initialSteps);

  // Auto-renumber steps
  const renumberSteps = useCallback((stepsToRenumber: TestStep[]): TestStep[] => {
    return stepsToRenumber.map((step, index) => ({
      ...step,
      stepId: index + 1,
    }));
  }, []);

  // Add step at position
  const insertStep = useCallback(
    (
      newStep: Omit<TestStep, 'stepId'>,
      afterStepId: number | null = null
    ) => {
      let updatedSteps: TestStep[];

      if (afterStepId === null) {
        // Append at end
        updatedSteps = [
          ...steps,
          {
            ...newStep,
            stepId: steps.length + 1,
          },
        ];
      } else {
        // Insert after specific step
        const insertIndex = steps.findIndex((s) => s.stepId === afterStepId);
        if (insertIndex === -1) return; // Step not found

        updatedSteps = [
          ...steps.slice(0, insertIndex + 1),
          {
            ...newStep,
            stepId: afterStepId + 1,
          },
          ...steps.slice(insertIndex + 1),
        ];
      }

      const renumbered = renumberSteps(updatedSteps);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [steps, renumberSteps, onStepsChange]
  );

  // Delete step
  const deleteStep = useCallback(
    (stepId: number) => {
      const filtered = steps.filter((s) => s.stepId !== stepId);
      const renumbered = renumberSteps(filtered);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [steps, renumberSteps, onStepsChange]
  );

  // Update step
  const updateStep = useCallback(
    (stepId: number, updatedFields: Partial<TestStep>) => {
      const updated = steps.map((s) =>
        s.stepId === stepId ? { ...s, ...updatedFields } : s
      );
      setSteps(updated);
      onStepsChange?.(updated);
    },
    [steps, onStepsChange]
  );

  // Move step up
  const moveStepUp = useCallback(
    (stepId: number) => {
      const index = steps.findIndex((s) => s.stepId === stepId);
      if (index === 0) return;

      const newSteps = [...steps];
      [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
      const renumbered = renumberSteps(newSteps);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [steps, renumberSteps, onStepsChange]
  );

  // Move step down
  const moveStepDown = useCallback(
    (stepId: number) => {
      const index = steps.findIndex((s) => s.stepId === stepId);
      if (index === steps.length - 1) return;

      const newSteps = [...steps];
      [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
      const renumbered = renumberSteps(newSteps);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [steps, renumberSteps, onStepsChange]
  );

  // Reorder steps (for drag-and-drop)
  const reorderSteps = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newSteps = [...steps];
      const [removed] = newSteps.splice(fromIndex, 1);
      newSteps.splice(toIndex, 0, removed);

      const renumbered = renumberSteps(newSteps);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [steps, renumberSteps, onStepsChange]
  );

  // Get step by ID
  const getStep = useCallback(
    (stepId: number) => steps.find((s) => s.stepId === stepId),
    [steps]
  );

  // Get all steps
  const getAllSteps = useCallback(() => steps, [steps]);

  // Get steps count
  const getStepsCount = useCallback(() => steps.length, [steps]);

  // Validate step
  const validateStep = useCallback((step: Partial<TestStep>): string[] => {
    const errors: string[] = [];

    if (!step.action) {
      errors.push('Action is required');
    }

    if (!step.target) {
      errors.push('Target is required');
    }

    if (step.expected && typeof step.expected !== 'string') {
      errors.push('Expected result must be text');
    }

    if (step.timeoutMs && (step.timeoutMs < 1000 || step.timeoutMs > 300000)) {
      errors.push('Timeout must be between 1000ms and 300000ms');
    }

    if (step.retries && (step.retries < 1 || step.retries > 5)) {
      errors.push('Retries must be between 1 and 5');
    }

    return errors;
  }, []);

  // Export steps for saving
  const exportSteps = useCallback(() => {
    return JSON.stringify(steps, null, 2);
  }, [steps]);

  // Import steps from JSON
  const importSteps = useCallback(
    (jsonString: string) => {
      try {
        const imported = JSON.parse(jsonString) as TestStep[];
        const renumbered = renumberSteps(imported);
        setSteps(renumbered);
        onStepsChange?.(renumbered);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Invalid JSON',
        };
      }
    },
    [renumberSteps, onStepsChange]
  );

  // Duplicate step
  const duplicateStep = useCallback(
    (stepId: number) => {
      const step = getStep(stepId);
      if (!step) return;

      const newSteps = [...steps];
      const index = newSteps.findIndex((s) => s.stepId === stepId);

      // Insert duplicate after the original
      newSteps.splice(index + 1, 0, {
        ...step,
        stepId: index + 2,
      });

      const renumbered = renumberSteps(newSteps);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [steps, getStep, renumberSteps, onStepsChange]
  );

  // Replace all steps
  const replaceAllSteps = useCallback(
    (newSteps: Omit<TestStep, 'stepId'>[]) => {
      const renumbered = renumberSteps(
        newSteps.map((step) => ({ ...step, stepId: 0 }))
      );
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
    [renumberSteps, onStepsChange]
  );

  return {
    steps,
    insertStep,
    deleteStep,
    updateStep,
    moveStepUp,
    moveStepDown,
    reorderSteps,
    getStep,
    getAllSteps,
    getStepsCount,
    validateStep,
    exportSteps,
    importSteps,
    duplicateStep,
    replaceAllSteps,
    setSteps: (newSteps: TestStep[]) => {
      const renumbered = renumberSteps(newSteps);
      setSteps(renumbered);
      onStepsChange?.(renumbered);
    },
  };
};

export default useStepManagement;
