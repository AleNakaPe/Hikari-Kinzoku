import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

export interface MaterialRecord {
  id?: number;
  code: string;
  name: string;
  unit: string;
  initialStock: number;
  entries: number;
  exits: number;
  unitCost: number;
  minimumStock: number;
}

export interface ProjectMaterial {
  materialId: number;
  name: string;
  code: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface ProjectRecord {
  id?: number;
  projectCode: string;
  client: string;
  startDate: string;
  deliveryDate: string;
  materials: ProjectMaterial[];
  hours: number;
  laborCost: number;
  sellingPrice: number;
  status: 'En curso' | 'Finalizado';
}

export interface CashRecord {
  id?: number;
  date: string;
  concept: string;
  detail: string;
  amount: number;
  type: 'Ingreso' | 'Egreso';
}

export interface BudgetRecord {
  id?: number;
  client: string;
  description: string;
  sellingPrice: number;
  date: string;
}

class HikariDatabase extends Dexie {
  materials!: Table<MaterialRecord, number>;
  projects!: Table<ProjectRecord, number>;
  cashEntries!: Table<CashRecord, number>;
  budgets!: Table<BudgetRecord, number>;

  constructor() {
    super('hikari-control-local');
    this.version(3).stores({
      materials: '++id, &code, name',
      projects: '++id, &projectCode, client, status, startDate, deliveryDate',
      cashEntries: '++id, date, type, concept',
      budgets: '++id, client, date'
    });
  }
}

@Injectable({ providedIn: 'root' })
export class HikariDatabaseService {
  private readonly database = new HikariDatabase();

  async initialize(): Promise<void> {
    await this.database.open();

    const today = new Date();
    const date = (dayOffset: number) => {
      const value = new Date(today);
      value.setDate(value.getDate() + dayOffset);
      return value.toISOString().slice(0, 10);
    };

    const hasMaterials = await this.database.materials.count();
    if (!hasMaterials) {
      await this.database.transaction('rw', this.database.materials, this.database.projects, this.database.cashEntries, this.database.budgets, async () => {
      const ironId = await this.database.materials.add({ code: 'MAT-001', name: 'Lámina de acero inoxidable', unit: 'kg', initialStock: 200, entries: 0, exits: 50, unitCost: 12, minimumStock: 60 });
      const steelId = await this.database.materials.add({ code: 'MAT-002', name: 'Perfil estructural', unit: 'm', initialStock: 120, entries: 0, exits: 34, unitCost: 18, minimumStock: 30 });
      const paintId = await this.database.materials.add({ code: 'MAT-003', name: 'Recubrimiento industrial', unit: 'l', initialStock: 40, entries: 0, exits: 16, unitCost: 9, minimumStock: 12 });

      await this.database.projects.bulkAdd([
        {
          projectCode: 'HK-0264', client: 'Nikko Works', startDate: date(-52), deliveryDate: date(-33),
          materials: [
            { materialId: ironId, name: 'Lámina de acero inoxidable', code: 'MAT-001', quantity: 20, unit: 'kg', unitCost: 12 },
            { materialId: steelId, name: 'Perfil estructural', code: 'MAT-002', quantity: 12, unit: 'm', unitCost: 18 }
          ], hours: 38, laborCost: 760, sellingPrice: 4600, status: 'Finalizado'
        },
        {
          projectCode: 'HK-0265', client: 'Mori Precision', startDate: date(-8), deliveryDate: date(9),
          materials: [
            { materialId: ironId, name: 'Lámina de acero inoxidable', code: 'MAT-001', quantity: 30, unit: 'kg', unitCost: 12 },
            { materialId: steelId, name: 'Perfil estructural', code: 'MAT-002', quantity: 22, unit: 'm', unitCost: 18 },
            { materialId: paintId, name: 'Recubrimiento industrial', code: 'MAT-003', quantity: 16, unit: 'l', unitCost: 9 }
          ], hours: 24, laborCost: 480, sellingPrice: 3900, status: 'En curso'
        }
      ]);

      await this.database.cashEntries.bulkAdd([
        { date: date(-54), concept: 'Compra de materiales', detail: 'Suministros de producción', amount: 1250, type: 'Egreso' },
        { date: date(-33), concept: 'HK-0264 · Nikko Works', detail: 'Cobro de proyecto finalizado', amount: 4600, type: 'Ingreso' }
      ]);

        await this.database.budgets.bulkAdd([
          { client: 'Nikko Works', description: 'Presupuesto para estructura metálica y acabado industrial.', sellingPrice: 4600, date: date(-15) },
          { client: 'Mori Precision', description: 'Cotización para marco estructural con recubrimiento.', sellingPrice: 3900, date: date(-4) }
        ]);
      });
      return;
    }

    const hasBudgets = await this.database.budgets.count();
    if (!hasBudgets) {
      await this.database.budgets.bulkAdd([
        { client: 'Nikko Works', description: 'Presupuesto para estructura metálica y acabado industrial.', sellingPrice: 4600, date: date(-15) },
        { client: 'Mori Precision', description: 'Cotización para marco estructural con recubrimiento.', sellingPrice: 3900, date: date(-4) }
      ]);
    }
  }

