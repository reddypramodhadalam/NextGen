import React, { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import StepEditor, { TestStep } from './StepEditor';
import { useStepManagement } from '@/hooks/useStepManagement';
import {
  Save,
  AlertCircle,
  CheckCircle2,
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



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {testCase ? 'Edit Test Case' : 'Create Test Case'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Define test scenarios with automatic step numbering
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="steps">
            Steps ({steps.length})
          </TabsTrigger>
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
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
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
                      <SelectItem value="functional">Functional</SelectItem>
                      <SelectItem value="regression">Regression</SelectItem>
                      <SelectItem value="smoke">Smoke</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="boundary">Boundary</SelectItem>
                      <SelectItem value="security">Security</SelectItem>
                      <SelectItem value="accessibility">Accessibility</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="api">Api</SelectItem>
                      <SelectItem value="integration">Integration</SelectItem>
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

      </Tabs>
    </div>
  );
};

export default EnhancedTestCaseEditor;
