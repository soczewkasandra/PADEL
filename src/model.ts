export type Slot = { id: string; date: string; time: string; blocked: boolean };
export type Booking = { id: string; slotId: string; first: string; last: string; phone: string; status: 'pending' | 'approved' | 'rejected' };
export type Data = { slots: Slot[]; bookings: Booking[] };
export const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function seed(): Data {
 const slots: Slot[]=[];
 for(let day=0;day<28;day++) { const d=new Date(); d.setDate(d.getDate()+day); for(const time of ['09:00','11:00','16:00','18:00']) slots.push({id:`${dateKey(d)}-${time}`,date:dateKey(d),time,blocked:day%5===3&&time==='11:00'}); }
 return {slots,bookings:[{id:'demo',slotId:slots[6].id,first:'Alex',last:'Przykładowy',phone:'000 000 000',status:'pending'}]};
}
export const occupied = (data:Data,id:string) => data.bookings.some(b=>b.slotId===id&&b.status!=='rejected');
export const future = (s:Slot) => new Date(`${s.date}T${s.time}`).getTime()>Date.now();
export function reserve(data:Data,slotId:string,first:string,last:string,phone:string):Data {
 const s=data.slots.find(s=>s.id===slotId);
 if(!s||s.blocked||occupied(data,slotId)||!future(s)) throw new Error('Ten termin nie jest już dostępny. Wybierz inny.');
 if(!first.trim()||!last.trim()||!/^\+?[\d\s()-]{9,20}$/.test(phone)||phone.replace(/\D/g,'').length<9) throw new Error('Podaj imię, nazwisko i poprawny numer telefonu.');
 return {...data,bookings:[...data.bookings,{id:crypto.randomUUID(),slotId,first:first.trim(),last:last.trim(),phone:phone.trim(),status:'pending'}]};
}
