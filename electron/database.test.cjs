const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');
const initSqlJs = require('sql.js');
const { createDatabase } = require('./database.cjs');

let directory;
let filePath;
let database;

const seed = {
  materials: [{ id: 1, code: 'MAT-1', name: 'Acero', unit: 'kg', initialStock: 10, entries: 0, exits: 2, unitCost: 10, minimumStock: 1 }],
  projects: [{ id: 1, projectCode: 'HK-1', client: 'Nikko', startDate: '2026-09-01', deliveryDate: '2026-09-10', materials: [], hours: 2, laborCost: 100, sellingPrice: 500, status: 'En curso' }],
  cashEntries: [],
  budgets: [{ id: 1, client: 'Nikko', description: 'Estructura', sellingPrice: 500, date: '2026-09-01' }]
};

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hikari-sqlite-'));
  filePath = path.join(directory, 'database.sqlite');
  database = await createDatabase(filePath);
  database.initialize(seed);
});

afterEach(() => {
  database?.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('initializes seed data once and persists it in SQLite', async () => {
  database.initialize({ ...seed, budgets: [] });
  assert.equal(database.getMaterials()[0].code, 'MAT-1');
  assert.equal(database.getBudgets().length, 1);
  database.close();

  database = await createDatabase(filePath);
  assert.equal(database.getProjects()[0].projectCode, 'HK-1');
  assert.equal(database.getBudgets()[0].client, 'Nikko');
});

test('rejects projects with insufficient stock without changing inventory', () => {
  assert.throws(() => database.addProject({
    projectCode: 'HK-2', client: 'Mori', startDate: '2026-09-02', deliveryDate: '2026-09-12',
    materials: [{ materialId: 1, name: 'Acero', code: 'MAT-1', quantity: 9, unit: 'kg', unitCost: 10 }],
    hours: 1, laborCost: 50, sellingPrice: 200, status: 'En curso'
  }), /Stock insuficiente/);
  assert.equal(database.getMaterials()[0].exits, 2);
  assert.equal(database.getProjects().length, 1);
});

test('receives material with weighted cost and records the expense atomically', () => {
  database.receiveMaterial(1, 4, 20, '2026-09-03');
  const material = database.getMaterials()[0];
  assert.equal(material.entries, 4);
  assert.equal(material.unitCost, (8 * 10 + 4 * 20) / 12);
  assert.deepEqual(database.getCashEntries().map(({ amount, type }) => ({ amount, type })), [{ amount: 80, type: 'Egreso' }]);
});

test('stores an optional project association on cash movements', () => {
  database.addCashEntry({
    date: '2026-09-03', concept: 'Anticipo', detail: 'Primer pago',
    amount: 150, type: 'Ingreso', projectId: 1
  });
  assert.equal(database.getCashEntries()[0].projectId, 1);
});

test('completes a project and records its income only once', () => {
  database.completeProject(1, '2026-09-04');
  database.completeProject(1, '2026-09-05');
  assert.equal(database.getProjects()[0].status, 'Finalizado');
  assert.deepEqual(database.getCashEntries().map(({ amount, type, projectId }) => ({ amount, type, projectId })), [{ amount: 500, type: 'Ingreso', projectId: 1 }]);
});

test('adds the project column to an existing SQLite database without losing movements', async () => {
  database.close();
  const SQL = await initSqlJs();
  const legacyDatabase = new SQL.Database();
  legacyDatabase.exec(`
    CREATE TABLE cash_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, concept TEXT NOT NULL,
      detail TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL
    );
  `);
  legacyDatabase.run('INSERT INTO cash_entries (date, concept, detail, amount, type) VALUES (?, ?, ?, ?, ?)',
    ['2026-09-01', 'Antiguo', 'Movimiento previo', 25, 'Ingreso']);
  fs.writeFileSync(filePath, Buffer.from(legacyDatabase.export()));
  legacyDatabase.close();

  database = await createDatabase(filePath);
  database.initialize(seed);
  const oldMovement = database.getCashEntries().find((entry) => entry.concept === 'Antiguo');
  assert.equal(oldMovement.projectId, null);

  database.addCashEntry({ date: '2026-09-02', concept: 'Nuevo', detail: '', amount: 75, type: 'Ingreso', projectId: 1 });
  assert.equal(database.getCashEntries().find((entry) => entry.concept === 'Nuevo').projectId, 1);
});