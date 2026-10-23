// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const auth = vi.hoisted(() => ({ updateUser: vi.fn(), signOut: vi.fn() }));
vi.mock('./api', () => ({ supabase: { auth } }));
import { Recovery } from './Recovery';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('nie pokazuje formularza bez prawidłowej sesji resetowania', async () => {
  render(<Recovery initialize={async () => false}/>);
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByLabelText('Nowe hasło')).toBeNull();
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it('sprawdza zgodność haseł przed wysłaniem', async () => {
  render(<Recovery initialize={async () => true}/>);
  fireEvent.change(await screen.findByLabelText('Nowe hasło'), {target:{value:'fictional-test-password'}});
  fireEvent.change(screen.getByLabelText('Powtórz nowe hasło'), {target:{value:'another-test-password'}});
  fireEvent.submit(screen.getByRole('button',{name:'Zapisz nowe hasło'}).closest('form')!);
  expect(await screen.findByText('Hasła muszą być identyczne.')).toBeTruthy();
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it('zmienia hasło i kończy lokalną sesję', async () => {
  auth.updateUser.mockResolvedValue({error:null}); auth.signOut.mockResolvedValue({error:null});
  render(<Recovery initialize={async () => true}/>);
  fireEvent.change(await screen.findByLabelText('Nowe hasło'), {target:{value:'fictional-test-password'}});
  fireEvent.change(screen.getByLabelText('Powtórz nowe hasło'), {target:{value:'fictional-test-password'}});
  fireEvent.submit(screen.getByRole('button',{name:'Zapisz nowe hasło'}).closest('form')!);
  expect(await screen.findByText(/Hasło zostało zmienione/)).toBeTruthy();
  expect(auth.updateUser).toHaveBeenCalledWith({password:'fictional-test-password'});
  expect(auth.signOut).toHaveBeenCalledWith({scope:'local'});
});
it('nie deklaruje sukcesu, gdy Supabase odrzuci zmianę', async () => {
  auth.updateUser.mockResolvedValue({error:{message:'test'}});
  render(<Recovery initialize={async () => true}/>);
  fireEvent.change(await screen.findByLabelText('Nowe hasło'), {target:{value:'fictional-test-password'}});
  fireEvent.change(screen.getByLabelText('Powtórz nowe hasło'), {target:{value:'fictional-test-password'}});
  fireEvent.submit(screen.getByRole('button',{name:'Zapisz nowe hasło'}).closest('form')!);
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(auth.signOut).not.toHaveBeenCalled();
});
