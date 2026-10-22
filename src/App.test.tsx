// @vitest-environment jsdom
import React from 'react';
import {it,expect} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {App} from './App';
import {dateKey} from './model';
it('pozwala klientowi wysłać zgłoszenie, a trenerowi je zatwierdzić i dodać godzinę',()=>{
 localStorage.clear();render(<App/>);
 const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
 const label=tomorrow.toLocaleDateString('pl-PL',{day:'numeric',month:'long',year:'numeric'});
 fireEvent.click(screen.getByRole('button',{name:label}));
 fireEvent.click(screen.getByRole('button',{name:'09:00'}));
 const dialog=screen.getByRole('dialog');
 fireEvent.change(within(dialog).getByLabelText('Imię'),{target:{value:'Testowa'}});
 fireEvent.change(within(dialog).getByLabelText('Nazwisko'),{target:{value:'Osoba'}});
 fireEvent.change(within(dialog).getByLabelText('Numer telefonu'),{target:{value:'000000000'}});
 fireEvent.submit(within(dialog).getByRole('button',{name:/Wyślij zgłoszenie/}).closest('form')!);
 expect(within(dialog).getByText('Oczekuje na potwierdzenie')).toBeTruthy();
 fireEvent.click(within(dialog).getByRole('button',{name:/Wróć do kalendarza/}));
 expect(screen.queryByRole('button',{name:'09:00'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Panel trenera/}));
 fireEvent.click(screen.getByRole('button',{name:'Zatwierdź Testowa'}));
 expect(JSON.parse(localStorage.getItem('padel-krystian-demo-v1')!).bookings.find((b:{first:string})=>b.first==='Testowa').status).toBe('approved');
 const timeInput=screen.getByLabelText('Nowa godzina');fireEvent.change(timeInput,{target:{value:'13:00'}});
 fireEvent.submit(screen.getByRole('button',{name:/Dodaj termin/}).closest('form')!);
 expect(screen.getByRole('button',{name:'Zablokuj 13:00'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Zablokuj 13:00'}));
 expect(JSON.parse(localStorage.getItem('padel-krystian-demo-v1')!).slots.find((s:{id:string})=>s.id===`${dateKey(tomorrow)}-13:00`).blocked).toBe(true);
});
