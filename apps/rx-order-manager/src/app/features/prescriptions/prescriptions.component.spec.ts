import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { MedicationService } from '../../services/medication.service';
import { PrescriptionService } from '../../services/prescription.service';
import { CalendarService } from '../../core/calendar.service';
import type { Medication } from '../../models/medication.model';
import type { Prescription } from '../../models/prescription.model';
import { PrescriptionsComponent } from './prescriptions.component';

describe('PrescriptionsComponent', () => {
  const medication: Medication = {
    id: 'med-1',
    name: 'Test Med',
    dose: '10mg',
    category: 'General',
    intervalDays: 30,
  };

  const savedPrescription: Prescription = {
    medicationId: 'med-1',
    pharmacyName: 'Real Pharmacy',
    pharmacyPhone: '555-0100',
    pharmacyAddress: '1 Main St',
    prescriberName: 'Dr. Real',
    prescriberPhone: '555-0200',
    howToOrder: 'Call ahead',
    lastOrderDate: '2026-08-01',
    nextOrderDate: '2026-09-01',
    scheduleNotes: '',
    updatedAt: new Date('2026-08-01'),
  };

  let prescriptions$: BehaviorSubject<Prescription[]>;

  function setup() {
    prescriptions$ = new BehaviorSubject<Prescription[]>([]);
    TestBed.configureTestingModule({
      imports: [PrescriptionsComponent],
      providers: [
        {
          provide: MedicationService,
          useValue: { all$: new BehaviorSubject<Medication[]>([medication]) },
        },
        { provide: PrescriptionService, useValue: { all$: prescriptions$ } },
        { provide: CalendarService, useValue: { scheduleReminder: jest.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PrescriptionsComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('reconciles an empty draft once the delayed prescriptions snapshot arrives', async () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    // Selection happens before the Firestore listener's first emission
    // (prescriptions$ is still []), so this necessarily starts empty.
    component.select('med-1');
    expect(component.draft?.pharmacyName).toBe('');

    // The real snapshot lands after selection.
    prescriptions$.next([savedPrescription]);
    await fixture.whenStable();

    expect(component.draft?.pharmacyName).toBe('Real Pharmacy');
    expect(component.draft?.nextOrderDate).toBe('2026-09-01');
  });

  it('does not clobber an in-progress edit when a later snapshot arrives', async () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    component.select('med-1');
    const draftAfterSelect = component.draft;
    if (draftAfterSelect === null) {
      throw new Error('expected select() to set a draft');
    }
    component.draft = { ...draftAfterSelect, pharmacyName: 'User typed this' };

    prescriptions$.next([savedPrescription]);
    await fixture.whenStable();

    expect(component.draft?.pharmacyName).toBe('User typed this');
  });

  it('leaves the draft alone once it already matches the loaded data', async () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    prescriptions$.next([savedPrescription]);
    await fixture.whenStable();
    component.select('med-1');
    const draftAfterSelect = component.draft;

    prescriptions$.next([savedPrescription]);
    await fixture.whenStable();

    expect(component.draft).toBe(draftAfterSelect);
  });
});
