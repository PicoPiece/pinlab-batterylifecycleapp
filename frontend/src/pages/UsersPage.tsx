import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { formatDateTime } from "../format";
import type {
  AdminPasswordResetResponse,
  BatteryAssignment,
  BatteryPortfolioItem,
  Membership,
  Organization,
  OrganizationRole,
  Role,
  SecurityAuditEvent,
  User,
} from "../types";

const INTERNAL_ROLES: Role[] = ["admin", "technician", "viewer"];
const ALL_ORG_ROLES: OrganizationRole[] = [
  "pinlab_super_admin",
  "pinlab_manager",
  "pinlab_technician",
  "agency_admin",
  "agency_technician",
  "viewer",
];
const AGENCY_ROLES: OrganizationRole[] = ["agency_admin", "agency_technician", "viewer"];
const AGENCY_TECH_ROLES: OrganizationRole[] = ["agency_technician", "viewer"];

type Tab = "people" | "assets" | "audit";

export function UsersPage() {
  const { user, access } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("people");
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [portfolio, setPortfolio] = useState<BatteryPortfolioItem[]>([]);
  const [assignments, setAssignments] = useState<BatteryAssignment[]>([]);
  const [audit, setAudit] = useState<SecurityAuditEvent[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedBatteryId, setSelectedBatteryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgLoading, setOrgLoading] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetResult, setResetResult] = useState<AdminPasswordResetResponse | null>(null);
  const [resetBusy, setResetBusy] = useState<number | null>(null);
  const [internalForm, setInternalForm] = useState({
    email: "",
    full_name: "",
    role: "viewer" as Role,
    password: "",
  });
  const [orgForm, setOrgForm] = useState({ name: "", slug: "" });
  const [orgUserForm, setOrgUserForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "viewer" as OrganizationRole,
  });
  const [membershipUserId, setMembershipUserId] = useState("");
  const [membershipRole, setMembershipRole] = useState<OrganizationRole>("viewer");
  const [assignUserId, setAssignUserId] = useState("");
  const [ownershipOrgId, setOwnershipOrgId] = useState("");

  const isSuper = access?.is_super_admin ?? false;
  const selectedOrg = useMemo(
    () => organizations.find((item) => item.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );
  const selectedBattery = useMemo(
    () => portfolio.find((item) => item.id === selectedBatteryId) ?? null,
    [portfolio, selectedBatteryId],
  );
  const myOrgRole = access?.memberships.find((item) => item.organization_id === selectedOrgId)?.role;
  const availableOrgRoles = useMemo(() => {
    if (isSuper) return ALL_ORG_ROLES;
    if (access?.is_manager) return AGENCY_ROLES;
    if (myOrgRole === "agency_admin") return AGENCY_TECH_ROLES;
    return AGENCY_TECH_ROLES;
  }, [access?.is_manager, isSuper, myOrgRole]);
  const availableInternalUsers = useMemo(
    () => users.filter((item) => !memberships.some((membership) => membership.user_id === item.id)),
    [users, memberships],
  );
  const eligibleTechnicians = useMemo(
    () =>
      memberships.filter(
        (item) =>
          item.is_active &&
          item.organization_id === selectedBattery?.organization_id &&
          (item.role === "pinlab_technician" || item.role === "agency_technician"),
      ),
    [memberships, selectedBattery?.organization_id],
  );

  const loadUsers = async () => {
    if (!isSuper) return;
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load users");
    }
  };

  const loadMemberships = async (organizationId: number) => {
    setOrgLoading(true);
    try {
      setMemberships(await api.listMemberships(organizationId));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load memberships");
    } finally {
      setOrgLoading(false);
    }
  };

  const loadAudit = async (organizationId: number) => {
    try {
      setAudit(await api.listAudit(organizationId));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load audit history");
    }
  };

  const loadAssignments = async (batteryId: number) => {
    setAssignmentLoading(true);
    try {
      setAssignments(await api.listAssignments(batteryId));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load assignments");
    } finally {
      setAssignmentLoading(false);
    }
  };

  useEffect(() => {
    if (!access?.can_manage_access) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.listOrganizations(),
      api.portfolio(),
      isSuper ? api.getUsers() : Promise.resolve([] as User[]),
    ])
      .then(([nextOrganizations, nextPortfolio, nextUsers]) => {
        if (!active) return;
        setOrganizations(nextOrganizations);
        setPortfolio(nextPortfolio);
        setUsers(nextUsers);
        if (nextOrganizations.length > 0) setSelectedOrgId((current) => current ?? nextOrganizations[0].id);
        if (nextPortfolio.length > 0) setSelectedBatteryId((current) => current ?? nextPortfolio[0].id);
      })
      .catch((err) => active && setError(err instanceof ApiError ? err.detail : "Unable to load access data"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [access?.can_manage_access, isSuper]);

  useEffect(() => {
    if (selectedOrgId === null) return;
    void loadMemberships(selectedOrgId);
    void loadAudit(selectedOrgId);
  }, [selectedOrgId]);

  useEffect(() => {
    if (selectedBatteryId === null) {
      setAssignments([]);
      return;
    }
    void loadAssignments(selectedBatteryId);
  }, [selectedBatteryId]);

  useEffect(() => {
    setOwnershipOrgId(selectedBattery?.organization_id ? String(selectedBattery.organization_id) : "");
    setAssignUserId("");
  }, [selectedBattery?.id, selectedBattery?.organization_id]);

  useEffect(() => {
    if (!availableOrgRoles.includes(orgUserForm.role)) {
      setOrgUserForm((form) => ({ ...form, role: availableOrgRoles[0] ?? "viewer" }));
    }
    if (!availableOrgRoles.includes(membershipRole)) {
      setMembershipRole(availableOrgRoles[0] ?? "viewer");
    }
  }, [availableOrgRoles, orgUserForm.role, membershipRole]);

  if (!access?.can_manage_access) {
    return (
      <div className="state-box state-error">
        <strong>{t("users.noPermission")}</strong>
        <span>{t("access.noPermission")}</span>
      </div>
    );
  }

  const refreshOrgDetails = async () => {
    if (selectedOrgId !== null) {
      await Promise.all([loadMemberships(selectedOrgId), loadAudit(selectedOrgId)]);
    }
  };

  const resetPassword = async (target: User) => {
    if (!window.confirm(t("password.resetConfirm", { email: target.email }))) return;
    setResetBusy(target.id);
    setError("");
    try {
      setResetResult(await api.resetUserPassword(target.id));
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to reset password");
    } finally {
      setResetBusy(null);
    }
  };

  const resetOrgPassword = async (membership: Membership) => {
    if (selectedOrgId === null) return;
    if (!window.confirm(t("password.resetConfirm", { email: membership.user_email }))) return;
    setResetBusy(membership.id);
    setError("");
    try {
      setResetResult(await api.resetOrganizationUserPassword(selectedOrgId, membership.user_id));
      await refreshOrgDetails();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to reset password");
    } finally {
      setResetBusy(null);
    }
  };

  const toggleUser = async (target: User) => {
    setSaving(true);
    setError("");
    try {
      await api.updateUser(target.id, { is_active: !target.is_active });
      await loadUsers();
      setMessage(target.is_active ? t("users.inactive") : t("users.active"));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to update user");
    } finally {
      setSaving(false);
    }
  };

  const toggleMembership = async (membership: Membership) => {
    setSaving(true);
    setError("");
    try {
      await api.updateMembership(membership.id, { is_active: !membership.is_active });
      await refreshOrgDetails();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to update membership");
    } finally {
      setSaving(false);
    }
  };

  const changeMembershipRole = async (membership: Membership, role: OrganizationRole) => {
    setSaving(true);
    setError("");
    try {
      await api.updateMembership(membership.id, { role });
      await refreshOrgDetails();
      setMessage(t("users.roleUpdated"));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to update role");
    } finally {
      setSaving(false);
    }
  };

  const createInternalUser = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createUser(internalForm);
      setMessage(t("users.createdMessage", { email: created.email }));
      setInternalForm({ email: "", full_name: "", role: "viewer", password: "" });
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to create user");
    } finally {
      setSaving(false);
    }
  };

  const createOrganization = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createOrganization({
        name: orgForm.name,
        slug: orgForm.slug,
        kind: "agency",
      });
      setOrganizations((items) => [...items, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedOrgId(created.id);
      setOrgForm({ name: "", slug: "" });
      setMessage(t("users.organizationCreated", { name: created.name }));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to create organization");
    } finally {
      setSaving(false);
    }
  };

  const createOrganizationUser = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedOrgId === null) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createOrganizationUser(selectedOrgId, orgUserForm);
      setMessage(t("users.createdMessage", { email: created.email }));
      setOrgUserForm({ email: "", full_name: "", password: "", role: availableOrgRoles[0] ?? "viewer" });
      await refreshOrgDetails();
      if (isSuper) await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to create organization user");
    } finally {
      setSaving(false);
    }
  };

  const addExistingMembership = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedOrgId === null || !membershipUserId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.createMembership(selectedOrgId, {
        user_id: Number(membershipUserId),
        role: membershipRole,
      });
      setMembershipUserId("");
      await refreshOrgDetails();
      setMessage(t("users.membershipAdded"));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to add membership");
    } finally {
      setSaving(false);
    }
  };

  const saveOwnership = async () => {
    if (!selectedBattery || !ownershipOrgId) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateBattery(selectedBattery.id, {
        organization_id: Number(ownershipOrgId),
      });
      setPortfolio((items) => items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setMessage(t("users.ownershipUpdated"));
      await loadAssignments(selectedBattery.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to update battery ownership");
    } finally {
      setSaving(false);
    }
  };

  const assignTechnician = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBattery || !assignUserId) return;
    setSaving(true);
    setError("");
    try {
      await api.createAssignment(selectedBattery.id, Number(assignUserId));
      setAssignUserId("");
      await loadAssignments(selectedBattery.id);
      setMessage(t("users.assignmentAdded"));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to assign technician");
    } finally {
      setSaving(false);
    }
  };

  const endAssignment = async (assignment: BatteryAssignment) => {
    setSaving(true);
    setError("");
    try {
      await api.endAssignment(assignment.id);
      await loadAssignments(assignment.battery_id);
      setMessage(t("users.assignmentEnded"));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to end assignment");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label={t("common.loading")} />;

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("users.kicker")}</span>
          <h2>{t("users.title")}</h2>
          <p className="muted">{t("users.subtitle")}</p>
        </div>
      </div>

      <div className="access-tabs" role="tablist" aria-label={t("users.title")}>
        {(["people", "assets", "audit"] as Tab[]).map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "access-tab active" : "access-tab"}
            onClick={() => setTab(item)}
          >
            {t(`users.tab.${item}`)}
          </button>
        ))}
      </div>

      {error ? <div className="form-error">{error}</div> : null}
      {message ? <div className="form-success">{message}</div> : null}

      {tab === "people" ? (
        <div className="stack-lg">
          {isSuper ? (
            <section className="card">
              <div className="card-head">
                <div><span className="eyebrow">{t("users.internal")}</span><h3>{t("users.accounts")}</h3></div>
                <span className="toolbar-count">{users.length}</span>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>{t("users.fullName")}</th><th>Email</th><th>{t("users.role")}</th><th>{t("users.accountStatus")}</th><th>{t("users.created")}</th><th>{t("common.actions")}</th></tr></thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.full_name}</strong></td>
                        <td>{item.email}</td>
                        <td>{t(`role.${item.role}`)}</td>
                        <td>{item.is_active ? t("users.active") : t("users.inactive")}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                        <td className="table-actions">
                          {item.id === user?.id ? <span className="muted">—</span> : (
                            <>
                              <button className="reset-button" disabled={saving} onClick={() => void toggleUser(item)}>
                                {item.is_active ? t("users.deactivate") : t("users.activate")}
                              </button>
                              <button className="reset-button" disabled={resetBusy === item.id} onClick={() => void resetPassword(item)}>
                                {resetBusy === item.id ? t("common.loading") : t("password.resetAction")}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="stack org-form" onSubmit={createInternalUser}>
                <div className="card-head"><div><span className="eyebrow">{t("users.create")}</span><h3>{t("users.add")}</h3></div></div>
                <div className="grid-2 compact">
                  <label className="field"><span>Email *</span><input className="input" type="email" value={internalForm.email} onChange={(event) => setInternalForm((form) => ({ ...form, email: event.target.value }))} required /></label>
                  <label className="field"><span>{t("users.fullName")} *</span><input className="input" value={internalForm.full_name} onChange={(event) => setInternalForm((form) => ({ ...form, full_name: event.target.value }))} required /></label>
                  <label className="field"><span>{t("users.role")} *</span><select className="select" value={internalForm.role} onChange={(event) => setInternalForm((form) => ({ ...form, role: event.target.value as Role }))}>{INTERNAL_ROLES.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}</select></label>
                  <label className="field"><span>{t("users.tempPassword")} *</span><input className="input" type="password" minLength={8} value={internalForm.password} onChange={(event) => setInternalForm((form) => ({ ...form, password: event.target.value }))} required /></label>
                </div>
                <button className="btn btn-primary" disabled={saving}>{saving ? t("users.creating") : t("users.createButton")}</button>
              </form>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <div><span className="eyebrow">{t("users.organizations")}</span><h3>{t("users.memberships")}</h3></div>
              <span className="toolbar-count">{organizations.length}</span>
            </div>
            {organizations.length === 0 ? <EmptyState title={t("users.noOrganizations")} /> : (
              <>
                <div className="toolbar">
                  <label className="field inline-field"><span>{t("users.organization")}</span>
                    <select className="select" value={selectedOrgId ?? ""} onChange={(event) => setSelectedOrgId(Number(event.target.value))}>
                      {organizations.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.kind})</option>)}
                    </select>
                  </label>
                  <span className="toolbar-count">{selectedOrg?.slug}</span>
                </div>
                {isSuper ? (
                  <form className="toolbar" onSubmit={createOrganization}>
                    <input className="input" placeholder={t("users.orgName")} value={orgForm.name} onChange={(event) => setOrgForm((form) => ({ ...form, name: event.target.value }))} required />
                    <input className="input" placeholder={t("users.orgSlug")} pattern="[a-z0-9-]+" value={orgForm.slug} onChange={(event) => setOrgForm((form) => ({ ...form, slug: event.target.value.toLowerCase() }))} required />
                    <button className="btn btn-primary btn-sm" disabled={saving}>{t("users.createOrganization")}</button>
                  </form>
                ) : null}
                {orgLoading ? <Loading /> : memberships.length === 0 ? <EmptyState title={t("users.noMemberships")} /> : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>{t("users.fullName")}</th><th>Email</th><th>{t("users.role")}</th><th>{t("users.accountStatus")}</th><th>{t("common.actions")}</th></tr></thead>
                      <tbody>
                        {memberships.map((membership) => {
                          const roleOptions = availableOrgRoles.includes(membership.role) ? availableOrgRoles : [membership.role];
                          return (
                            <tr key={membership.id}>
                              <td><strong>{membership.user_full_name}</strong></td>
                              <td>{membership.user_email}</td>
                              <td>
                                <select className="select select-sm" value={membership.role} disabled={saving || roleOptions.length === 1} onChange={(event) => void changeMembershipRole(membership, event.target.value as OrganizationRole)}>
                                  {roleOptions.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
                                </select>
                              </td>
                              <td>{membership.is_active ? t("users.active") : t("users.inactive")}</td>
                              <td className="table-actions">
                                {membership.user_id === user?.id ? <span className="muted">—</span> : (
                                  <>
                                    <button className="reset-button" disabled={saving} onClick={() => void toggleMembership(membership)}>
                                      {membership.is_active ? t("users.deactivate") : t("users.activate")}
                                    </button>
                                    <button className="reset-button" disabled={resetBusy === membership.id} onClick={() => void resetOrgPassword(membership)}>
                                      {resetBusy === membership.id ? t("common.loading") : t("password.resetAction")}
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid-2 compact org-forms">
                  <form className="stack" onSubmit={createOrganizationUser}>
                    <div className="card-head"><div><span className="eyebrow">{t("users.create")}</span><h3>{t("users.addOrgUser")}</h3></div></div>
                    <label className="field"><span>Email *</span><input className="input" type="email" value={orgUserForm.email} onChange={(event) => setOrgUserForm((form) => ({ ...form, email: event.target.value }))} required /></label>
                    <label className="field"><span>{t("users.fullName")} *</span><input className="input" value={orgUserForm.full_name} onChange={(event) => setOrgUserForm((form) => ({ ...form, full_name: event.target.value }))} required /></label>
                    <label className="field"><span>{t("users.tempPassword")} *</span><input className="input" type="password" minLength={8} value={orgUserForm.password} onChange={(event) => setOrgUserForm((form) => ({ ...form, password: event.target.value }))} required /></label>
                    <label className="field"><span>{t("users.role")} *</span><select className="select" value={orgUserForm.role} onChange={(event) => setOrgUserForm((form) => ({ ...form, role: event.target.value as OrganizationRole }))}>{availableOrgRoles.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}</select></label>
                    <button className="btn btn-primary" disabled={saving}>{saving ? t("users.creating") : t("users.createButton")}</button>
                  </form>

                  {isSuper ? (
                    <form className="stack" onSubmit={addExistingMembership}>
                      <div className="card-head"><div><span className="eyebrow">{t("users.membership")}</span><h3>{t("users.addExisting")}</h3></div></div>
                      <label className="field"><span>{t("users.account")}</span>
                        <select className="select" value={membershipUserId} onChange={(event) => setMembershipUserId(event.target.value)} required>
                          <option value="">{t("users.selectUser")}</option>
                          {availableInternalUsers.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.email}</option>)}
                        </select>
                      </label>
                      <label className="field"><span>{t("users.role")} *</span><select className="select" value={membershipRole} onChange={(event) => setMembershipRole(event.target.value as OrganizationRole)}>{availableOrgRoles.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}</select></label>
                      <button className="btn btn-ghost" disabled={saving || !membershipUserId}>{t("users.addMembership")}</button>
                    </form>
                  ) : <div className="muted">{t("users.scopedUserHint")}</div>}
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}

      {tab === "assets" ? (
        <section className="card">
          <div className="card-head">
            <div><span className="eyebrow">{t("users.assets")}</span><h3>{t("users.ownership")}</h3></div>
            <span className="toolbar-count">{portfolio.length}</span>
          </div>
          {portfolio.length === 0 ? <EmptyState title={t("fleet.noAssets")} /> : (
            <>
              <div className="toolbar">
                <label className="field inline-field"><span>{t("users.battery")}</span>
                  <select className="select" value={selectedBatteryId ?? ""} onChange={(event) => setSelectedBatteryId(Number(event.target.value))}>
                    {portfolio.map((item) => <option key={item.id} value={item.id}>{item.asset_id}</option>)}
                  </select>
                </label>
              </div>
              {selectedBattery ? (
                <div className="grid-2 compact">
                  <section className="mini-panel">
                    <span className="eyebrow">{t("users.organization")}</span>
                    <strong>{organizations.find((item) => item.id === selectedBattery.organization_id)?.name ?? t("users.unassigned")}</strong>
                    {isSuper || access?.is_manager ? (
                      <div className="toolbar">
                        <select className="select" value={ownershipOrgId} onChange={(event) => setOwnershipOrgId(event.target.value)}>
                          <option value="">{t("users.unassigned")}</option>
                          {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm" disabled={saving || !ownershipOrgId} onClick={() => void saveOwnership()}>{t("common.save")}</button>
                      </div>
                    ) : null}
                  </section>
                  <section className="mini-panel">
                    <span className="eyebrow">{t("users.technicians")}</span>
                    {assignmentLoading ? <Loading /> : assignments.length === 0 ? <p className="muted">{t("users.noAssignments")}</p> : (
                      <div className="assignment-list">
                        {assignments.map((assignment) => (
                          <div className="assignment-row" key={assignment.id}>
                            <span><strong>{assignment.user_full_name}</strong><small>{assignment.user_email}</small></span>
                            <button className="reset-button" disabled={saving} onClick={() => void endAssignment(assignment)}>{t("users.endAssignment")}</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <form className="toolbar" onSubmit={assignTechnician}>
                      <select className="select" value={assignUserId} onChange={(event) => setAssignUserId(event.target.value)} required>
                        <option value="">{t("users.selectTechnician")}</option>
                        {eligibleTechnicians.map((item) => <option key={item.user_id} value={item.user_id}>{item.user_full_name}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" disabled={saving || !assignUserId}>{t("users.assign")}</button>
                    </form>
                  </section>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="card">
          <div className="card-head">
            <div><span className="eyebrow">{t("users.audit")}</span><h3>{t("users.auditHistory")}</h3></div>
            <span className="toolbar-count">{audit.length}</span>
          </div>
          {audit.length === 0 ? <EmptyState title={t("users.noAudit")} /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>{t("users.when")}</th><th>{t("users.actor")}</th><th>{t("users.action")}</th><th>{t("users.target")}</th><th>{t("users.details")}</th></tr></thead>
                <tbody>
                  {audit.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateTime(event.created_at)}</td>
                      <td><strong>{event.actor_full_name}</strong><div className="subtext">{event.actor_email}</div></td>
                      <td>{event.action}</td>
                      <td>{event.target_type}{event.target_id ? ` #${event.target_id}` : ""}</td>
                      <td><code className="audit-metadata">{JSON.stringify(event.event_metadata)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {resetResult ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setResetResult(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">{t("users.create")}</span>
            <h2 id="reset-title">{t("password.resetTitle")}</h2>
            <p>{t("password.resetHint")}</p>
            <p><strong>{resetResult.user.full_name}</strong> · {resetResult.user.email}</p>
            <div className="temp-password">
              <code>{resetResult.temporary_password}</code>
              <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(resetResult.temporary_password)}>{t("password.copy")}</button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setResetResult(null)}>{t("password.close")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
