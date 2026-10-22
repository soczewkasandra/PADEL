import {describe,it,expect} from 'vitest';
import {seed,reserve,occupied,type Data} from './model';
const fixture=():Data=>({slots:[{id:'slot',date:'2099-10-22',time:'10:00',blocked:false}],bookings:[]});
describe('Rezerwacje treningów',()=>{
 it('tworzy zgłoszenie oczekujące i zajmuje termin',()=>{const d=reserve(fixture(),'slot',' Alex ','Demo','000 000 000');expect(d.bookings[0]).toMatchObject({first:'Alex',status:'pending'});expect(occupied(d,'slot')).toBe(true);});
 it('nie pozwala zarezerwować ponownie tego samego terminu',()=>{const d=reserve(fixture(),'slot','Alex','Demo','000000000');expect(()=>reserve(d,'slot','Inna','Osoba','000000000')).toThrow('nie jest już dostępny');});
 it('odrzucenie zwalnia termin, zatwierdzenie zachowuje zajętość',()=>{const d=reserve(fixture(),'slot','Alex','Demo','000000000');d.bookings[0].status='approved';expect(occupied(d,'slot')).toBe(true);d.bookings[0].status='rejected';expect(occupied(d,'slot')).toBe(false);expect(reserve(d,'slot','Inna','Osoba','000000000').bookings).toHaveLength(2);});
 it('odmawia rezerwacji zablokowanego i minionego terminu',()=>{const d=fixture();d.slots[0].blocked=true;expect(()=>reserve(d,'slot','A','B','000000000')).toThrow();d.slots[0].blocked=false;d.slots[0].date='2000-01-01';expect(()=>reserve(d,'slot','A','B','000000000')).toThrow();});
 it('sprawdza dane kontaktowe',()=>{for(const args of [['','Demo','000000000'],['Alex',' ','000000000'],['Alex','Demo','abc']])expect(()=>reserve(fixture(),'slot',...args as [string,string,string])).toThrow();});
 it('generuje unikalne godziny i fikcyjne dane',()=>{const d=seed();expect(d.slots.length).toBe(112);expect(new Set(d.slots.map(s=>s.id)).size).toBe(112);expect(d.bookings[0].phone).toBe('000 000 000');});
});
