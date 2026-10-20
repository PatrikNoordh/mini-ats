import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/Field";
import { useAddApplication } from "@/hooks/useApplications";
import { errorCode } from "@/lib/errors";
import { jobsToAdd } from "@/lib/stages";
import type { Application, Job } from "@/types";

/** Adds the candidate to one more open job. The new card starts in the `new` stage. */
export function AddToJob({
  customerId,
  candidateId,
  applications,
  jobs,
}: {
  customerId: string;
  candidateId: string;
  applications: Application[];
  jobs: Job[];
}) {
  const { t } = useTranslation();
  const add = useAddApplication(customerId);
  const [jobId, setJobId] = useState("");
  const available = jobsToAdd(jobs, applications, candidateId);

  if (available.length === 0) {
    return <p className="text-muted-foreground">{t("candidateSheet.noJobsToAdd")}</p>;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!jobId) return;
    try {
      await add.mutateAsync({ candidateId, jobId });
      toast.success(t("candidateSheet.addedToast"));
      setJobId("");
    } catch (err) {
      toast.error(t(`errors.${errorCode(err)}`));
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Field id="add-to-job" label={t("candidateSheet.addToJob")}>
        {(control) => (
          <div className="flex gap-2">
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger {...control} className="flex-1">
                <SelectValue placeholder={t("candidateSheet.chooseJob")} />
              </SelectTrigger>
              <SelectContent>
                {available.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!jobId || add.isPending}>
              {add.isPending ? t("candidateSheet.adding") : t("candidateSheet.add")}
            </Button>
          </div>
        )}
      </Field>
      <p className="text-xs text-muted-foreground">{t("candidateDialog.newLinksHint")}</p>
    </form>
  );
}
