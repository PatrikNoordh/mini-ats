import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { daysSince, STAGE_LABELS } from "@/lib/stages";
import type { Application, Candidate, Job } from "@/types";

export function CandidateSheet({
  candidate,
  applications,
  jobs,
  onClose,
}: {
  candidate: Candidate | null;
  applications: Application[];
  jobs: Job[];
  onClose: () => void;
}) {
  const links = candidate ? applications.filter((a) => a.candidate_id === candidate.id) : [];
  return (
    <Sheet open={!!candidate} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {candidate && (
          <>
            <SheetHeader>
              <SheetTitle className="text-xl">{candidate.full_name}</SheetTitle>
              <SheetDescription>Tillagd {candidate.created_at.slice(0, 10)}</SheetDescription>
            </SheetHeader>
            <dl className="mt-6 space-y-4 px-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  E-post
                </dt>
                <dd>
                  <a className="text-primary hover:underline" href={`mailto:${candidate.email}`}>
                    {candidate.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Telefon
                </dt>
                <dd>{candidate.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  LinkedIn
                </dt>
                <dd>
                  {candidate.linkedin_url ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Öppna profil <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Anteckningar
                </dt>
                <dd className="whitespace-pre-wrap">
                  {candidate.notes || (
                    <span className="text-muted-foreground">Inga anteckningar.</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Kopplade jobb
                </dt>
                <dd className="space-y-2">
                  {links.length === 0 && (
                    <span className="text-muted-foreground">Inte kopplad till något jobb.</span>
                  )}
                  {links.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="font-medium">
                        {jobs.find((j) => j.id === a.job_id)?.title ?? "Okänt jobb"}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary">{STAGE_LABELS[a.stage]}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {daysSince(a.stage_changed_at)} d
                        </span>
                      </span>
                    </div>
                  ))}
                </dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
