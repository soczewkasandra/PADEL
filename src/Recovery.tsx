import { useEffect, useState } from 'react';
import { supabase } from './api';
import './style.css';

export function Recovery({ initialize }: { initialize: () => Promise<boolean> }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    initialize().then(ok => {
      if (!active) return;
      if (ok) setReady(true);
      else setError('Link jest nieprawidłowy lub wygasł. Wyślij nowy link resetowania z panelu Supabase i otwórz go na tym Macu.');
    }).catch(() => {
      if (active) setError('Nie udało się zweryfikować linku. Sprawdź połączenie i poproś o nowy link.');
    });
    return () => { active = false; };
  }, [initialize]);
  return <main><section className="login card"><div className="eyebrow">PADEL WITH KRYSTIAN</div><h1>Ustaw nowe hasło</h1>
    {done ? <><p>Hasło zostało zmienione. Zaloguj się nowym hasłem w panelu trenera.</p><a className="primary" href={location.pathname}>Wróć do aplikacji</a></> : <>
      {!ready && !error && <p>Sprawdzanie linku resetującego…</p>}
      {ready && <form onSubmit={async e => {
        e.preventDefault(); if (busy || !supabase) return;
        const form = e.currentTarget;
        const fields = new FormData(form);
        const password = String(fields.get('password'));
        if (password.length < 12) { setError('Użyj hasła zawierającego co najmniej 12 znaków.'); return; }
        if (password !== fields.get('repeat')) { setError('Hasła muszą być identyczne.'); return; }
        setBusy(true); setError('');
        try {
          const result = await supabase.auth.updateUser({ password });
          if (result.error) { setError('Nie udało się zmienić hasła. Wybierz inne, silne hasło zgodne z wymaganiami projektu lub poproś o nowy link.'); return; }
          form.reset();
          await supabase.auth.signOut({ scope: 'local' });
          setDone(true);
        } catch { setError('Nie udało się połączyć z Supabase. Sprawdź połączenie i spróbuj ponownie.'); }
        finally { setBusy(false); }
      }}>
        <label>Nowe hasło<input name="password" type="password" autoComplete="new-password" minLength={12} required disabled={busy}/></label>
        <label>Powtórz nowe hasło<input name="repeat" type="password" autoComplete="new-password" minLength={12} required disabled={busy}/></label>
        <p>Co najmniej 12 znaków. Użyj unikalnego hasła, najlepiej wygenerowanego w menedżerze haseł.</p>
        <button className="primary" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz nowe hasło'}</button>
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
    </>}
  </section></main>;
}
