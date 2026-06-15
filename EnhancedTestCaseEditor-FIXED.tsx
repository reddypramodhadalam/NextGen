import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import StepEditor, { TestStep } from './StepEditor';
import { useStepManagement } from '@/hooks/useStepManagement';
import {
  Save,
  Copy,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  ZoomIn,
} from 'lucide-react';

interface TestCase {
  id?: string;
  title: string;
  description: string;
  preconditions: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  testType: string;
  steps: TestStep[];
  expectedResult?: string;
  tags?: string[];
  testData?: Record<string, string>;
}

interface EnhancedTestCaseEditorProps {
  testCase?: TestCase;
  onSave: (testCase: TestCase) => Promise<void>;
  isLoading?: boolean;
}

const TEST_TYPES = [
  'functional',
  'regression',
  'smoke',
  'negative',
  'boundary',
  'security',
  'accessibility',
  'performance',
  'api',
  'integration',
];

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export const EnhancedTestCaseEditor: React.FC<EnhancedTestCaseEditorProps> = ({
  testCase,
  onSave,
  isLoading = false,
}) => {
  const [title, setTitle] = useState(testCase?.title || '');
  const [description, setDescription] = useState(testCase?.description || '');
  const [preconditions, setPreconditions] = useState(testCase?.preconditions || '');
  const [priority, setPriority] = useState<'critical' | 'high' | 'medium' | 'low'>(
    (testCase?.priority as any) ?? 'high'
  );
  const [testType, setTestType] = useState(testCase?.testType ?? 'functional');
  const [expectedResult, setExpectedResult] = useState(testCase?.expectedResult || '');
  const [tags, setTags] = useState(testCase?.tags?.join(', ') || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');

  const {
    steps,
    getAllSteps,
    validateStep,
    exportSteps,
    importSteps,
    setSteps: setAllSteps,
  } = useStepManagement({
    initialSteps: testCase?.steps || [],
  });

  // Validate form
  const validateForm = (): boolean => {
    if (!title.trim()) {
      setValidationError('Test case title is required');
      return false;
    }
    if (!description.trim()) {
      setValidationError('Description is required');
      return false;
    }
    if (steps.length === 0) {
      setValidationError('At least one step is required');
      return false;
    }
    const allErrors = steps.flatMap((step) => validateStep(step));
    if (allErrors.length > 0) {
      setValidationError(`Step validation failed: ${allErrors.join(', ')}`);
      return false;
    }
    setValidationError(null);
    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) return;
    try {
      await onSave({
        id: testCase?.id,
        title,
        description,
        preconditions,
        priority,
        testType,
        steps: getAllSteps(),
        expectedResult,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setSuccessMessage('Test case saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : 'Failed to save test case'
      );
    }
  };

  // Handle import
  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (
        Array.isArray(parsed) ||
        (parsed.steps && Array.isArray(parsed.steps))
      ) {
        const stepsToImport = Array.isArray(parsed) ? parsed : parsed.steps;
        setAllSteps(stepsToImport);
        setShowImportDialog(false);
        setImportJson('');
        setSuccessMessage('Steps imported successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setValidationError('Invalid JSON format. Expected steps array.');
      }
    } catch (error) {
      setValidationError(
        `Import failed: ${error instanceof Error ? error.message : 'Invalid JSON'}`
      );
    }
  };

  // Handle export
  const handleExport = () => {
    const exportData = {
      title,
      description,
      preconditions,
      priority,
      testType,
      steps: getAllSteps(),
      expectedResult,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'test-case'}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Handle duplicate
  const handleDuplicate = async () => {
    const duplicated: TestCase = {
      title: `${title} (Copy)`,
      description,
      preconditions,
      priority,
      testType,
      steps: getAllSteps(),
      expectedResult,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      await onSave(duplicated);
      setSuccessMessage('Test case duplicated successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : 'Failed to duplicate test case'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {testCase ? 'Edit Test Case' : 'Create Test Case'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Define test scenarios with automatic step numbering and wait options
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            className="gap-2"
          >
            <ZoomIn className="h-4 w-4" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          {testCase && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDuplicate}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Messages */}
      {validationError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-900">Validation Error</h3>
            <p className="text-sm text-red-700 mt-1">{validationError}</p>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-green-900">Success</h3>
            <p className="text-sm text-green-700 mt-1">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="steps">
            Steps ({steps.length})
          </TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Test Case Details</CardTitle>
              <CardDescription>
                Basic information about the test case
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g., User Login with Valid Credentials"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-gray-500">
                  {title.length}/100 characters
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Description <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Describe what this test case validates..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Preconditions */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Preconditions</label>
                <Textarea
                  placeholder="e.g., User must be registered, database must be initialized..."
                  value={preconditions}
                  onChange={(e) => setPreconditions(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Priority */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select value={priority || 'high'} onValueChange={(v: any) => setPriority(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p || 'medium'}>
                          {typeof p === 'string' ? p.charAt(0).toUpperCase() + p.slice(1) : 'Medium'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Test Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Test Type</label>
                  <Select value={testType || 'functional'} onValueChange={setTestType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEST_TYPES.map((type) => (
                        <SelectItem key={type} value={type || 'functional'}>
                          {typeof type === 'string' ? type.charAt(0).toUpperCase() + type.slice(1) : 'Functional'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Expected Result */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Expected Result</label>
                <Textarea
                  placeholder="Describe the expected outcome after all steps..."
                  value={expectedResult || ''}
                  onChange={(e) => setExpectedResult(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tags</label>
                <Input
                  placeholder="Comma-separated tags (e.g., smoke, regression, login)"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                {tags && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Steps Tab */}
        <TabsContent value="steps">
          <StepEditor
            steps={steps}
            onStepsChange={setAllSteps}
            onValidationError={setValidationError}
          />
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Options</CardTitle>
              <CardDescription>
                JSON import/export and bulk operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <h3 className="font-medium text-sm">Export as JSON</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Download this test case as JSON for version control or sharing
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="w-full"
                >
                  Download JSON
                </Button>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg space-y-2 border border-blue-200">
                <h3 className="font-medium text-sm">Import from JSON</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Paste JSON to import test case or steps
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportDialog(true)}
                  className="w-full"
                >
                  Import JSON
                </Button>
              </div>
              <div className="bg-amber-50 p-4 rounded-lg space-y-2 border border-amber-200">
                <h3 className="font-medium text-sm">Test Data</h3>
                <p className="text-xs text-gray-600 mb-3">
                  Define test data variables for parameterized steps
                </p>
                <Input
                  placeholder="e.g., email=user@example.com"
                  disabled
                />
                <p className="text-xs text-gray-500">
                  Test data management coming soon
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from JSON</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Paste JSON containing test case data or steps array
            </p>
            <Textarea
              placeholder='{"steps": [...]} or paste full test case JSON'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-500">
              Supported formats: Full test case object or steps array
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowImportDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleImport}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Case Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-medium text-gray-900">Title</h3>
              <p className="text-gray-600 mt-1">{title || 'N/A'}</p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Description</h3>
              <p className="text-gray-600 mt-1 whitespace-pre-wrap">
                {description || 'N/A'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-gray-900">Priority</h3>
                <Badge className="mt-1">{priority || 'high'}</Badge>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Type</h3>
                <Badge variant="outline" className="mt-1">{testType || 'functional'}</Badge>
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Steps ({steps.length})</h3>
              <div className="mt-2 space-y-2">
                {steps.map((step) => (
                  <div key={step.stepId} className="bg-gray-50 p-2 rounded text-xs">
                    <div className="font-medium">
                      Step {step.stepId}: {typeof step.action === 'string' ? step.action.toUpperCase() : 'ACTION'}
                    </div>
                    <div className="text-gray-600 mt-1">
                      Target: <code className="font-mono">{step.target}</code>
                    </div>
                    <div className="text-gray-600">
                      Expected: {step.expected}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedTestCaseEditor;
