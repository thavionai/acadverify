// components/verify/DisclosedWithheldPanel.tsx
import type { DisclosedFields } from "@/lib/types";

const FIELD_LABELS: Record<keyof DisclosedFields, string> = {
  institution: "Institution",
  institutionId: "Institution ID",
  degree: "Degree",
  degreeCode: "Degree code",
  graduationYear: "Graduation year",
  gpa: "GPA",
};

// Human-readable labels for fields that only ever appear in `withheld`
// (never in `disclosed`), e.g. studentId.
const WITHHELD_LABELS: Record<string, string> = {
  studentId: "Student ID",
  gpa: "GPA",
};

export function DisclosedWithheldPanel({
  disclosed,
  withheld,
}: {
  disclosed: DisclosedFields;
  withheld: string[];
}) {
  const disclosedEntries = Object.entries(disclosed).filter(
    ([, value]) => value !== null && value !== undefined,
  ) as [keyof DisclosedFields, string | number][];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <section
        aria-labelledby="disclosed-heading"
        className="border border-outline-variant rounded-lg bg-background-surface p-5"
      >
        <h3
          id="disclosed-heading"
          className="font-label-sm text-label-sm text-status-valid-text uppercase tracking-wide mb-3 flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
            visibility
          </span>
          Shared with you
        </h3>
        <dl className="space-y-3">
          {disclosedEntries.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4">
              <dt className="font-body-sm text-body-sm text-on-surface-variant">{FIELD_LABELS[key]}</dt>
              <dd className="font-label-md text-label-md text-on-surface text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="withheld-heading"
        className="border border-outline-variant rounded-lg bg-background-muted p-5"
      >
        <h3
          id="withheld-heading"
          className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide mb-3 flex items-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
            visibility_off
          </span>
          Not shared with you
        </h3>
        {withheld.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Everything about this credential was disclosed.
          </p>
        ) : (
          <ul className="space-y-3">
            {withheld.map((field) => (
              <li key={field} className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
                  lock
                </span>
                {WITHHELD_LABELS[field] ?? field}
              </li>
            ))}
          </ul>
        )}
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-4 pt-4 border-t border-outline-variant">
          The student chose not to disclose these fields. The proof confirms the
          credential is valid without revealing them.
        </p>
      </section>
    </div>
  );
}