export default function AccessRequiredPage() {
  return (
    <main className="lead-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">CRM ACCESS</p>
          <h1>No workspace access configured</h1>
          <p className="subtitle">
            Your account is active, but its role does not currently have access
            to any CRM modules. Ask an administrator to configure your role.
          </p>
        </div>
      </header>
    </main>
  );
}
