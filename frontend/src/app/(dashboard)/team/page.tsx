"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiClient } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/auth";
import { notify } from "../../../lib/notifications";

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  customRole: { id: string; name: string };
  permissions: string[];
  isActive: boolean;
  isOnline: boolean;
  isCliAdmin: boolean;
  reportsToId: string | null;
  reportsTo: { id: string; fullName: string } | null;
  eligibleSupervisors: {
    id: string;
    fullName: string;
    roleName: string;
  }[];
  lastActiveAt: string | null;
  _count: { leads: number };
};

type TeamPageData = {
  items: TeamUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  roleFilters: { id: string; name: string }[];
};

type CustomRole = {
  id: string;
  name: string;
  permissions: string[];
  subordinateRoleIds: string[];
  assignable: boolean;
  manageable: boolean;
};

const ROLE_PERMISSION_OPTIONS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "leads_view", label: "View leads" },
  { value: "leads_create", label: "Create leads" },
  { value: "leads_edit", label: "Edit leads" },
  { value: "leads_delete", label: "Delete leads" },
  { value: "leads_assign", label: "Assign leads to users" },
  { value: "pipeline", label: "Sales Pipeline" },
  {
    value: "activities",
    label: "Activities, calls, meetings, proposals, and negotiations",
  },
  { value: "customers", label: "Customers" },
  { value: "reports", label: "Reports" },
  { value: "manage_team", label: "My Team (view subordinate members)" },
] as const;
const PAGE_SIZE = 10;
const ONLINE_WINDOW_MS = 2 * 60_000;
const EXACT_TIME_AFTER_MS = 20 * 60 * 60_000;

