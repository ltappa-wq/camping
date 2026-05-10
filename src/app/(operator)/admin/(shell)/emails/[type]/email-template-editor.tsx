"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fill, textToHtml } from "@/lib/email-templates/render";
import {
  getSampleVars,
  type CustomizableTemplateType,
} from "@/lib/email-templates/variables";
import {
  resetEmailTemplate,
  saveEmailTemplate,
} from "../actions";

type Props = {
  type: CustomizableTemplateType;
  variables: readonly string[];
  defaultSubject: string;
  defaultBodyText: string;
  initialSubject: string;
  initialBodyText: string;
  isCustomized: boolean;
};

export function EmailTemplateEditor(props: Props) {
  const [subject, setSubject] = useState(props.initialSubject);
  const [bodyText, setBodyText] = useState(props.initialBodyText);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const sampleVars = useMemo(() => getSampleVars(props.type), [props.type]);

  const previewSubject = fill(subject, sampleVars);
  const previewText = fill(bodyText, sampleVars);
  const previewHtml = textToHtml(previewText);

  const dirty =
    subject !== props.initialSubject || bodyText !== props.initialBodyText;

  function insertVariable(name: string) {
    const ta = bodyRef.current;
    const insert = `{{${name}}}`;
    if (!ta) {
      setBodyText((b) => b + insert);
      return;
    }
    const start = ta.selectionStart ?? bodyText.length;
    const end = ta.selectionEnd ?? bodyText.length;
    const next =
      bodyText.slice(0, start) + insert + bodyText.slice(end);
    setBodyText(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + insert.length, start + insert.length);
    });
  }

  function onSave() {
    startTransition(async () => {
      const result = await saveEmailTemplate({
        type: props.type,
        subject,
        bodyText,
      });
      if (result.ok) {
        toast({ title: "Template saved" });
      } else {
        toast({
          variant: "destructive",
          title: "Save failed",
          description: result.error,
        });
      }
    });
  }

  function onReset() {
    if (
      !confirm(
        "Reset this template to the system default? Your customizations will be lost.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await resetEmailTemplate(props.type);
      if (result.ok) {
        setSubject(props.defaultSubject);
        setBodyText(props.defaultBodyText);
        toast({ title: "Reset to default" });
      } else {
        toast({
          variant: "destructive",
          title: "Reset failed",
          description: result.error,
        });
      }
    });
  }

  function loadDefault() {
    if (
      dirty &&
      !confirm(
        "Replace the current text with the system default? Your unsaved edits will be lost.",
      )
    ) {
      return;
    }
    setSubject(props.defaultSubject);
    setBodyText(props.defaultBodyText);
  }

  return (
    <div className="space-y-4">
      {props.isCustomized ? (
        <Alert>
          <AlertTitle>Customized</AlertTitle>
          <AlertDescription>
            Outgoing email uses your version. Reset to default to revert.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>Using system default</AlertTitle>
          <AlertDescription>
            Edit and save to override the default.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={props.defaultSubject}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Body (plain text)</Label>
            <Textarea
              id="body"
              ref={bodyRef}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={18}
              spellCheck
              className="font-mono text-sm"
              placeholder={props.defaultBodyText}
            />
            <p className="text-xs text-muted-foreground">
              Use{" "}
              <code className="font-mono text-xs">{"{{variableName}}"}</code>{" "}
              for dynamic values. The HTML version is generated automatically
              from this body.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave} disabled={isPending || !dirty}>
              {isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              {props.isCustomized ? "Save changes" : "Save customization"}
            </Button>
            <Button variant="outline" type="button" onClick={loadDefault}>
              Load default text
            </Button>
            {props.isCustomized ? (
              <Button
                variant="outline"
                type="button"
                onClick={onReset}
                disabled={isPending}
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Reset to default
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border bg-card p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available variables
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Click to insert into the body.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {props.variables.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="rounded border bg-background px-2 py-0.5 font-mono text-xs hover:border-foreground/40 hover:bg-muted"
              >
                {v}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Variables not found in the data become empty text — they don&apos;t
            error.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live preview
            </div>
            <div className="text-xs text-muted-foreground">
              Rendered with sample guest data so you can see what guests will
              read.
            </div>
          </div>
          <Badge variant="secondary">Sample data</Badge>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Subject
            </div>
            <div className="mt-0.5 font-medium">{previewSubject}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Plain text
            </div>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">
              {previewText}
            </pre>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              HTML preview
            </div>
            <div
              className="mt-1 rounded border bg-background p-4 text-sm [&_a]:text-blue-600 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
