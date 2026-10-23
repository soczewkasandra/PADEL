import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Recovery } from './Recovery';
import { supabase } from './api';

// Supabase dashboard recovery emails use the implicit flow. Keep credentials
// in memory, remove the fragment immediately and never log or persist them.
const fragment = new URLSearchParams(location.hash.slice(1));
const recovery = fragment.get('type') === 'recovery' || fragment.get('error_code') === 'otp_expired';
let initialize: () => Promise<boolean> = async () => false;
if (recovery) {
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  history.replaceState(null, '', location.pathname + location.search);
  let pending: Promise<boolean> | undefined;
  initialize = () => {
    if (!pending) pending = !supabase || !access_token || !refresh_token
      ? Promise.resolve(false)
      : supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => !error && !!data.session);
    return pending;
  };
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {recovery ? <Recovery initialize={initialize}/> : <App />}
  </React.StrictMode>,
);
