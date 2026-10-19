import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
import { CandidateDialog } from "@/components/candidates/CandidateDialog";
import { useCandidates } from "@/hooks/useCandidates";
import { useApplications } from "@/hooks/useApplications";
import { useFormat } from "@/lib/format";
import { pageHead } from "@/lib/i18n";
import type { Candidate } from "@/types";

export const Route = createFileRoute("/_authenticated/candidates")({
  head: ({ match }) => pageHead(match.context.language, "candidates"),
  component: () => <CustomerGate>{(id) => <Candidates customerId={id} />}</CustomerGate>,
});

function Candidates({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const format = useFormat();
  const cands = useCandidates(customerId);
  const apps = useApplications(customerId);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const list = [...(cands.data ?? [])].sort((a, b) => format.compare(a.full_name, b.full_name));

  return (
    <div>
      <PageHeader
        title={t("candidates.title")}
        meta={cands.data ? t("candidates.count", { count: cands.data.length }) : undefined}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t("candidates.new")}
          </Button>
        }
      />
      <div className="rounded-lg border bg-card">
        {cands.isLoading ? (
          <LoadingRows />
        ) : cands.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => cands.refetch()} />
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("candidates.empty")}>{t("candidates.emptyHint")}</EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("candidates.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("candidates.email")}</TableHead>
                <TableHead>{t("candidates.linkedin")}</TableHead>
                <TableHead className="text-right">{t("candidates.jobs")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      {c.full_name}
                    </button>
                    <div className="text-xs text-muted-foreground sm:hidden">{c.email}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{c.email}</TableCell>
                  <TableCell>
                    {c.linkedin_url ? (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {t("candidates.profile")} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {apps.data?.filter((a) => a.candidate_id === c.id).length ?? "…"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <CandidateDialog
        customerId={customerId}
        open={open}
        onOpenChange={setOpen}
        candidate={editing}
      />
    </div>
  );
}
