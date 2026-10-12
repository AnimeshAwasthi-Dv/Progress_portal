import React, { Suspense, useEffect, useRef, useState } from "react";
import { getSessionUser, loadWorkspaceData, type User, type WorkspaceData } from "./api";
import Login from "./Login";

const Workspace = React.lazy(() => import("./App"));

export default function Entry() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const authenticated = useRef(false);
  const initialData = useRef<WorkspaceData>();

  const acceptUser = (account: User | null) => {
    if (account) initialData.current = loadWorkspaceData();
    setUser(account);
  };

  useEffect(() => {
    let active = true;
    getSessionUser()
      .then((account) => { if (active && !authenticated.current) acceptUser(account); })
      .catch(() => { /* An anonymous visitor can sign in immediately. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  if (!user) return <Login checking={checking} onAuthenticated={(account) => {
    authenticated.current = true;
    acceptUser(account);
  }} />;

  return <Suspense fallback={<div role="status" className="min-h-screen grid place-items-center">Loading workspace…</div>}>
    <Workspace initialUser={user} initialData={initialData.current} />
  </Suspense>;
}
