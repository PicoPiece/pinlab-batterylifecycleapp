import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { canWrite, useAuth } from "../auth";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { formatBytes, formatDateTime } from "../format";
import type { Attachment, Battery, Inspection } from "../types";

export function InspectionDetailPage() {
  const { id } = useParams();
  const inspectionId = Number(id);
  const { user } = useAuth();
  const { t } = useI18n();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [battery, setBattery] = useState<Battery | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(inspectionId)) return;
    setError("");
    try {
      const current = await api.getInspection(inspectionId);
      const [asset, files] = await Promise.all([
        api.getBattery(current.battery_id),
        api.getInspectionAttachments(inspectionId),
      ]);
      setInspection(current);
      setBattery(asset);
      setAttachments(files);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Inspection not found");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      await api.uploadInspectionAttachment(inspectionId, file);
      await load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.detail : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;
  if (!inspection) return <EmptyState title={t("inspections.noInspections")} />;

  const writer = canWrite(user?.role);
  const evidenceReady = attachments.length > 0;
  const measured = Object.entries(inspection.measured_parameters ?? {});

  return (
    <div className="stack-lg">
      <Link className="back-link" to="/inspections">← {t("inspections.back")}</Link>

      <div className="detail-head">
        <div>
          <span className="eyebrow">{t("inspections.detail")}</span>
          <div className="detail-title">
            <h2>{inspection.test_type}</h2>
            <span className={`result result-${inspection.result}`}>{t(`result.${inspection.result}`)}</span>
            <span className={`badge badge-${evidenceReady ? "available" : "inspecting"}`}>
              {evidenceReady ? t("common.evidenceAttached") : t("common.evidencePending")}
            </span>
          </div>
          <p className="muted">
            {battery ? <Link className="table-link" to={`/batteries/${battery.id}`}>{battery.asset_id}</Link> : "—"}
            {battery ? ` · ${battery.model ?? "—"}` : ""}
          </p>
        </div>
        {battery ? <Link className="btn btn-ghost" to={`/batteries/${battery.id}`}>{t("inspections.linkedBattery")}</Link> : null}
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div><span className="eyebrow">{t("inspections.inspectedAt")}</span><h3>{formatDateTime(inspection.inspected_at)}</h3></div>
            {battery ? <StatusBadge status={battery.status} /> : null}
          </div>
          <dl className="spec-grid">
            <div><dt>{t("inspections.technician")}</dt><dd>#{inspection.technician_id}</dd></div>
            <div><dt>{t("inspections.result")}</dt><dd>{t(`result.${inspection.result}`)}</dd></div>
            <div><dt>{t("common.recorded")}</dt><dd>{formatDateTime(inspection.created_at)}</dd></div>
            <div><dt>{t("inspections.evidence")}</dt><dd>{attachments.length} {t("common.files")}</dd></div>
          </dl>
          {inspection.notes ? <p className="note-box">{inspection.notes}</p> : null}
          {inspection.notes?.startsWith("DEMO") ? <span className="badge badge-simulated">{t("inspections.demoRecord")}</span> : null}
        </section>

        <section className="card">
          <div className="card-head">
            <div><span className="eyebrow">{t("inspections.measured")}</span><h3>{t("inspections.measured")}</h3></div>
          </div>
          {measured.length === 0 ? <EmptyState title={t("inspections.noMeasured")} /> : (
            <dl className="spec-grid">
              {measured.map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">{t("inspections.evidenceFiles")}</span>
            <h3>{t("inspections.evidence")}</h3>
          </div>
          {writer ? (
            <label className={`btn btn-primary btn-sm upload-label ${uploading ? "btn-disabled" : ""}`}>
              {uploading ? t("common.loading") : `+ ${t("inspections.uploadEvidence")}`}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => void upload(event.target.files?.[0])}
                disabled={uploading}
              />
            </label>
          ) : null}
        </div>
        {uploadError ? <div className="form-error">{uploadError}</div> : null}
        {attachments.length === 0 ? (
          <EmptyState title={t("inspections.noEvidence")} detail={t("inspections.noEvidenceDetail")} />
        ) : (
          <ul className="attachment-list">
            {attachments.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.filename}</strong>
                  <small>{formatBytes(item.size_bytes)} · {formatDateTime(item.created_at)}</small>
                </div>
                <a className="btn btn-ghost" href={api.downloadUrl(item.id)} target="_blank" rel="noreferrer">
                  {t("common.open")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
