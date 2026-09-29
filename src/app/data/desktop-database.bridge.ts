import { BudgetRecord, CashRecord, MaterialRecord, ProjectRecord } from './hikari-database.service';

export interface DesktopDatabaseSeed {
  materials: MaterialRecord[];
  projects: ProjectRecord[];
  cashEntries: CashRecord[];
  budgets: BudgetRecord[];
}

export interface DesktopDatabaseApi {
  initialize(seed: DesktopDatabaseSeed): Promise<void>;
  getMaterials(): Promise<MaterialRecord[]>;
  getProjects(): Promise<ProjectRecord[]>;
  getCashEntries(): Promise<CashRecord[]>;
  getBudgets(): Promise<BudgetRecord[]>;
  addBudget(budget: Omit<BudgetRecord, 'id'>): Promise<void>;
  updateBudget(id: number, budget: Partial<Omit<BudgetRecord, 'id'>>): Promise<void>;
  deleteBudget(id: number): Promise<void>;
  addMaterial(material: Omit<MaterialRecord, 'id' | 'entries' | 'exits'>): Promise<void>;
  receiveMaterial(materialId: number, quantity: number, unitCost: number, date: string): Promise<void>;
  addProject(project: Omit<ProjectRecord, 'id'>): Promise<void>;
  completeProject(projectId: number, date: string): Promise<void>;
  addCashEntry(entry: Omit<CashRecord, 'id'>): Promise<void>;
}

declare global {
  interface Window {
    hikariDesktop?: {
      database: DesktopDatabaseApi;
    };
  }
}

export function getDesktopDatabase(): DesktopDatabaseApi | undefined {
  return typeof window === 'undefined' ? undefined : window.hikariDesktop?.database;
}