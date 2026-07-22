import { useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getActiveOrgId, setActiveOrgId } from "@/_core/activeOrg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CREATE_NEW_VALUE = "__create__";

export function OrgSwitcher() {
  const { data: memberships } = trpc.organizations.list.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  const createMutation = trpc.organizations.create.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.name} created`);
      setActiveOrgId(result.organizationId);
      setDialogOpen(false);
      setNewCompanyName("");
      window.location.reload();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!memberships || memberships.length === 0) return;
    const current = getActiveOrgId();
    const stillValid = current && memberships.some(m => m.organizationId === current);
    if (stillValid) {
      setSelected(current);
    } else {
      setActiveOrgId(memberships[0].organizationId);
      setSelected(memberships[0].organizationId);
    }
  }, [memberships]);

  const handleChange = (value: string) => {
    if (value === CREATE_NEW_VALUE) {
      setDialogOpen(true);
      return;
    }
    const id = parseInt(value, 10);
    setActiveOrgId(id);
    setSelected(id);
    window.location.reload();
  };

  return (
    <>
      <Select value={selected ? String(selected) : undefined} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <Building2 className="h-4 w-4 mr-1 shrink-0" />
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          {memberships?.map(m => (
            <SelectItem key={m.organizationId} value={String(m.organizationId)}>
              {m.organizationName}
            </SelectItem>
          ))}
          <SelectItem value={CREATE_NEW_VALUE}>
            <span className="flex items-center gap-1.5 text-primary">
              <Plus className="h-3.5 w-3.5" /> Create new company
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new company</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <Label htmlFor="newCompanyName">Company name</Label>
            <Input
              id="newCompanyName"
              value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              placeholder="e.g. My Second Fleet LLC"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate({ name: newCompanyName })}
              disabled={!newCompanyName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
