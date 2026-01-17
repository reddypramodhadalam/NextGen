import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language = "typescript", className, showLineNumbers = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split("\n");

  return (
    <div className={cn("relative group rounded-lg bg-muted overflow-hidden", className)}>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleCopy}
          data-testid="button-copy-code"
          className="h-8"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground uppercase">{language}</span>
      </div>
      <div className="overflow-x-auto p-4">
        <pre className="font-mono text-sm">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="select-none text-muted-foreground/50 w-8 text-right pr-4 shrink-0">
                  {i + 1}
                </span>
              )}
              <code>{line}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
