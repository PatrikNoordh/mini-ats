import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/Field";
import { useCreateCompany, useRenameCompany } from "@/hooks/useCompanies";
import { useErrorToast } from "@/hooks/useErrorToast";
import { MAX_NAME_LENGTH } from "@/lib/constants";
import { companyInputSchema, fieldErrors, type FormErrors } from "@/lib/validation";
import type { Company } from "@/types";

/** Creates a company, or renames `company` when it is given (ATS-46). Its id never changes. */
export function CompanyDialog({
  open,
  onOpenChange,
  company = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company?: Company | null;
}) {
  const { t } = useTranslation();
  const create = useCreateCompany();
  const rename = useRenameCompany();
  const errorToast = useErrorToast();
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FormErrors<{ name: string }>>({});
  const busy = create.isPending || rename.isPending;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(company?.name ?? "");
  }, [open, company]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = companyInputSchema.safeParse({ name });
    setErrors(parsed.success ? {} : fieldErrors(companyInputSchema, parsed.error));
    if (!parsed.success) return;
    try {
      if (company) {
        await rename.mutateAsync({ id: company.id, name: parsed.data.name });
        toast.success(t("companyDialog.renamed"));
      } else {
        await create.mutateAsync(parsed.data.name);
        toast.success(t("companyDialog.created"));
      }
      onOpenChange(false);
    } catch (err) {
      errorToast(t(company ? "companyDialog.renameFailed" : "companyDialog.createFailed"), err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {company ? t("companyDialog.titleRename") : t("companyDialog.titleNew")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="c-name" label={t("companyDialog.name")} error={errors.name}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {company
                ? rename.isPending
                  ? t("common.saving")
                  : t("common.save")
                : create.isPending
                  ? t("companyDialog.submitting")
                  : t("companyDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
