import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { CashRecord, HikariDatabaseService, MaterialRecord, ProjectMaterial, ProjectRecord } from './data/hikari-database.service';

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

  view: 'Resumen' | 'Inventario' | 'Proyectos' | 'Caja' = 'Resumen';
  materials: MaterialRecord[] = [];
  projects: ProjectRecord[] = [];
  cashEntries: CashRecord[] = [];
  search = '';
  projectMonth = '';
  modal: 'material' | 'project' | 'receipt' | 'cash' | null = null;
  formError = '';
  materialForm = { code: '', name: '', unit: 'pza', initialStock: 0, unitCost: 0, minimumStock: 0 };
  projectForm = { projectCode: '', client: '', startDate: this.today(), deliveryDate: this.today(), hours: 0, laborCost: 0, sellingPrice: 0 };
  projectLines: { materialId: number | null; quantity: number }[] = [{ materialId: null, quantity: 1 }];
  receiptForm = { materialId: 0, quantity: 0, unitCost: 0, date: this.today() };
  cashForm = { date: this.today(), concept: '', detail: '', amount: 0, type: 'Ingreso' as 'Ingreso' | 'Egreso' };
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
    [this.materials, this.projects, this.cashEntries] = await Promise.all([
      this.database.getMaterials(), this.database.getProjects(), this.database.getCashEntries()
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

  selectView(view: 'Resumen' | 'Inventario' | 'Proyectos' | 'Caja'): void {
    this.view = view;
    this.search = '';
    this.projectMonth = '';
    if (view === 'Resumen') setTimeout(() => this.drawCharts());
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
