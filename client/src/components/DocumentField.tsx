import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function DocumentField({
  label,
  fileUrl,
  onUpload,
  onRemove,
  uploading,
}: {
  label: string;
  fileUrl?: string | null;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  uploading?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast.error("File is too large (max 10MB)");
      return;
    }
    onUpload(file);
    e.target.value = "";
  };

  return (
    <div>
      <Label>{label}</Label>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.doc,.docx"
        onChange={handleChange}
      />
      {fileUrl ? (
        <div className="flex items-center gap-2 mt-1 p-2 rounded-md border bg-muted/30">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
          >
            View document <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </Button>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                disabled={uploading}
                onClick={onRemove}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 w-full justify-start"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-2" />
          {uploading ? "Uploading..." : `Upload ${label}`}
        </Button>
      )}
    </div>
  );
}

export function fileToBase64(file: File): Promise<{ base64: string; contentType: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve({ base64, contentType: file.type, fileName: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
