import { useI18n } from "../i18n";

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="state-box" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{label ?? t("common.loading")}</span>
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
  const { t } = useI18n();
  return (
    <div className="state-box state-error" role="alert">
      <strong>{t("common.error")}</strong>
      <span>{message}</span>
    </div>
  );
}