  getMaterials(): Promise<MaterialRecord[]> {
    return this.database.materials.toArray();
  }

  getProjects(): Promise<ProjectRecord[]> {
    return this.database.projects.orderBy('startDate').reverse().toArray();
  }

  getCashEntries(): Promise<CashRecord[]> {
    return this.database.cashEntries.orderBy('date').reverse().toArray();
  }

  getBudgets(): Promise<BudgetRecord[]> {
    return this.database.budgets.orderBy('date').reverse().toArray();
  }

  async addBudget(budget: Omit<BudgetRecord, 'id'>): Promise<void> {
    await this.database.budgets.add(budget);
  }

  async updateBudget(id: number, budget: Partial<Omit<BudgetRecord, 'id'>>): Promise<void> {
    await this.database.budgets.update(id, budget);
  }

  async deleteBudget(id: number): Promise<void> {
    await this.database.budgets.delete(id);
  }

  async addMaterial(material: Omit<MaterialRecord, 'id' | 'entries' | 'exits'>): Promise<void> {
    if (await this.database.materials.where('code').equals(material.code).count()) {
      throw new Error('Ya existe un material con ese código.');
    }
    await this.database.materials.add({ ...material, entries: 0, exits: 0 });
  }

  async receiveMaterial(materialId: number, quantity: number, unitCost: number, date: string): Promise<void> {
    await this.database.transaction('rw', this.database.materials, this.database.cashEntries, async () => {
      const material = await this.database.materials.get(materialId);
      if (!material) throw new Error('No se encontró el material seleccionado.');
      const currentStock = material.initialStock + material.entries - material.exits;
      const weightedCost = currentStock + quantity > 0
        ? ((currentStock * material.unitCost) + (quantity * unitCost)) / (currentStock + quantity)
        : unitCost;
      await this.database.materials.update(materialId, { entries: material.entries + quantity, unitCost: weightedCost });
      await this.database.cashEntries.add({ date, concept: 'Compra de materiales', detail: `${material.code} · ${material.name}`, amount: quantity * unitCost, type: 'Egreso' });
    });
  }

  async addProject(project: Omit<ProjectRecord, 'id'>): Promise<void> {
    await this.database.transaction('rw', this.database.materials, this.database.projects, async () => {
      const quantities = new Map<number, number>();
      for (const line of project.materials) quantities.set(line.materialId, (quantities.get(line.materialId) ?? 0) + line.quantity);
      for (const [materialId, quantity] of quantities) {
        const material = await this.database.materials.get(materialId);
        if (!material) throw new Error('No se encontró uno de los materiales seleccionados.');
        const stock = material.initialStock + material.entries - material.exits;
        if (quantity > stock) throw new Error(`Stock insuficiente de ${material.name}. Disponible: ${stock} ${material.unit}.`);
      }
      for (const [materialId, quantity] of quantities) {
        const material = await this.database.materials.get(materialId);
        if (material) await this.database.materials.update(materialId, { exits: material.exits + quantity });
      }
      await this.database.projects.add(project);
    });
  }

  async completeProject(projectId: number, date: string): Promise<void> {
    await this.database.transaction('rw', this.database.projects, this.database.cashEntries, async () => {
      const project = await this.database.projects.get(projectId);
      if (!project || project.status === 'Finalizado') return;
      await this.database.projects.update(projectId, { status: 'Finalizado' });
      await this.database.cashEntries.add({ date, concept: `${project.projectCode} · ${project.client}`, detail: 'Cobro de proyecto finalizado', amount: project.sellingPrice, type: 'Ingreso' });
    });
  }

  async addCashEntry(entry: Omit<CashRecord, 'id'>): Promise<void> {
    await this.database.cashEntries.add(entry);
  }
}