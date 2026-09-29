import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { BudgetRecord, CashRecord, HikariDatabaseService, MaterialRecord, ProjectMaterial, ProjectRecord } from './data/hikari-database.service';

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip);

@Component({
  selector: 'app-root',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('salesCanvas') salesCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('materialsCanvas') materialsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('marginCanvas') marginCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cashCanvas') cashCanvas?: ElementRef<HTMLCanvasElement>;

  view: 'Resumen' | 'Inventario' | 'Presupuestos' | 'Proyectos' | 'Caja' = 'Resumen';
  materials: MaterialRecord[] = [];
  projects: ProjectRecord[] = [];
  budgets: BudgetRecord[] = [];
  cashEntries: CashRecord[] = [];
  search = '';
  projectMonth = '';
  modal: 'material' | 'project' | 'receipt' | 'cash' | 'budget' | null = null;
  formError = '';
  budgetFormMode: 'view' | 'edit' | 'create' = 'view';
  selectedBudgetId: number | null = null;
  pendingBudgetDeletion: BudgetRecord | null = null;
  pendingProjectCompletion: ProjectRecord | null = null;
  materialForm = { code: '', name: '', unit: 'pza', initialStock: 0, unitCost: 0, minimumStock: 0 };
  projectForm = { projectCode: '', client: '', startDate: this.today(), deliveryDate: this.today(), hours: 0, laborCost: 0, sellingPrice: 0 };
  projectLines: { materialId: number | null; quantity: number }[] = [{ materialId: null, quantity: 1 }];
  receiptForm = { materialId: 0, quantity: 0, unitCost: 0, date: this.today() };
  cashForm = { date: this.today(), concept: '', detail: '', amount: 0, type: 'Ingreso' as 'Ingreso' | 'Egreso' };
  budgetForm = { client: '', description: '', sellingPrice: 0, date: this.today() };
  todayDate = this.today();
  private charts: Chart[] = [];
  private viewReady = false;
  private readonly database = new HikariDatabaseService();

  async ngOnInit(): Promise<void> {
    await this.database.initialize();
    await this.refresh();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.drawCharts();
  }

  async refresh(): Promise<void> {
    [this.materials, this.projects, this.cashEntries, this.budgets] = await Promise.all([
      this.database.getMaterials(), this.database.getProjects(), this.database.getCashEntries(), this.database.getBudgets()
    ]);
    if (this.viewReady) setTimeout(() => this.drawCharts());
  }

  get filteredMaterials(): MaterialRecord[] {
    const term = this.search.trim().toLocaleLowerCase();
    return this.materials.filter((item) => `${item.code} ${item.name} ${item.unit}`.toLocaleLowerCase().includes(term));
  }

  get filteredProjects(): ProjectRecord[] {
    const term = this.search.trim().toLocaleLowerCase();
    return this.projects.filter((item) => {
      const matchesText = `${item.projectCode} ${item.client} ${item.status}`.toLocaleLowerCase().includes(term);
      const matchesMonth = !this.projectMonth || item.startDate.startsWith(this.projectMonth);
      return matchesText && matchesMonth;
    });
  }

  get budgetProjects(): BudgetRecord[] {
    const term = this.search.trim().toLocaleLowerCase();
    return this.budgets.filter((item) => {
      const matchesText = `${item.client} ${item.description}`.toLocaleLowerCase().includes(term);
      const matchesMonth = !this.projectMonth || item.date.startsWith(this.projectMonth);
      return matchesText && matchesMonth;
    });
  }

  get budgetUniqueClients(): number {
    return new Set(this.budgetProjects.map((project) => project.client)).size;
  }

  get totalBudgetValue(): number {
    return this.budgetProjects.reduce((total, project) => total + project.sellingPrice, 0);
  }

  get stockValue(): number {
    return this.materials.reduce((total, item) => total + this.stock(item) * item.unitCost, 0);
  }

  get activeProjects(): number {
    return this.projects.filter((project) => project.status === 'En curso').length;
  }

  get lowStockCount(): number {
    return this.materials.filter((item) => this.stock(item) <= item.minimumStock).length;
  }

  get cashBalance(): number {
    return this.cashEntries.reduce((balance, entry) => balance + (entry.type === 'Ingreso' ? entry.amount : -entry.amount), 0);
  }

  get completedSales(): number {
    return this.projects.filter((project) => project.status === 'Finalizado').reduce((total, project) => total + project.sellingPrice, 0);
  }

  get pageDescription(): string {
    return {
      Resumen: 'Vista general de la operación y el rendimiento del taller.',
      Inventario: 'Existencias, costos y movimientos de materiales.',
      Presupuestos: 'Listado de clientes, fechas y precios de venta estimados.',
      Proyectos: 'Seguimiento de producción, costos y entregas.',
      Caja: 'Registro de ingresos, egresos y saldo disponible.'
    }[this.view];
  }

  stock(material: MaterialRecord): number {
    return material.initialStock + material.entries - material.exits;
  }

  materialValue(material: MaterialRecord): number {
    return this.stock(material) * material.unitCost;
  }

  projectMaterialCost(project: ProjectRecord): number {
    return project.materials.reduce((total, line) => total + line.quantity * line.unitCost, 0);
  }

  projectTotal(project: ProjectRecord): number {
    return this.projectMaterialCost(project) + project.laborCost;
  }

  projectMargin(project: ProjectRecord): number {
    return project.sellingPrice - this.projectTotal(project);
  }

  runningBalance(target: CashRecord): number {
    const sorted = [...this.cashEntries].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
    let balance = 0;
    for (const entry of sorted) {
      balance += entry.type === 'Ingreso' ? entry.amount : -entry.amount;
      if (entry.id === target.id) return balance;
    }
    return balance;
  }

  selectView(view: 'Resumen' | 'Inventario' | 'Presupuestos' | 'Proyectos' | 'Caja'): void {
    this.view = view;
    this.search = '';
    this.projectMonth = '';
    if (view === 'Resumen') setTimeout(() => this.drawCharts());
  }

  openBudgetCreate(): void {
    this.formError = '';
    this.budgetForm = { client: '', description: '', sellingPrice: 0, date: this.today() };
    this.budgetFormMode = 'create';
    this.selectedBudgetId = null;
    this.modal = 'budget';
  }

  openBudgetView(budget: BudgetRecord): void {
    this.formError = '';
    this.selectedBudgetId = budget.id ?? null;
    this.budgetForm = {
      client: budget.client,
      description: budget.description,
      sellingPrice: budget.sellingPrice,
      date: budget.date
    };
    this.budgetFormMode = 'view';
    this.modal = 'budget';
  }

  editBudget(budget: BudgetRecord, event: Event): void {
    event.stopPropagation();
    this.formError = '';
    this.selectedBudgetId = budget.id ?? null;
    this.budgetForm = {
      client: budget.client,
      description: budget.description,
      sellingPrice: budget.sellingPrice,
      date: budget.date
    };
    this.budgetFormMode = 'edit';
    this.modal = 'budget';
  }

  printBudget(budget: BudgetRecord, event: Event): void {
    event.stopPropagation();
    const folio = `HK-PRES-${String(budget.id ?? 'NUEVO').padStart(5, '0')}`;
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character] ?? character);
    const client = escapeHtml(budget.client);
    const description = escapeHtml(budget.description);
    const html = `<!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${folio} - ${client}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 48px; color: #26372f; font: 14px/1.5 Arial, sans-serif; }
            .sheet { max-width: 760px; margin: 0 auto; }
            header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 2px solid #2d6a58; }
            .brand { color: #2d6a58; font: 700 21px Georgia, serif; letter-spacing: .4px; }
            .brand small { display: block; margin-top: 5px; color: #78867f; font: 10px Arial, sans-serif; letter-spacing: 1.5px; }
            .document-title { text-align: right; }
            h1 { margin: 0 0 5px; font: 500 25px Georgia, serif; }
            .folio { color: #78867f; font-size: 11px; }
            .details { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 35px 0; }
            .label { display: block; margin-bottom: 6px; color: #78867f; font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
            .value { color: #26372f; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; }
            th { padding: 11px 12px; color: #fff; background: #2d6a58; font-size: 10px; letter-spacing: .6px; text-align: left; }
            td { padding: 15px 12px; border-bottom: 1px solid #e4e9e4; vertical-align: top; }
            .description { min-height: 110px; white-space: pre-wrap; overflow-wrap: anywhere; }
            .amount { width: 190px; text-align: right; white-space: nowrap; }
            .total { display: flex; justify-content: flex-end; gap: 30px; margin-top: 20px; padding: 16px 12px; border-top: 1px solid #dce4dd; font-size: 16px; font-weight: 700; }
            footer { margin-top: 70px; padding-top: 14px; border-top: 1px solid #e4e9e4; color: #78867f; font-size: 10px; text-align: center; }
            @page { size: A4; margin: 16mm; }
            @media print { body { padding: 0; } .sheet { max-width: none; } }
            @media screen and (max-width: 600px) { body { padding: 24px; } header { flex-direction: column; } .document-title { text-align: left; } .amount { width: auto; } }
          </style>
        </head>
        <body>
          <main class="sheet">
            <header>
              <div class="brand">HIKARI KINZOKU<small>CONTROL Y PRESUPUESTOS</small></div>
              <div class="document-title"><h1>Nota de presupuesto</h1><div class="folio">${folio}</div></div>
            </header>
            <section class="details">
              <div><span class="label">Presupuesto para</span><span class="value">${client}</span></div>
              <div><span class="label">Fecha de emisión</span><span class="value">${escapeHtml(this.formatDate(budget.date))}</span></div>
            </section>
            <table>
              <thead><tr><th>DESCRIPCIÓN</th><th class="amount">IMPORTE</th></tr></thead>
              <tbody><tr><td class="description">${description}</td><td class="amount">${escapeHtml(this.formatCurrency(budget.sellingPrice))}</td></tr></tbody>
            </table>
            <div class="total"><span>Total</span><span>${escapeHtml(this.formatCurrency(budget.sellingPrice))}</span></div>
            <footer>Hikari Kinzoku · Nota de presupuesto generada el ${escapeHtml(this.formatDate(this.today()))}</footer>
          </main>
        </body>
      </html>`;
    const printFrame = document.createElement('iframe');
    printFrame.title = 'Vista de impresión del presupuesto';
    printFrame.setAttribute('aria-hidden', 'true');
    printFrame.style.position = 'fixed';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.addEventListener('load', () => {
      const printWindow = printFrame.contentWindow;
      if (!printWindow) {
        printFrame.remove();
        return;
      }
      printWindow.addEventListener('afterprint', () => printFrame.remove(), { once: true });
      printWindow.focus();
      printWindow.print();
    }, { once: true });
    printFrame.srcdoc = html;
    document.body.appendChild(printFrame);
  }

  requestBudgetDeletion(budget: BudgetRecord, event: Event): void {
    event.stopPropagation();
    this.pendingBudgetDeletion = budget;
  }

  cancelBudgetDeletion(): void {
    this.pendingBudgetDeletion = null;
  }

  async confirmBudgetDeletion(): Promise<void> {
    const budget = this.pendingBudgetDeletion;
    if (budget?.id === undefined) {
      this.cancelBudgetDeletion();
      return;
    }

    await this.database.deleteBudget(budget.id);
    this.cancelBudgetDeletion();
    await this.refresh();
  }

  async saveBudget(): Promise<void> {
    try {
      const payload = {
        client: this.budgetForm.client.trim(),
        description: this.budgetForm.description.trim(),
        sellingPrice: Number(this.budgetForm.sellingPrice),
        date: this.budgetForm.date
      };

      if (!payload.client || !payload.description || payload.sellingPrice <= 0) {
        throw new Error('Completa cliente, descripción y precio de venta válido.');
      }

      if (this.budgetFormMode === 'create') {
        await this.database.addBudget(payload);
      } else if (this.selectedBudgetId !== null) {
        await this.database.updateBudget(this.selectedBudgetId, payload);
      }

      this.modal = null;
      this.formError = '';
      await this.refresh();
    } catch (error) { this.showError(error); }
  }

  openMaterial(): void {
    this.formError = '';
    this.materialForm = { code: '', name: '', unit: 'pza', initialStock: 0, unitCost: 0, minimumStock: 0 };
    this.modal = 'material';
  }

  openProject(): void {
    this.formError = '';
    this.projectForm = { projectCode: `HK-${String(Date.now()).slice(-4)}`, client: '', startDate: this.today(), deliveryDate: this.today(), hours: 0, laborCost: 0, sellingPrice: 0 };
    this.projectLines = [{ materialId: this.materials[0]?.id ?? null, quantity: 1 }];
    this.modal = 'project';
  }

  addProjectLine(): void {
    this.projectLines = [...this.projectLines, { materialId: this.materials[0]?.id ?? null, quantity: 1 }];
  }

  removeProjectLine(index: number): void {
    if (this.projectLines.length > 1) this.projectLines = this.projectLines.filter((_, row) => row !== index);
  }

  openReceipt(material: MaterialRecord): void {
    this.formError = '';
    this.receiptForm = { materialId: material.id!, quantity: 0, unitCost: material.unitCost, date: this.today() };
    this.modal = 'receipt';
  }

  openCash(): void {
    this.formError = '';
    this.cashForm = { date: this.today(), concept: '', detail: '', amount: 0, type: 'Ingreso' };
    this.modal = 'cash';
  }

  async saveMaterial(): Promise<void> {
    try {
      await this.database.addMaterial({ ...this.materialForm, code: this.materialForm.code.trim(), name: this.materialForm.name.trim() });
      this.modal = null;
      await this.refresh();
    } catch (error) { this.showError(error); }
  }

  async saveReceipt(): Promise<void> {
    try {
      await this.database.receiveMaterial(this.receiptForm.materialId, this.receiptForm.quantity, this.receiptForm.unitCost, this.receiptForm.date);
      this.modal = null;
      await this.refresh();
    } catch (error) { this.showError(error); }
  }

  async saveProject(): Promise<void> {
    try {
      const lines: ProjectMaterial[] = this.projectLines.map((line) => {
        const material = this.materials.find((item) => item.id === Number(line.materialId));
        if (!material || line.quantity <= 0) throw new Error('Selecciona un material y una cantidad válida en cada renglón.');
        return { materialId: material.id!, name: material.name, code: material.code, quantity: Number(line.quantity), unit: material.unit, unitCost: material.unitCost };
      });
      await this.database.addProject({ ...this.projectForm, materials: lines, status: 'En curso' });
      this.modal = null;
      await this.refresh();
    } catch (error) { this.showError(error); }
  }

  async completeProject(project: ProjectRecord): Promise<void> {
    if (project.id === undefined) return;
    await this.database.completeProject(project.id, this.today());
    await this.refresh();
  }

  requestProjectCompletion(project: ProjectRecord): void {
    this.pendingProjectCompletion = project;
  }

  cancelProjectCompletion(): void {
    this.pendingProjectCompletion = null;
  }

  async confirmProjectCompletion(): Promise<void> {
    const project = this.pendingProjectCompletion;
    if (!project) return;

    await this.completeProject(project);
    this.cancelProjectCompletion();
  }

  async saveCash(): Promise<void> {
    try {
      await this.database.addCashEntry({ ...this.cashForm, concept: this.cashForm.concept.trim(), detail: this.cashForm.detail.trim() });
      this.modal = null;
      await this.refresh();
    } catch (error) { this.showError(error); }
  }

  closeModal(): void {
    this.modal = null;
    this.formError = '';
    this.selectedBudgetId = null;
    this.budgetFormMode = 'view';
  }

  formatCurrency(value: number): string {
    return `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(value)}`;
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private showError(error: unknown): void {
    this.formError = error instanceof Error ? error.message : 'No se pudo guardar el registro.';
  }

  private drawCharts(): void {
    if (!this.salesCanvas || !this.materialsCanvas || !this.marginCanvas || !this.cashCanvas) return;
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    const salesByClient = new Map<string, number>();
    for (const project of this.projects.filter((item) => item.status === 'Finalizado')) {
      salesByClient.set(project.client, (salesByClient.get(project.client) ?? 0) + project.sellingPrice);
    }
    this.charts.push(new Chart(this.salesCanvas.nativeElement, {
      type: 'bar',
      data: { labels: [...salesByClient.keys()], datasets: [{ data: [...salesByClient.values()], backgroundColor: ['#2d6a58', '#92b8a7', '#c7a46a', '#8a9ca7'], borderRadius: 4, maxBarThickness: 32 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#edf0ed' }, ticks: { callback: (value) => this.formatCurrency(Number(value)) } }, x: { grid: { display: false } } } }
    }));

    const consumption = new Map<string, number>();
    for (const project of this.projects) for (const line of project.materials) consumption.set(line.name, (consumption.get(line.name) ?? 0) + line.quantity);
    this.charts.push(new Chart(this.materialsCanvas.nativeElement, {
      type: 'doughnut',
      data: { labels: [...consumption.keys()], datasets: [{ data: [...consumption.values()], backgroundColor: ['#2d6a58', '#c7a46a', '#7c9ca7', '#d89078'], borderWidth: 0, hoverOffset: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 16 } } } }
    }));

    const monthlyMargins = new Map<string, number>();
    for (const project of this.projects) {
      const month = new Date(`${project.startDate}T12:00:00`).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
      monthlyMargins.set(month, (monthlyMargins.get(month) ?? 0) + this.projectMargin(project));
    }
    const marginValues = [...monthlyMargins.entries()].slice(-6);
    this.charts.push(new Chart(this.marginCanvas.nativeElement, {
      type: 'line',
      data: { labels: marginValues.map(([month]) => month), datasets: [{ data: marginValues.map(([, amount]) => amount), borderColor: '#2d6a58', backgroundColor: 'rgba(45,106,88,.1)', fill: true, tension: .35, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#edf0ed' }, ticks: { callback: (value) => this.formatCurrency(Number(value)) } }, x: { grid: { display: false } } } }
    }));

    const balances = [...this.cashEntries].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
    let balance = 0;
    const balanceValues = balances.map((entry) => balance += entry.type === 'Ingreso' ? entry.amount : -entry.amount);
    this.charts.push(new Chart(this.cashCanvas.nativeElement, {
      type: 'line',
      data: { labels: balances.map((entry) => this.formatDate(entry.date)), datasets: [{ data: balanceValues, borderColor: '#c28c43', backgroundColor: 'rgba(194,140,67,.12)', fill: true, tension: .35, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#edf0ed' }, ticks: { callback: (value) => this.formatCurrency(Number(value)) } }, x: { grid: { display: false } } } }
    }));
  }
}
