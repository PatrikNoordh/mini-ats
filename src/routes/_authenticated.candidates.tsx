import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
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
import type { Candidate } from "@/types";

export const Route = createFileRoute("/_authenticated/candidates")({
  head: () => ({
    meta: [
      { title: "Kandidater — Mini-ATS" },
      { name: "description", content: "Alla kandidater med kontaktuppgifter och kopplade jobb." },
      { property: "og:title", content: "Kandidater — Mini-ATS" },
      {
        property: "og:description",
        content: "Alla kandidater med kontaktuppgifter och kopplade jobb.",
      },
    ],
  }),
  component: () => <CustomerGate>{(id) => <Candidates customerId={id} />}</CustomerGate>,
});

function Candidates({ customerId }: { customerId: string }) {
  const cands = useCandidates(customerId);
  const apps = useApplications(customerId);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const list = [...(cands.data ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name, "sv"));

  return (
    <div>
      <PageHeader
        title="Kandidater"
        meta={cands.data ? `${cands.data.length} st` : undefined}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            + Ny kandidat
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
            <EmptyState title="Inga kandidater än">Lägg till den första kandidaten.</EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namn</TableHead>
                <TableHead className="hidden sm:table-cell">E-post</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead className="text-right">Jobb</TableHead>
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
                        Profil <ExternalLink className="h-3.5 w-3.5" />
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
