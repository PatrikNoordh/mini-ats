import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_SEARCH_LENGTH } from "@/lib/constants";
import type { Job } from "@/types";

export interface BoardFilterValues {
  job?: string | undefined;
  q?: string | undefined;
}

/** The job filter and the name search above the board. Each control has its own hidden label. */
export function BoardFilters({
  jobs,
  job,
  q,
  onChange,
}: {
  jobs: readonly Pick<Job, "id" | "title" | "status">[] | undefined;
  job: string | undefined;
  q: string | undefined;
  onChange: (patch: BoardFilterValues) => void;
}) {
  const { t } = useTranslation();
  const jobId = useId();
  const searchId = useId();
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <Label htmlFor={jobId} className="sr-only">
        {t("pipeline.filterByJob")}
      </Label>
      <Select
        value={job ?? "all"}
        onValueChange={(v) => onChange({ job: v === "all" ? undefined : v })}
      >
        <SelectTrigger id={jobId} className="h-9 sm:w-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("pipeline.allJobs")}</SelectItem>
          {jobs?.map((j) => (
            <SelectItem key={j.id} value={j.id}>
              {j.status === "closed" ? t("pipeline.closedJob", { title: j.title }) : j.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor={searchId} className="sr-only">
        {t("pipeline.search")}
      </Label>
      <Input
        id={searchId}
        maxLength={MAX_SEARCH_LENGTH}
        className="h-9 sm:w-search"
        placeholder={t("pipeline.search")}
        value={q ?? ""}
        onChange={(e) => onChange({ q: e.target.value || undefined })}
      />
    </div>
  );
}
