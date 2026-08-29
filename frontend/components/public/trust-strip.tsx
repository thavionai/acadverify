const PLACEHOLDER_INSTITUTIONS = [
  "University of Tech",
  "Global Academy",
  "Institute of Science",
  "State College",
];

export function TrustStrip({ label = "Trusted by leading institutions" }: { label?: string }) {
  return (
    <div className="border-t border-slate-200 py-12">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <ul className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {PLACEHOLDER_INSTITUTIONS.map((name) => (
          <li key={name} className="text-base font-medium text-slate-400">
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
