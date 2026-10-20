import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerGate } from "@/components/layout/CustomerGate";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { JobDialog } from "@/components/jobs/JobDialog";
import { useJobs, useSetJobStatus } from "@/hooks/useJobs";
import { errorCode } from "@/lib/errors";
import { pageHead } from "@/lib/i18n";
import { useFormat } from "@/lib/format";
import type { JobWithCount } from "@/types";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: ({ match }) => pageHead(match.context.language, "jobs"),
  component: () => <CustomerGate>{(id) => <Jobs customerId={id} />}</CustomerGate>,
});

function Jobs({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const jobs = useJobs(customerId);
  const setStatus = useSetJobStatus(customerId);
  const [editing, setEditing] = useState<JobWithCount | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async (j: JobWithCount) => {
    const status = j.status === "open" ? "closed" : "open";
    try {
      await setStatus.mutateAsync({ id: j.id, status });
      toast.success(status === "open" ? t("jobs.reopened") : t("jobs.closedToast"));
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === "unknown" ? t("jobs.statusFailed") : t(`errors.${code}`));
    }
  };

  return (
    <div>
      <PageHeader
        title={t("jobs.title")}
        meta={
          jobs.data
            ? t("jobs.openCount", { count: jobs.data.filter((j) => j.status === "open").length })
            : undefined
        }
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t("jobs.new")}
          </Button>
        }
      />
      <div className="rounded-lg border bg-card">
        {jobs.isLoading ? (
          <LoadingRows rows={4} />
        ) : jobs.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => jobs.refetch()} />
          </div>
        ) : !jobs.data?.length ? (
          <div className="p-4">
            <EmptyState title={t("jobs.empty")}>{t("jobs.emptyHint")}</EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("jobs.jobTitle")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("jobs.location")}</TableHead>
                <TableHead>{t("jobs.status")}</TableHead>
                <TableHead className="text-right">{t("jobs.candidates")}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.data.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="wrap-anywhere">
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => {
                        setEditing(j);
                        setOpen(true);
                      }}
                    >
                      {j.title}
                    </button>
                    <div className="text-xs text-muted-foreground sm:hidden">{j.location}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{j.location}</TableCell>
                  <TableCell>
                    <Badge variant={j.status === "open" ? "default" : "secondary"}>
                      {j.status === "open" ? t("jobs.open") : t("jobs.closed")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{format.number(j.candidate_count)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setStatus.isPending && setStatus.variables.id === j.id}
                      onClick={() => toggle(j)}
                    >
                      {j.status === "open" ? t("jobs.close") : t("jobs.reopen")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <JobDialog customerId={customerId} open={open} onOpenChange={setOpen} job={editing} />
    </div>
  );
}
