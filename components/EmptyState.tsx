export function EmptyState({
  label,
  detail,
  action,
}: {
  label: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-line px-6 py-16 text-center">
      <p className="label label-lit">{label}</p>
      {detail ? (
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-gray">{detail}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
