import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequireAdmin } from "@/components/auth/Guards";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { Field, type FormErrors } from "@/components/candidates/CandidateDialog";
import { useCreateProfile, useProfiles } from "@/hooks/useProfiles";
import type { Role } from "@/types";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  head: () => ({
    meta: [
      { title: "Konton — Mini-ATS" },
      { name: "description", content: "Hantera admin- och kundkonton på plattformen." },
      { property: "og:title", content: "Konton — Mini-ATS" },
      { property: "og:description", content: "Hantera admin- och kundkonton på plattformen." },
    ],
  }),
  component: () => (
    <RequireAdmin>
      <Accounts />
    </RequireAdmin>
  ),
});

function Accounts() {
  const profiles = useProfiles();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader
        title="Konton"
        meta="Bara admin ser den här sidan"
        action={<Button onClick={() => setOpen(true)}>+ Nytt konto</Button>}
      />
      <div className="rounded-lg border bg-card">
        {profiles.isLoading ? (
          <LoadingRows rows={3} />
        ) : profiles.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => profiles.refetch()} />
          </div>
        ) : !profiles.data?.length ? (
          <div className="p-4">
            <EmptyState title="Inga konton" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead className="hidden md:table-cell">Företag</TableHead>
                <TableHead className="hidden sm:table-cell">E-post</TableHead>
                <TableHead>Roll</TableHead>
                <TableHead className="hidden md:table-cell">Skapad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-semibold">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground md:hidden">{p.company_name}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.company_name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{p.email}</TableCell>
                  <TableCell>
                    <Badge variant={p.role === "admin" ? "default" : "outline"}>
                      {p.role === "admin" ? "Admin" : "Kund"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden font-mono text-sm md:table-cell">
                    {p.created_at.slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <AccountDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

const empty = { full_name: "", company_name: "", email: "", password: "" };

function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateProfile();
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FormErrors>({});
  useEffect(() => {
    if (open) {
      setForm(empty);
      setRole("customer");
      setErrors({});
    }
  }, [open]);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: FormErrors = {};
    if (!form.full_name.trim()) errs.full_name = "Ange namn.";
    if (!form.company_name.trim()) errs.company_name = "Ange företag.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Ange en giltig e-postadress.";
    if (form.password.length < 8) errs.password = "Lösenordet måste ha minst 8 tecken.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await create.mutateAsync({ ...form, email: form.email.trim(), role });
      toast.success("Kontot är skapat.");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nytt konto</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="a-role" label="Roll">
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="a-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Kund</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="a-name" label="Namn" error={errors.full_name}>
            <Input id="a-name" value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field id="a-co" label="Företag" error={errors.company_name}>
            <Input id="a-co" value={form.company_name} onChange={set("company_name")} />
          </Field>
          <Field id="a-email" label="E-post" error={errors.email}>
            <Input id="a-email" type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field id="a-pw" label="Tillfälligt lösenord" error={errors.password}>
            <Input id="a-pw" type="text" value={form.password} onChange={set("password")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Skapar…" : "Skapa konto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
