import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ProjectRecord } from './data/hikari-database.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should open the summary view', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.view).toEqual('Resumen');
  });

  it('should render the internal control dashboard', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Resumen');
    expect(compiled.textContent).toContain('Inventario');
    expect(compiled.textContent).toContain('Flujo de caja');
  });

  it('should calculate current stock from initial stock, entries, and exits', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(app.stock({ id: 1, code: 'MAT-1', name: 'Lámina', unit: 'kg', initialStock: 20, entries: 4, exits: 9, unitCost: 10, minimumStock: 2 })).toBe(15);
  });

  it('should format amounts in Paraguayan guaranies', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    expect(app.formatCurrency(4600)).toBe('Gs. 4.600');
  });

  it('should filter projects by start month and text together', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const project = (projectCode: string, client: string, startDate: string): ProjectRecord => ({
      projectCode,
      client,
      startDate,
      deliveryDate: startDate,
      materials: [],
      hours: 1,
      laborCost: 0,
      sellingPrice: 0,
      status: 'En curso'
    });
    app.projects = [
      project('HK-1001', 'Nikko Works', '2026-09-03'),
      project('HK-1002', 'Mori Precision', '2026-09-18'),
      project('HK-1003', 'Nikko Works', '2026-08-28')
    ];
    app.projectMonth = '2026-09';
    app.search = 'Nikko';

    expect(app.filteredProjects.map((item) => item.projectCode)).toEqual(['HK-1001']);
  });

  it('should expose a budget list with client, date and selling price for the Presupuestos view', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.budgets = [
      { id: 1, client: 'Nikko Works', description: 'Presupuesto de estructura metálica', sellingPrice: 1600, date: '2026-09-10' },
      { id: 2, client: 'Mori Precision', description: 'Cotización de soporte industrial', sellingPrice: 2300, date: '2026-09-11' }
    ];

    app.view = 'Presupuestos';
    expect(app.view).toBe('Presupuestos');
    expect(app.budgetProjects.map((item) => ({ client: item.client, price: item.sellingPrice }))).toEqual([
      { client: 'Nikko Works', price: 1600 },
      { client: 'Mori Precision', price: 2300 }
    ]);
  });

  it('should print a budget note with the entered fields escaped for HTML', async () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    const printFrame = {
      title: '',
      srcdoc: '',
      style: {} as CSSStyleDeclaration,
      setAttribute: jasmine.createSpy('setAttribute'),
      addEventListener: jasmine.createSpy('addEventListener'),
      remove: jasmine.createSpy('remove')
    } as unknown as HTMLIFrameElement;
    spyOn(document, 'createElement').and.returnValue(printFrame);
    spyOn(document.body, 'appendChild').and.returnValue(printFrame);

    app.printBudget({
      id: 42,
      client: 'Nikko & Works',
      description: '<script>alert("x")</script>',
      sellingPrice: 1600,
      date: '2026-09-10'
    }, new Event('click'));

    const html = printFrame.srcdoc;

    expect(printFrame.title).toBe('Vista de impresión del presupuesto');
    expect(html).toContain('HK-PRES-00042');
    expect(html).toContain('Nikko &amp; Works');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('Gs. 1.600');
    expect(printFrame.addEventListener).toHaveBeenCalledWith('load', jasmine.any(Function), { once: true });
  });
});
