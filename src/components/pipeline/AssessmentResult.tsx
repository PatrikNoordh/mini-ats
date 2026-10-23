import { useTranslation } from "react-i18next";
import { MAX_ASSESSMENT_SCORE } from "@/lib/constants";
import { useFormat } from "@/lib/format";
import type { CvAssessment } from "@/types";

/** One AI assessment: the score, the summary, strengths and gaps, and when it was made. */
export function AssessmentResult({ assessment }: { assessment: CvAssessment }) {
  const { t } = useTranslation();
  const format = useFormat();
  const lists = [
    { key: "strengths", title: t("assessment.strengths"), items: assessment.strengths },
    { key: "gaps", title: t("assessment.gaps"), items: assessment.gaps },
  ];
  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{format.number(assessment.score)}</span>
        <span className="text-muted-foreground">
          {t("assessment.outOf", { max: MAX_ASSESSMENT_SCORE })}
        </span>
      </p>
      <p className="whitespace-pre-wrap">{assessment.summary}</p>
      {lists.map(
        ({ key, title, items }) =>
          items.length > 0 && (
            <div key={key}>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </h4>
              <ul className="list-disc space-y-1 pl-5">
                {items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ),
      )}
      <p className="text-xs text-muted-foreground">
        {t("assessment.assessedAt", { date: format.date(assessment.created_at) })}
      </p>
    </div>
  );
}
