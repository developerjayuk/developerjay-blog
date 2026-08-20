"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 w-full max-w-sm">
      <input type="hidden" name="redirect" value={redirectTo} />
      <label htmlFor="email" className="text-sm">
        Email
      </label>
      <input
        type="email"
        name="email"
        id="email"
        placeholder="Email"
        required
        className="rounded border px-3 py-2"
      />
      <label htmlFor="password" className="text-sm">
        Password
      </label>
      <input
        type="password"
        name="password"
        id="password"
        placeholder="Password"
        required
        className="rounded border px-3 py-2"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded border px-3 py-2 text-sm">
        {pending ? "Signing in…" : "Log in"}
      </button>
    </form>
  );
}
