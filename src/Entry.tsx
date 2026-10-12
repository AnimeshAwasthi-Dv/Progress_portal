import React, { Suspense, useEffect, useRef, useState } from "react";
import { getSessionUser, type User } from "./api";
import Login from "./Login";

const Workspace = React.lazy(() => import("./App"));

export default function Entry() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const authenticated = useRef(false);

  useEffect(() => {
    let active = true;
    getSessionUser()
      .then((account) => { if (active && !authenticated.current) setUser(account); })
      .catch(() => { /* An anonymous visitor can sign in immediately. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  if (!user) return <Login checking={checking} onAuthenticated={(account) => {
    authenticated.current = true;
    setUser(account);
  }} />;

  return <Suspense fallback={<div role="status" className="min-h-screen grid place-items-center">Loading workspace…</div>}>
    <Workspace initialUser={user} />
  </Suspense>;
}
