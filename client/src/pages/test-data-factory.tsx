import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  FlaskConical, Loader2, Plus, Copy, Download, RefreshCw,
  Database, Sparkles, Eye, ChevronRight, Trash2, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataTypeOption { value: string; label: string; description: string; }
interface GeneratedDataSet {
  id: string; name: string; recordCount: number; generatedAt: string;
  schema: { type: string; count: number; locale?: string; maskFields?: string[] };
  records: Record<string, any>[];
}

// ─── Record Viewer ────────────────────────────────────────────────────────────

function RecordViewer({ record }: { record: Record<string, any> }) {
  const [copied, setCopied] = useState(false);

  const copyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={copyJSON}>
          {copied ? <><Check className="h-3 w-3 text-emerald-500" />Copied</> : <><Copy className="h-3 w-3" />Copy JSON</>}
        </Button>
      </div>
      <div className="rounded-lg bg-muted/40 border p-3 max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(record).map(([key, value]) => (
              <tr key={key} className="border-b border-border/30 last:border-0">
                <td className="py-1 pr-3 font-medium text-muted-foreground w-1/3 align-top">{key}</td>
                <td className="py-1 font-mono break-all">
                  {value === null ? <span className="text-muted-foreground/50 italic">null</span>
                    : typeof value === "object" ? JSON.stringify(value)
                    : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dataset Card ─────────────────────────────────────────────────────────────

function DatasetCard({ dataset }: { dataset: GeneratedDataSet }) {
  const [viewOpen, setViewOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const downloadCSV = () => {
    if (!dataset.records.length) return;
    const headers = Object.keys(dataset.records[0]);
    const rows = dataset.records.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${dataset.name}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(dataset.records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${dataset.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 rounded-xl border bg-card hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{dataset.name}</p>
            <Badge variant="secondary" className="text-xs h-5 shrink-0">{dataset.schema.type}</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{dataset.recordCount} records</span>
            {dataset.schema.locale && <span>{dataset.schema.locale}</span>}
            {dataset.schema.maskFields?.length ? <span>{dataset.schema.maskFields.length} masked fields</span> : null}
            <span>{new Date(dataset.generatedAt).toLocaleTimeString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="View records">
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{dataset.name} — Records</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}>←</Button>
                  <span className="text-sm text-muted-foreground">Record {currentIdx + 1} of {dataset.records.length}</span>
                  <Button variant="outline" size="sm" className="h-7" onClick={() => setCurrentIdx(Math.min(dataset.records.length - 1, currentIdx + 1))} disabled={currentIdx >= dataset.records.length - 1}>→</Button>
                </div>
                {dataset.records[currentIdx] && <RecordViewer record={dataset.records[currentIdx]} />}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Download CSV" onClick={downloadCSV}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TestDataFactoryPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "person", count: 10, locale: "en-US",
    maskFields: "", useAI: false,
  });
  const [customFields, setCustomFields] = useState<Array<{ name: string; type: string; options?: string }>>([]);
  const [previewRecord, setPreviewRecord] = useState<Record<string, any> | null>(null);

  const { data: dataTypes = [] } = useQuery<DataTypeOption[]>({
    queryKey: ["/api/data-factory/types"],
  });

  const { data: datasets = [], refetch } = useQuery<GeneratedDataSet[]>({
    queryKey: ["/api/data-factory/datasets"],
    refetchInterval: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const schema: any = {
        type: form.type,
        count: form.count,
        locale: form.locale,
        maskFields: form.maskFields ? form.maskFields.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      };
      if (form.type === "custom" && customFields.length > 0) {
        schema.customFields = customFields.map((f) => ({
          name: f.name,
          type: f.type,
          options: f.options ? f.options.split(",").map((s) => s.trim()) : undefined,
        }));
      }
      const res = await apiRequest("POST", "/api/data-factory/generate", { name: form.name, schema });
      return res.json() as Promise<GeneratedDataSet>;
    },
    onSuccess: (data) => {
      refetch();
      setPreviewRecord(data.records[0] || null);
      toast({ title: "Dataset Generated", description: `${data.recordCount} ${form.type} records created` });
      setCreateOpen(false);
    },
    onError: (e: any) => toast({ title: "Generation Failed", description: e.message, variant: "destructive" }),
  });

  const addCustomField = () => setCustomFields([...customFields, { name: `field${customFields.length + 1}`, type: "string" }]);
  const removeCustomField = (i: number) => setCustomFields(customFields.filter((_, idx) => idx !== i));

  const selectedType = dataTypes.find((t) => t.value === form.type);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg">
            <FlaskConical className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Test Data Factory</h1>
            <p className="text-sm text-muted-foreground">Generate synthetic test data — persons, orders, finance, and more</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Generate Dataset</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Generate Test Data</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Dataset Name</Label>
                <Input placeholder="e.g., Login Test Users" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dataTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Record Count</Label>
                  <Input type="number" min={1} max={100} value={form.count} onChange={(e) => setForm({ ...form, count: parseInt(e.target.value) || 10 })} />
                </div>
              </div>

              {selectedType && (
                <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedType.label}:</span> {selectedType.description}
                </div>
              )}

              <div className="space-y-2">
                <Label>Locale</Label>
                <Select value={form.locale} onValueChange={(v) => setForm({ ...form, locale: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="de-DE">German</SelectItem>
                    <SelectItem value="fr-FR">French</SelectItem>
                    <SelectItem value="es-ES">Spanish</SelectItem>
                    <SelectItem value="ja-JP">Japanese</SelectItem>
                    <SelectItem value="zh-CN">Chinese</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mask Fields (comma-separated)</Label>
                <Input placeholder="email, phone, ssn, credit_card" value={form.maskFields} onChange={(e) => setForm({ ...form, maskFields: e.target.value })} />
                <p className="text-xs text-muted-foreground">These fields will be partially masked in output</p>
              </div>

              {form.type === "custom" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Custom Fields</Label>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCustomField}><Plus className="h-3 w-3 mr-1" />Add Field</Button>
                  </div>
                  {customFields.map((field, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="flex-1 h-8 text-xs" placeholder="fieldName" value={field.name} onChange={(e) => setCustomFields(customFields.map((f, idx) => idx === i ? { ...f, name: e.target.value } : f))} />
                      <select className="h-8 rounded border bg-background px-2 text-xs" value={field.type} onChange={(e) => setCustomFields(customFields.map((f, idx) => idx === i ? { ...f, type: e.target.value } : f))}>
                        {["string","number","boolean","date","email","phone","uuid","enum"].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {field.type === "enum" && (
                        <Input className="flex-1 h-8 text-xs" placeholder="opt1,opt2" value={field.options || ""} onChange={(e) => setCustomFields(customFields.map((f, idx) => idx === i ? { ...f, options: e.target.value } : f))} />
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCustomField(i)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  {customFields.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Add fields above or use AI generation</p>
                  )}
                </div>
              )}

              <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || !form.name || !form.type} className="w-full">
                {generateMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                  : <><Sparkles className="h-4 w-4 mr-2" />Generate {form.count} Records</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Data Type Cards */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Available Data Types</CardTitle>
              <CardDescription className="text-xs">Click to quick-generate 10 records</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {dataTypes.map((dt) => (
                <button
                  key={dt.value}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                  onClick={() => { setForm({ ...form, name: `${dt.label} Dataset`, type: dt.value }); setCreateOpen(true); }}
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Database className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{dt.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{dt.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Datasets + Preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Preview */}
          {previewRecord && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  Last Generated Record (Preview)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecordViewer record={previewRecord} />
              </CardContent>
            </Card>
          )}

          {/* Datasets List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Generated Datasets</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => refetch()}>
                  <RefreshCw className="h-3 w-3" />Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {datasets.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No datasets yet</p>
                  <p className="text-sm mt-1">Click "Generate Dataset" to create synthetic test data</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {datasets.map((ds) => <DatasetCard key={ds.id} dataset={ds} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