function PasswordVisibilityToggle({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      aria-label={`${visible ? "Hide" : "Show"} ${label}`}
      className="password-visibility-toggle"
      onClick={onToggle}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        viewBox="0 0 24 24"
        width="18"
      >
        {visible ? (
          <>
            <path
              d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
          </>
        ) : (
          <>
            <path
              d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </button>
  );
}

function formatPresence(
  lastActiveAt: string | null,
  isOnline: boolean,
  now: number,
) {
  if (!lastActiveAt) return "Never";
  const lastActive = new Date(lastActiveAt);
  if (Number.isNaN(lastActive.getTime())) return "Never";
  const elapsed = Math.max(0, now - lastActive.getTime());
  if (isOnline && elapsed <= ONLINE_WINDOW_MS) return "Online";
  if (elapsed > EXACT_TIME_AFTER_MS) {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(lastActive);
  }

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes === 0) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
}

export default function TeamPage() {
  const [items, setItems] = useState<TeamUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [customRoleId, setCustomRoleId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCustomRoleId, setEditCustomRoleId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [updatingSupervisorId, setUpdatingSupervisorId] = useState<string | null>(
    null,
  );
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [roleFilters, setRoleFilters] = useState<
    TeamPageData["roleFilters"]
  >([]);
  const [showCustomRoles, setShowCustomRoles] = useState(false);
  const [showCreateRoleForm, setShowCreateRoleForm] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");
  const [customRolePermissions, setCustomRolePermissions] = useState<string[]>([]);
  const [customRoleSubordinateRoleIds, setCustomRoleSubordinateRoleIds] =
    useState<string[]>([]);
  const [savingRole, setSavingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);

  const load = useCallback(async (admin: boolean) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search.trim()) params.set("search", search.trim());
    if (roleFilter) params.set("roleId", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    const result = await apiClient<TeamPageData>(`/users?${params}`);
    const roles = admin
      ? await apiClient<CustomRole[]>("/users/roles")
      : [];
    setItems(result.items);
    setTotal(result.total);
    setTotalPages(result.totalPages);
    setRoleFilters(result.roleFilters);
    setCustomRoles(roles);
  }, [page, roleFilter, search, statusFilter]);

  const refresh = useCallback(async () => {
    try {
      await load(isAdmin);
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to refresh team.",
        "error",
      );
    }
  }, [isAdmin, load]);

  useEffect(() => {
    if (!getAccessToken()) {
      window.location.replace("/login");
      return;
    }
    let current = true;
    setLoading(true);
    apiClient<{ id: string; isCliAdmin: boolean }>("/admin/profile")
      .then((profile) => {
        setIsAdmin(profile.isCliAdmin);
        return load(profile.isCliAdmin);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (reason instanceof ApiError && reason.status === 403) {
          window.location.replace("/dashboard");
          return;
        }
        if (current)
          notify(
            reason instanceof Error
              ? reason.message
              : "Unable to verify team-management access.",
            "error",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load]);

  useEffect(() => {
    const refreshPresence = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshPresence, 60_000);
    document.addEventListener("visibilitychange", refreshPresence);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshPresence);
    };
  }, [refresh]);

  async function updateStatus(user: TeamUser) {
    try {
      await apiClient(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await refresh();
      notify(`${user.fullName}'s account was updated.`);
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to update account.",
        "error",
      );
    }
  }

  async function updateSupervisor(user: TeamUser, supervisorId: string) {
    setUpdatingSupervisorId(user.id);
    try {
      await apiClient(`/users/${user.id}/supervisor`, {
        method: "PATCH",
        body: JSON.stringify({ supervisorId: supervisorId || null }),
      });
      await refresh();
      notify(`${user.fullName}'s assigned user was updated.`);
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to update assigned user.",
        "error",
      );
    } finally {
      setUpdatingSupervisorId(null);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customRoleId) {
      notify("Choose a custom role for the team account.", "error");
      return;
    }
    setCreating(true);
    try {
      await apiClient<TeamUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          password,
          customRoleId,
        }),
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setShowCreatePassword(false);
      setCustomRoleId("");
      setShowCreateForm(false);
      setPage(1);
      await refresh();
      notify("Team account created successfully.");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to create account.",
        "error",
      );
    } finally {
      setCreating(false);
    }
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setPassword("");
    setShowCreatePassword(false);
    setCustomRoleId("");
  }

  function openEdit(user: TeamUser) {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    setEditCustomRoleId(user.customRole.id);
    setEditPassword("");
    setShowEditPassword(false);
  }

  function closeEditForm() {
    setEditingUser(null);
    setEditPassword("");
    setShowEditPassword(false);
    setEditCustomRoleId("");
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await apiClient<TeamUser>(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: editFullName.trim(),
          email: editEmail.trim(),
          customRoleId: editCustomRoleId,
        }),
      });
      closeEditForm();
      await refresh();
      notify("Team account details updated.");
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to update team account.",
        "error",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingPassword(true);
    try {
      await apiClient(`/users/${editingUser.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: editPassword }),
      });
      closeEditForm();
      notify("Team account password updated successfully.");
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to update team account password.",
        "error",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function createCustomRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRole(true);
    const body = {
      name: customRoleName,
      permissions: customRolePermissions,
      subordinateRoleIds: customRoleSubordinateRoleIds,
    };
    try {
      if (editingRoleId) {
        await apiClient<CustomRole>(`/users/roles/${editingRoleId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiClient<CustomRole>("/users/roles", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setCustomRoleName("");
      setCustomRolePermissions([]);
      setCustomRoleSubordinateRoleIds([]);
      setEditingRoleId(null);
      setShowCreateRoleForm(false);
      await refresh();
      notify(editingRoleId ? "Custom role updated." : "Custom role created.");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to create role.",
        "error",
      );
    } finally {
      setSavingRole(false);
    }
  }

  async function deleteCustomRole(role: CustomRole) {
    if (!window.confirm(`Delete the "${role.name}" custom role?`)) return;
    setDeletingRoleId(role.id);
    try {
      await apiClient(`/users/roles/${role.id}`, { method: "DELETE" });
      await refresh();
      notify("Custom role deleted.");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to delete role.",
        "error",
      );
    } finally {
      setDeletingRoleId(null);
    }
  }

  async function deleteUser(user: TeamUser) {
    const detail =
      user._count.leads > 0
        ? ` This user owns ${user._count.leads} leads, so those leads must be reassigned first.`
        : "";
    if (
      !window.confirm(
        `Delete ${user.fullName}'s account?${detail} This action cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await apiClient(`/users/${user.id}`, { method: "DELETE" });
      notify(`${user.fullName}'s account was deleted.`);
      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await refresh();
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to delete account.",
        "error",
      );
    }
  }

  return (
    <main className="lead-workspace admin-workspace admin-team-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{isAdmin ? "ADMINISTRATION" : "TEAM"}</p>
          <h1>{isAdmin ? "Manage team" : "My Team"}</h1>
          <p className="subtitle">
            {isAdmin
              ? "Create team accounts and custom roles, and manage account access."
              : "View team members in your subordinate role hierarchy."}
          </p>
        </div>
        {isAdmin && (
          <div className="workspace-actions">
            <button
              className="primary"
              type="button"
              onClick={() => {
                setCustomRoleId("");
                setPassword("");
                setShowCreatePassword(false);
                setShowCreateForm(true);
              }}
            >
              + Create team account
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setShowCustomRoles(true)}
            >
              Custom roles
            </button>
          </div>
        )}
      </header>

      <div
        className={`admin-team-controls${roleFilters.length > 1 ? " has-role-filters" : ""}`}
      >
        <label className="admin-team-search-field">
          <span>Search</span>
          <span className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search team"
              placeholder="Search name or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </span>
        </label>
        {roleFilters.length > 1 && (
          <label className="admin-team-filter">
            <span>Role</span>
            <select
              aria-label="Filter team by role"
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roleFilters.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="admin-team-filter">
          <span>Status</span>
          <select
            aria-label="Filter team by status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      <section className="panel admin-team">
        <div className="lead-table-wrap admin-team-table-wrap">
          <table className="lead-table admin-team-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Custom role</th>
                {isAdmin && <th>Assigned user</th>}
                <th>Assigned leads</th>
                {isAdmin && <th>Permissions</th>}
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.fullName}</strong>
                    <small className="admin-team-email">{user.email}</small>
                  </td>
                  <td>
                    <span className="stage-pill">
                      {user.customRole.name}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      {user.isCliAdmin ? (
                        <span className="stage-pill">System account</span>
                      ) : (
                        <select
                          aria-label={`Assign supervisor for ${user.fullName}`}
                          className="team-supervisor-select"
                          disabled={updatingSupervisorId === user.id}
                          value={user.reportsToId ?? ""}
                          onChange={(event) =>
                            void updateSupervisor(user, event.target.value)
                          }
                        >
                          <option value="">No assigned user</option>
                          {user.eligibleSupervisors.map((supervisor) => (
                            <option key={supervisor.id} value={supervisor.id}>
                              {supervisor.fullName} · {supervisor.roleName}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  )}
                  <td>
                    {user._count.leads}
                  </td>
                  {isAdmin && <td>{user.permissions.length} granted</td>}
                  <td>
                    <span
                      className={`stage-pill${user.isActive ? "" : " inactive"}`}
                      title={
                        user.lastActiveAt
                          ? new Intl.DateTimeFormat("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(user.lastActiveAt))
                          : undefined
                      }
                    >
                      {user.isActive
                        ? formatPresence(user.lastActiveAt, user.isOnline, now)
                        : "Inactive"}
                    </span>
                  </td>
                  {isAdmin && <td>
                    <div className="admin-team-actions">
                      {user.isCliAdmin ? (
                        <span className="stage-pill" title="Managed from the CLI">
                          CLI protected
                        </span>
                      ) : (
                        <>
                          <button
                            className="user-toggle"
                            onClick={() => openEdit(user)}
                          >
                            Edit
                          </button>
                          <button
                            className="user-toggle"
                            onClick={() => void updateStatus(user)}
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="user-delete"
                            onClick={() => void deleteUser(user)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && items.length === 0 && (
            <p className="empty-list">No team accounts match this search.</p>
          )}
          {loading && (
            <p className="empty-list" role="status">
              Loading team accounts...
            </p>
          )}
        </div>
        {!loading && (
          <nav className="pagination" aria-label="Team pages">
            <span>
              {total === 0
                ? "0–0 of 0"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </span>
            {totalPages > 0 && (
              <div className="pagination-controls">
                <button
                  className="secondary-action"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </button>
                <strong>
                  Page {page} of {totalPages}
                </strong>
                <button
                  className="secondary-action"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </nav>
        )}
      </section>
      {isAdmin && showCustomRoles && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowCustomRoles(false);
              setShowCreateRoleForm(false);
            }
          }}
        >
          <section
            className="lead-modal admin-custom-roles-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-roles-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CUSTOM ACCESS</p>
                <h2 id="custom-roles-title">Custom roles</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => {
                  setShowCustomRoles(false);
                  setShowCreateRoleForm(false);
                  setEditingRoleId(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <section className="panel admin-custom-roles">
              {!showCreateRoleForm && (
                <div className="panel-head admin-custom-roles-list-head">
                  <button
                    className="primary"
                    type="button"
                    onClick={() => {
                      setCustomRoleName("");
                      setCustomRolePermissions([]);
                      setCustomRoleSubordinateRoleIds([]);
                      setEditingRoleId(null);
                      setShowCreateRoleForm(true);
                    }}
                  >
                    + Create custom role
                  </button>
                </div>
              )}
              {showCreateRoleForm ? (
                <form className="lead-form" onSubmit={createCustomRole}>
                  <h3 className="form-wide">
                    {editingRoleId ? "Edit custom role" : "Create custom role"}
                  </h3>
                  <label className="form-wide">
                    Role name *
                    <input
                      autoFocus
                      maxLength={60}
                      minLength={2}
                      required
                      value={customRoleName}
                      onChange={(event) => setCustomRoleName(event.target.value)}
                    />
                  </label>
                  <fieldset className="form-wide role-permissions-fieldset">
                    <legend>Individual permissions</legend>
                    <div className="role-permissions-list">
                      {ROLE_PERMISSION_OPTIONS.map((permission) => (
                        <label key={permission.value}>
                          <input
                            type="checkbox"
                            checked={customRolePermissions.includes(
                              permission.value,
                            )}
                            onChange={(event) =>
                              setCustomRolePermissions((current) =>
                                event.target.checked
                                  ? [...current, permission.value]
                                  : current.filter(
                                      (value) => value !== permission.value,
                                    ),
                              )
                            }
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="form-wide role-permissions-fieldset">
                    <legend>
                      Role Hierarchy: Select the roles this role can manage and monitor.
                    </legend>
                    <div className="role-permissions-list">
                      {customRoles
                        .filter((role) => role.id !== editingRoleId)
                        .map((role) => (
                          <label key={role.id}>
                            <input
                              type="checkbox"
                              checked={customRoleSubordinateRoleIds.includes(
                                role.id,
                              )}
                              onChange={(event) =>
                                setCustomRoleSubordinateRoleIds((current) =>
                                  event.target.checked
                                    ? [...current, role.id]
                                    : current.filter((id) => id !== role.id),
                                )
                              }
                            />
                            {role.name}
                          </label>
                        ))}
                    </div>
                  </fieldset>
                  <div className="form-footer">
                    <button
                      className="secondary-action"
                      disabled={savingRole}
                      onClick={() => {
                        setShowCreateRoleForm(false);
                        setEditingRoleId(null);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button className="primary" disabled={savingRole}>
                      {savingRole
                        ? "Saving..."
                        : editingRoleId
                          ? "Save role"
                          : "Create role"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="lead-table-wrap admin-team-table-wrap">
                  <table className="lead-table admin-team-table">
                    <thead>
                      <tr>
                        <th>Role label</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customRoles.map((customRole) => (
                        <tr key={customRole.id}>
                          <td>
                            <strong>{customRole.name}</strong>
                            <small className="admin-team-email">
                              {customRole.permissions.length} permissions
                              {customRole.subordinateRoleIds.length
                                ? ` · Manages ${customRoles
                                    .filter((role) =>
                                      customRole.subordinateRoleIds.includes(
                                        role.id,
                                      ),
                                    )
                                    .map((role) => role.name)
                                    .join(", ")}`
                                : " · No subordinate roles"}
                            </small>
                          </td>
                          <td>
                            <div className="admin-team-actions">
                              {customRole.manageable && (
                                <button
                                  className="user-toggle"
                                  type="button"
                                  onClick={() => {
                                    setEditingRoleId(customRole.id);
                                    setCustomRoleName(customRole.name);
                                    setCustomRolePermissions(
                                      customRole.permissions,
                                    );
                                    setCustomRoleSubordinateRoleIds(
                                      customRole.subordinateRoleIds,
                                    );
                                    setShowCreateRoleForm(true);
                                  }}
                                >
                                  Edit
                                </button>
                              )}
                              {customRole.manageable && (
                                <button
                                  className="user-delete"
                                  disabled={deletingRoleId === customRole.id}
                                  type="button"
                                  onClick={() => void deleteCustomRole(customRole)}
                                >
                                  {deletingRoleId === customRole.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!loading && customRoles.length === 0 && (
                    <p className="empty-list">No custom roles created yet.</p>
                  )}
                </div>
              )}
            </section>
          </section>
        </div>
      )}
      {isAdmin && showCreateForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateForm();
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-team-user-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">TEAM ACCOUNT</p>
                <h2 id="new-team-user-title">Create team account</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={closeCreateForm}
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={createUser}>
              <label className="form-wide">
                Full name *
                <input
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Email *
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="form-wide password-field-label">
                <span>Temporary password *</span>
                <div className="password-input-wrap">
                  <input
                    required
                    type={showCreatePassword ? "text" : "password"}
                    minLength={10}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <PasswordVisibilityToggle
                    visible={showCreatePassword}
                    onToggle={() =>
                      setShowCreatePassword((visible) => !visible)
                    }
                    label="temporary password"
                  />
                </div>
              </label>
              <label className="form-wide">
                Custom role selection *
                <select
                  required
                  value={customRoleId}
                  onChange={(event) => setCustomRoleId(event.target.value)}
                >
                  <option value="" disabled>
                    Choose a custom role
                  </option>
                  {customRoles
                    .filter((role) => role.assignable)
                    .map((customRole) => (
                    <option key={customRole.id} value={customRole.id}>
                      {customRole.name}
                    </option>
                    ))}
                </select>
              </label>
              <div className="form-footer">
                <button className="primary" disabled={creating || !customRoleId}>
                  {creating ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {isAdmin && editingUser && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditForm();
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-team-user-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">TEAM ACCOUNT</p>
                <h2 id="edit-team-user-title">Edit team account</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={closeEditForm}
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={updateUser}>
              <label className="form-wide">
                Full name *
                <input
                  required
                  value={editFullName}
                  onChange={(event) => setEditFullName(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Email *
                <input
                  required
                  type="email"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Custom role label
                <select
                  required
                  value={editCustomRoleId}
                  onChange={(event) => setEditCustomRoleId(event.target.value)}
                >
                  {customRoles
                    .filter((role) => role.assignable)
                    .map((customRole) => (
                    <option key={customRole.id} value={customRole.id}>
                      {customRole.name}
                    </option>
                    ))}
                </select>
              </label>
              <div className="form-footer">
                <p>The selected role supplies this account’s permissions.</p>
                <button className="primary" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
            <form
              className="lead-form team-password-form"
              onSubmit={updatePassword}
            >
              <label className="form-wide password-field-label">
                <span>Set a new password *</span>
                <div className="password-input-wrap">
                  <input
                    required
                    type={showEditPassword ? "text" : "password"}
                    minLength={10}
                    value={editPassword}
                    onChange={(event) => setEditPassword(event.target.value)}
                  />
                  <PasswordVisibilityToggle
                    visible={showEditPassword}
                    onToggle={() =>
                      setShowEditPassword((visible) => !visible)
                    }
                    label="new password"
                  />
                </div>
              </label>
              <div className="form-footer">
                <p>Use at least 10 characters. Share the new password securely.</p>
                <button
                  className="primary"
                  disabled={savingPassword || editPassword.length < 10}
                >
                  {savingPassword ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
