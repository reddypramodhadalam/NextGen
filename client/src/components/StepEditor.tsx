import React, { useState, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  AlertCircle,
} from 'lucide-react';

export interface TestStep {
  stepId: number;
  action: string;
  target: string;
  value: string;
  timeoutMs?: number;
  waitEnabled?: boolean;
  retries?: number;
  expected: string;
  alternatives?: Array<{ target: string; reason: string }>;
}

interface StepEditorProps {
  steps: TestStep[];
  onStepsChange: (steps: TestStep[]) => void;
  onValidationError?: (error: string) => void;
}

const ALLOWED_ACTIONS = [
  'navigate',
  'click',
  'enter',
  'fillInput',
  'select',
  'verify',
  'wait',
  'scroll',
  'hover',
  'screenshot',
  'switchWindow',
  'acceptAlert',
  'fillForm',
  'logout',
];

// Safe capitalize function
const safeCapitalize = (str: string | undefined | null): string => {
  if (!str || typeof str !== 'string') return 'Unknown';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const DEFAULT_TIMEOUTS: Record<string, number> = {
  navigate: 30000,
  click: 5000,
  enter: 5000,
  fillInput: 5000,
  select: 5000,
  verify: 10000,
  wait: 10000,
  scroll: 5000,
  hover: 3000,
  screenshot: 2000,
  switchWindow: 5000,
  acceptAlert: 3000,
  fillForm: 10000,
  logout: 5000,
};

export const StepEditor: React.FC<StepEditorProps> = ({
  steps,
  onStepsChange,
  onValidationError,
}) => {
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [insertAfterStepId, setInsertAfterStepId] = useState<number | null>(null);
  const [showInsertDialog, setShowInsertDialog] = useState(false);
  const [newStep, setNewStep] = useState<Partial<TestStep>>({
    action: 'click',
    target: '',
    value: '',
    expected: '',
    timeoutMs: 5000,
    waitEnabled: false,
    retries: 1,
  });

  // Auto-renumber steps
  const renumberSteps = useCallback((stepsToRenumber: TestStep[]): TestStep[] => {
    return stepsToRenumber.map((step, index) => ({
      ...step,
      stepId: index + 1,
    }));
  }, []);

  // Add step at position
  const handleInsertStep = useCallback(() => {
    if (!newStep.action || !newStep.target) {
      onValidationError?.(
        'Please fill in Action and Target fields before adding a step'
      );
      return;
    }

    let newSteps: TestStep[];

    if (insertAfterStepId === null || insertAfterStepId === -1) {
      // Insert at beginning
      newSteps = [
        {
          stepId: 1,
          action: newStep.action,
          target: newStep.target,
          value: newStep.value || '',
          expected: newStep.expected || '',
          timeoutMs: newStep.timeoutMs || DEFAULT_TIMEOUTS[newStep.action] || 5000,
          waitEnabled: newStep.waitEnabled || false,
          retries: newStep.retries || 1,
          alternatives: newStep.alternatives || [],
        },
        ...steps,
      ];
    } else if (insertAfterStepId >= steps.length) {
      // Insert at end
      newSteps = [
        ...steps,
        {
          stepId: steps.length + 1,
          action: newStep.action,
          target: newStep.target,
          value: newStep.value || '',
          expected: newStep.expected || '',
          timeoutMs: newStep.timeoutMs || DEFAULT_TIMEOUTS[newStep.action] || 5000,
          waitEnabled: newStep.waitEnabled || false,
          retries: newStep.retries || 1,
          alternatives: newStep.alternatives || [],
        },
      ];
    } else {
      // Insert after specific step
      const insertIndex = insertAfterStepId;
      newSteps = [
        ...steps.slice(0, insertIndex + 1),
        {
          stepId: insertAfterStepId + 1,
          action: newStep.action,
          target: newStep.target,
          value: newStep.value || '',
          expected: newStep.expected || '',
          timeoutMs: newStep.timeoutMs || DEFAULT_TIMEOUTS[newStep.action] || 5000,
          waitEnabled: newStep.waitEnabled || false,
          retries: newStep.retries || 1,
          alternatives: newStep.alternatives || [],
        },
        ...steps.slice(insertIndex + 1),
      ];
    }

    onStepsChange(renumberSteps(newSteps));
    setShowInsertDialog(false);
    setInsertAfterStepId(null);
    setNewStep({
      action: 'click',
      target: '',
      value: '',
      expected: '',
      timeoutMs: 5000,
      waitEnabled: false,
      retries: 1,
    });
  }, [steps, newStep, insertAfterStepId, onStepsChange, renumberSteps, onValidationError]);

  // Delete step
  const handleDeleteStep = useCallback(
    (stepId: number) => {
      const newSteps = steps.filter((s) => s.stepId !== stepId);
      onStepsChange(renumberSteps(newSteps));
    },
    [steps, onStepsChange, renumberSteps]
  );

  // Move step up
  const handleMoveUp = useCallback(
    (stepId: number) => {
      const index = steps.findIndex((s) => s.stepId === stepId);
      if (index === 0) return;

      const newSteps = [...steps];
      [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
      onStepsChange(renumberSteps(newSteps));
    },
    [steps, onStepsChange, renumberSteps]
  );

  // Move step down
  const handleMoveDown = useCallback(
    (stepId: number) => {
      const index = steps.findIndex((s) => s.stepId === stepId);
      if (index === steps.length - 1) return;

      const newSteps = [...steps];
      [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
      onStepsChange(renumberSteps(newSteps));
    },
    [steps, onStepsChange, renumberSteps]
  );

  // Update step - Keep editing mode active while making updates
  const handleUpdateStep = useCallback(
    (stepId: number, updatedStep: Partial<TestStep>) => {
      const newSteps = steps.map((s) =>
        s.stepId === stepId ? { ...s, ...updatedStep } : s
      );
      onStepsChange(newSteps);
      // DO NOT close editing mode here - let user finish editing
      // They should click "Done Editing" button to exit
    },
    [steps, onStepsChange]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Test Steps ({steps.length})</CardTitle>
              <CardDescription>
                Edit, reorder, and manage test execution steps
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setInsertAfterStepId(-1); // Insert at beginning
                setShowInsertDialog(true);
              }}
              className="gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Add Step at Start
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {steps.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-8 text-center">
              <div className="space-y-2">
                <AlertCircle className="mx-auto h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-600">
                  No steps added yet. Click "Add Step" to begin.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <StepCard
                  key={step.stepId}
                  step={step}
                  isEditing={editingStepId === step.stepId}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                  onEdit={() => setEditingStepId(step.stepId)}
                  onUpdate={(updated) => handleUpdateStep(step.stepId, updated)}
                  onDelete={() => handleDeleteStep(step.stepId)}
                  onMoveUp={() => handleMoveUp(step.stepId)}
                  onMoveDown={() => handleMoveDown(step.stepId)}
                  onInsertAfter={() => {
                    setInsertAfterStepId(index);
                    setShowInsertDialog(true);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insert Step Dialog - Properly Designed */}
      <Dialog open={showInsertDialog} onOpenChange={setShowInsertDialog}>
        <DialogContent className="max-w-2xl max-h-[95vh] p-0 flex flex-col">
          {/* Header - Fixed */}
          <div className="px-6 py-5 border-b-2 border-blue-300 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 shadow-lg">
            <DialogTitle className="text-2xl font-bold text-white">
              ➕ Add Test Step
            </DialogTitle>
            <p className="mt-2 text-base font-semibold text-blue-100 flex items-center gap-2">
              {insertAfterStepId === -1
                ? '📍 Insert at the beginning'
                : insertAfterStepId === null || insertAfterStepId >= steps.length
                ? '📍 Add at the end'
                : `📍 Insert after step ${insertAfterStepId + 1}`}
            </p>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 bg-gray-50">
            {/* Basic Fields Section */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span className="text-xl">📋</span> Basic Information
              </h3>
              
              {/* Action Selection */}
              <div className="space-y-2 bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                <label className="text-sm font-bold text-blue-900">
                  🎬 Action <span className="text-red-600">*</span>
                </label>
                <Select
                  value={newStep.action || ''}
                  onValueChange={(value) =>
                    setNewStep({
                      ...newStep,
                      action: value,
                      timeoutMs:
                        DEFAULT_TIMEOUTS[value] || newStep.timeoutMs || 5000,
                    })
                  }
                >
                  <SelectTrigger className="w-full text-base font-bold text-blue-900 border-2 border-blue-400 bg-white hover:border-blue-500 focus:border-blue-600">
                    <SelectValue placeholder="🎬 Select action..." className="text-blue-600" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {ALLOWED_ACTIONS.map((action) => (
                      <SelectItem key={action} value={action} className="text-base font-semibold text-gray-900">
                        {safeCapitalize(action)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-blue-700 font-medium">The action to perform in this step</p>
              </div>

              {/* Target Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  🎯 Target (Selector/URL) <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g., button[data-qa='submit'], #email-field, https://example.com"
                  value={newStep.target || ''}
                  onChange={(e) => setNewStep({ ...newStep, target: e.target.value })}
                  className="font-mono text-base border-2 border-gray-300 font-bold text-gray-900 placeholder:text-gray-400 bg-white"
                />
                <p className="text-xs text-gray-500">CSS selector, XPath, URL, or element identifier</p>
              </div>

              {/* Value Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">📝 Value (optional)</label>
                <Input
                  placeholder="e.g., user@example.com, text to enter"
                  value={newStep.value || ''}
                  onChange={(e) => setNewStep({ ...newStep, value: e.target.value })}
                  className="text-base border-2 border-gray-300 font-bold text-gray-900 placeholder:text-gray-400 bg-white"
                />
                <p className="text-xs text-gray-500">Input value for 'enter' or 'select' actions</p>
              </div>

              {/* Expected Result */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">✅ Expected Result</label>
                <Input
                  placeholder="e.g., Form submitted successfully"
                  value={newStep.expected || ''}
                  onChange={(e) =>
                    setNewStep({ ...newStep, expected: e.target.value })
                  }
                  className="text-base border-2 border-gray-300 font-bold text-gray-900 placeholder:text-gray-400 bg-white"
                />
                <p className="text-xs text-gray-500">Observable result or outcome after the action</p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200" />

            {/* Advanced Section */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span className="text-xl">⚙️</span> Advanced Options
              </h3>

              {/* Wait Configuration Toggle */}
              <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 border-2 border-amber-400 rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-3 pb-4 border-b-2 border-amber-300">
                  <Checkbox
                    id="waitEnabled"
                    checked={newStep.waitEnabled || false}
                    onCheckedChange={(checked) =>
                      setNewStep({
                        ...newStep,
                        waitEnabled: checked as boolean,
                      })
                    }
                    className="w-5 h-5"
                  />
                  <label
                    htmlFor="waitEnabled"
                    className="text-sm font-bold cursor-pointer flex items-center gap-2 flex-1 text-amber-900"
                  >
                    <Clock className="h-5 w-5 text-amber-600" />
                    <span>⏱️ Enable Wait Configuration</span>
                  </label>
                </div>

                {/* Wait Configuration Fields */}
                {newStep.waitEnabled && (
                  <div className="mt-4 space-y-4">
                    {/* Timeout */}
                    <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200">
                      <label className="text-sm font-bold text-amber-900">
                        ⏰ Timeout (milliseconds)
                      </label>
                      <Input
                        type="number"
                        min="1000"
                        step="1000"
                        placeholder="5000"
                        value={newStep.timeoutMs || 5000}
                        onChange={(e) =>
                          setNewStep({
                            ...newStep,
                            timeoutMs: parseInt(e.target.value) || 5000,
                          })
                        }
                        className="text-base bg-white border-2 border-amber-400 font-bold text-amber-900 placeholder:text-amber-400"
                      />
                      <div className="text-xs text-amber-700 font-medium flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Default for {safeCapitalize(newStep.action)}: <span className="bg-amber-200 px-2 py-0.5 rounded font-bold">{DEFAULT_TIMEOUTS[newStep.action || 'click'] || 5000}ms</span>
                      </div>
                    </div>

                    {/* Retries */}
                    <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200">
                      <label className="text-sm font-bold text-amber-900">🔄 Retry Attempts</label>
                      <Input
                        type="number"
                        min="1"
                        max="5"
                        placeholder="1"
                        value={newStep.retries || 1}
                        onChange={(e) =>
                          setNewStep({
                            ...newStep,
                            retries: parseInt(e.target.value) || 1,
                          })
                        }
                        className="text-base bg-white border-2 border-amber-400 font-bold text-amber-900 placeholder:text-amber-400"
                      />
                      <p className="text-xs text-amber-700 font-medium">How many times to retry if the step fails (1-5)</p>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-amber-900">⚡ Quick Presets:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: '⚡ Fast (2s)', ms: 2000 },
                          { label: '⚙️ Normal (5s)', ms: 5000 },
                          { label: '🐢 Slow (10s)', ms: 10000 },
                          { label: '🌙 Very Slow (30s)', ms: 30000 },
                        ].map((preset) => (
                          <Button
                            key={preset.ms}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setNewStep({
                                ...newStep,
                                timeoutMs: preset.ms,
                                waitEnabled: true,
                              })
                            }
                            className="text-xs font-semibold bg-white hover:bg-amber-100 border-amber-300 text-amber-900 hover:border-amber-500 w-full"
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer - Sticky Fixed */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowInsertDialog(false);
                setNewStep({
                  action: 'click',
                  target: '',
                  value: '',
                  expected: '',
                  timeoutMs: 5000,
                  waitEnabled: false,
                  retries: 1,
                });
              }}
              className="min-w-24"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleInsertStep}
              className="min-w-32 bg-blue-600 hover:bg-blue-700"
            >
              ✓ Add Step
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Step Card Component
interface StepCardProps {
  step: TestStep;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onUpdate: (step: Partial<TestStep>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertAfter: () => void;
}

const StepCard: React.FC<StepCardProps> = ({
  step,
  isEditing,
  isFirst,
  isLast,
  onEdit,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertAfter,
}) => {
  if (isEditing) {
    return (
      <Card className="border-2 border-blue-500 bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <CardContent className="pt-6 space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-blue-400">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-600 shadow-md">
                {step.stepId}
              </div>
              <div>
                <p className="text-xs text-blue-100">Current Action</p>
                <p className="text-lg font-bold text-white">
                  {(step.action || 'Unknown').toUpperCase()}
                </p>
              </div>
            </div>
            <Button 
              onClick={() => onEdit()}
              className="bg-green-500 hover:bg-green-600 text-white px-6 font-semibold"
            >
              ✓ Done Editing
            </Button>
          </div>

          {/* Edit Fields */}
          <div className="space-y-4" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {/* Target */}
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-sm font-bold text-white">🎯 Target Selector/URL</label>
              <Input
                autoFocus
                placeholder="CSS selector, XPath, or URL"
                value={step.target}
                onChange={(e) => {
                  e.stopPropagation();
                  onUpdate({ target: e.target.value });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => {
                  e.stopPropagation();
                }}
                onKeyPress={(e) => {
                  e.stopPropagation();
                }}
                className="font-mono text-base bg-white border-2 border-blue-400 focus:border-blue-600 font-bold text-blue-900 placeholder:text-blue-300"
                autoComplete="off"
              />
            </div>

            {/* Value */}
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-sm font-bold text-white">📝 Value (if applicable)</label>
              <Input
                placeholder="Text, email, or input value"
                value={step.value}
                onChange={(e) => {
                  e.stopPropagation();
                  onUpdate({ value: e.target.value });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => {
                  e.stopPropagation();
                }}
                onKeyPress={(e) => {
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  e.stopPropagation();
                }}
                onFocus={(e) => {
                  e.stopPropagation();
                }}
                className="text-base bg-white border-2 border-blue-400 focus:border-blue-600 font-bold text-blue-900 placeholder:text-blue-300"
                autoComplete="off"
              />
            </div>

            {/* Expected Result */}
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-sm font-bold text-white">✅ Expected Result</label>
              <Input
                placeholder="What should happen after this step?"
                value={step.expected}
                onChange={(e) => {
                  e.stopPropagation();
                  onUpdate({ expected: e.target.value });
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => {
                  e.stopPropagation();
                }}
                onKeyPress={(e) => {
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  e.stopPropagation();
                }}
                onFocus={(e) => {
                  e.stopPropagation();
                }}
                className="text-base bg-white border-2 border-blue-400 focus:border-blue-600 font-bold text-blue-900 placeholder:text-blue-300"
                autoComplete="off"
              />
            </div>

            {/* Wait Configuration */}
            {step.waitEnabled && (
              <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-5 rounded-xl border-2 border-amber-400 shadow-md space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b-2 border-amber-300">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <p className="text-base font-bold text-amber-900">
                    ⏱️ Wait Configuration
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
                  {/* Timeout */}
                  <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200" onClick={(e) => e.stopPropagation()}>
                    <label className="text-sm font-bold text-amber-900">⏰ Timeout (ms)</label>
                    <Input
                      type="number"
                      value={step.timeoutMs || 5000}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdate({ timeoutMs: parseInt(e.target.value) || 5000 });
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                      }}
                      onKeyUp={(e) => {
                        e.stopPropagation();
                      }}
                      onKeyPress={(e) => {
                        e.stopPropagation();
                      }}
                      className="text-base bg-white border-2 border-amber-400 font-bold text-amber-900 placeholder:text-amber-400"
                      min="1000"
                      step="1000"
                      autoComplete="off"
                    />
                    <p className="text-xs text-amber-700 font-medium">Max wait time in milliseconds</p>
                  </div>

                  {/* Retries */}
                  <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200" onClick={(e) => e.stopPropagation()}>
                    <label className="text-sm font-bold text-amber-900">🔄 Retry Attempts</label>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={step.retries || 1}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdate({ retries: parseInt(e.target.value) || 1 });
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                      }}
                      onKeyUp={(e) => {
                        e.stopPropagation();
                      }}
                      onKeyPress={(e) => {
                        e.stopPropagation();
                      }}
                      className="text-base bg-white border-2 border-amber-400 font-bold text-amber-900 placeholder:text-amber-400"
                      autoComplete="off"
                    />
                    <p className="text-xs text-amber-700 font-medium">Number of retry attempts (1-5)</p>
                  </div>
                </div>

                <div className="bg-white border-l-4 border-amber-500 p-3 rounded-lg">
                  <p className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                    <span className="text-lg">ℹ️</span>
                    Configuration Summary
                  </p>
                  <p className="text-sm text-amber-800 font-medium mt-1">
                    This step will wait up to <span className="bg-amber-200 px-2 py-1 rounded font-bold">{step.timeoutMs || 5000}ms</span> and retry <span className="bg-amber-200 px-2 py-1 rounded font-bold">{step.retries || 1}x</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-all hover:border-blue-300 group">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          {/* Step Number and Details */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {/* Step Badge */}
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-bold text-white flex-shrink-0 shadow-md">
              {step.stepId}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              {/* Title Row */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="text-base font-bold text-gray-900">
                  {safeCapitalize(step.action)}
                </span>
                
                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {step.waitEnabled && (
                    <div className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm">
                      <Clock className="h-3 w-3" />
                      {step.timeoutMs}ms
                    </div>
                  )}
                  {step.retries && step.retries > 1 && (
                    <div className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm">
                      🔄 {step.retries}x
                    </div>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm bg-gray-50 p-3 rounded-lg">
                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700 min-w-fit">Target:</span>
                  <code className="text-gray-800 font-mono break-all flex-1 bg-white px-2 py-1 rounded border border-gray-200">
                    {step.target || '—'}
                  </code>
                </div>

                {step.value && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-gray-700 min-w-fit">Value:</span>
                    <span className="text-gray-800 flex-1 bg-white px-2 py-1 rounded border border-gray-200">
                      {step.value}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <span className="font-semibold text-gray-700 min-w-fit">Expected:</span>
                  <span className="text-gray-800 flex-1 bg-white px-2 py-1 rounded border border-gray-200">
                    {step.expected || '—'}
                  </span>
                </div>

                {step.alternatives && step.alternatives.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-300">
                    <p className="font-semibold text-gray-700 mb-1">Fallback Selectors:</p>
                    <ul className="space-y-1 ml-2">
                      {step.alternatives.map((alt, idx) => (
                        <li key={idx} className="text-xs text-gray-600">
                          • <span className="font-medium">{alt.reason}:</span> 
                          <code className="text-gray-700 font-mono ml-1">{alt.target}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons - Improved Layout */}
          <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onMoveUp}
                disabled={isFirst}
                title="Move up"
                className="hover:bg-blue-100 disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4 text-blue-600" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onMoveDown}
                disabled={isLast}
                title="Move down"
                className="hover:bg-blue-100 disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4 text-blue-600" />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                title="Edit step"
                className="hover:bg-blue-100 text-blue-600 font-medium px-2"
              >
                Edit
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onInsertAfter}
                title="Insert after this step"
                className="hover:bg-green-100"
              >
                <Plus className="h-4 w-4 text-green-600" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                title="Delete step"
                className="hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StepEditor;
