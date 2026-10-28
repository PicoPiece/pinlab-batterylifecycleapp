export function Loading({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div className="state-box">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="state-box state-empty">
      <strong>{title}</strong>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-box state-error" role="alert">
      <strong>Không thể tải dữ liệu</strong>
      <span>{message}</span>
    </div>
  );
}
