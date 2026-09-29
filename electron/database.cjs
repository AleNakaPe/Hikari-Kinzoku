const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

async function createDatabase(filePath) {
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
  const database = new SQL.Database(fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined);
  database.run('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      unit TEXT NOT NULL, initial_stock REAL NOT NULL, entries REAL NOT NULL,
      exits REAL NOT NULL, unit_cost REAL NOT NULL, minimum_stock REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_code TEXT NOT NULL UNIQUE, client TEXT NOT NULL,
      start_date TEXT NOT NULL, delivery_date TEXT NOT NULL, materials_json TEXT NOT NULL,
      hours REAL NOT NULL, labor_cost REAL NOT NULL, selling_price REAL NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cash_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, concept TEXT NOT NULL,
      detail TEXT NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL, project_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client TEXT NOT NULL, description TEXT NOT NULL,
      selling_price REAL NOT NULL, date TEXT NOT NULL
    );
  `);

  const persist = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(database.export()));
    fs.renameSync(temporaryPath, filePath);
  };
  const all = (sql, parameters = []) => {
    const statement = database.prepare(sql);
    try {
      statement.bind(parameters);
      const result = [];
      while (statement.step()) result.push(statement.getAsObject());
      return result;
    } finally {
      statement.free();
    }
  };
  const one = (sql, parameters = []) => all(sql, parameters)[0];
  if (!all('PRAGMA table_info(cash_entries)').some((column) => column.name === 'project_id')) {
    database.run('ALTER TABLE cash_entries ADD COLUMN project_id INTEGER');
  }
  const write = (sql, parameters = []) => {
    database.run(sql, parameters);
    persist();
  };
  const transaction = (operation) => {
    database.run('BEGIN IMMEDIATE');
    try {
      operation();
      database.run('COMMIT');
      persist();
    } catch (error) {
      database.run('ROLLBACK');
      throw error;
    }
  };
  const insert = (table, fields, values, id) => {
    const columns = id === undefined ? fields : ['id', ...fields];
    const parameters = id === undefined ? values : [id, ...values];
    database.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, parameters);
  };
  const insertMaterial = (material) => insert('materials',
    ['code', 'name', 'unit', 'initial_stock', 'entries', 'exits', 'unit_cost', 'minimum_stock'],
    [material.code, material.name, material.unit, material.initialStock, material.entries, material.exits, material.unitCost, material.minimumStock], material.id);
  const insertProject = (project) => insert('projects',
    ['project_code', 'client', 'start_date', 'delivery_date', 'materials_json', 'hours', 'labor_cost', 'selling_price', 'status'],
    [project.projectCode, project.client, project.startDate, project.deliveryDate, JSON.stringify(project.materials), project.hours, project.laborCost, project.sellingPrice, project.status], project.id);
  const insertCashEntry = (entry) => insert('cash_entries',
    ['date', 'concept', 'detail', 'amount', 'type', 'project_id'],
    [entry.date, entry.concept, entry.detail, entry.amount, entry.type, entry.projectId ?? null], entry.id);
  const insertBudget = (budget) => insert('budgets',
    ['client', 'description', 'selling_price', 'date'],
    [budget.client, budget.description, budget.sellingPrice, budget.date], budget.id);

  function initialize(seed) {
    if (one('SELECT COUNT(*) AS count FROM materials').count > 0) return;
    transaction(() => {
      seed.materials.forEach(insertMaterial);
      seed.projects.forEach(insertProject);
      seed.cashEntries.forEach(insertCashEntry);
      seed.budgets.forEach(insertBudget);
    });
  }

  function getMaterials() {
    return all('SELECT * FROM materials ORDER BY id').map((row) => ({
      id: row.id, code: row.code, name: row.name, unit: row.unit,
      initialStock: row.initial_stock, entries: row.entries, exits: row.exits,
      unitCost: row.unit_cost, minimumStock: row.minimum_stock
    }));
  }

  function getProjects() {
    return all('SELECT * FROM projects ORDER BY start_date DESC').map((row) => ({
      id: row.id, projectCode: row.project_code, client: row.client,
      startDate: row.start_date, deliveryDate: row.delivery_date,
      materials: JSON.parse(row.materials_json), hours: row.hours,
      laborCost: row.labor_cost, sellingPrice: row.selling_price, status: row.status
    }));
  }

  function getCashEntries() {
    return all('SELECT * FROM cash_entries ORDER BY date DESC').map((row) => ({
      id: row.id, date: row.date, concept: row.concept, detail: row.detail,
      amount: row.amount, type: row.type, projectId: row.project_id
    }));
  }

  function getBudgets() {
    return all('SELECT * FROM budgets ORDER BY date DESC').map((row) => ({
      id: row.id, client: row.client, description: row.description,
      sellingPrice: row.selling_price, date: row.date
    }));
  }

  function addBudget(budget) {
    write('INSERT INTO budgets (client, description, selling_price, date) VALUES (?, ?, ?, ?)',
      [budget.client, budget.description, budget.sellingPrice, budget.date]);
  }

  function updateBudget(id, budget) {
    const columnByField = { client: 'client', description: 'description', sellingPrice: 'selling_price', date: 'date' };
    const fields = Object.keys(columnByField).filter((field) => Object.hasOwn(budget, field));
    if (!fields.length) return;
    const assignments = fields.map((field) => `${columnByField[field]} = ?`).join(', ');
    write(`UPDATE budgets SET ${assignments} WHERE id = ?`, [...fields.map((field) => budget[field]), id]);
  }

  function deleteBudget(id) {
    write('DELETE FROM budgets WHERE id = ?', [id]);
  }

  function addMaterial(material) {
    try {
      insertMaterial({ ...material, entries: 0, exits: 0 });
      persist();
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed: materials.code')) throw new Error('Ya existe un material con ese código.');
      throw error;
    }
  }

  function receiveMaterial(materialId, quantity, unitCost, date) {
    transaction(() => {
      const material = one('SELECT * FROM materials WHERE id = ?', [materialId]);
      if (!material) throw new Error('No se encontró el material seleccionado.');
      const currentStock = material.initial_stock + material.entries - material.exits;
      const weightedCost = currentStock + quantity > 0
        ? ((currentStock * material.unit_cost) + (quantity * unitCost)) / (currentStock + quantity)
        : unitCost;
      database.run('UPDATE materials SET entries = ?, unit_cost = ? WHERE id = ?',
        [material.entries + quantity, weightedCost, materialId]);
      insertCashEntry({ date, concept: 'Compra de materiales', detail: `${material.code} · ${material.name}`, amount: quantity * unitCost, type: 'Egreso' });
    });
  }

  function addProject(project) {
    transaction(() => {
      const quantities = new Map();
      for (const line of project.materials) quantities.set(line.materialId, (quantities.get(line.materialId) ?? 0) + line.quantity);
      for (const [materialId, quantity] of quantities) {
        const material = one('SELECT * FROM materials WHERE id = ?', [materialId]);
        if (!material) throw new Error('No se encontró uno de los materiales seleccionados.');
        const stock = material.initial_stock + material.entries - material.exits;
        if (quantity > stock) throw new Error(`Stock insuficiente de ${material.name}. Disponible: ${stock} ${material.unit}.`);
      }
      for (const [materialId, quantity] of quantities) {
        database.run('UPDATE materials SET exits = exits + ? WHERE id = ?', [quantity, materialId]);
      }
      insertProject(project);
    });
  }

  function completeProject(projectId, date) {
    transaction(() => {
      const project = one('SELECT * FROM projects WHERE id = ?', [projectId]);
      if (!project || project.status === 'Finalizado') return;
      database.run("UPDATE projects SET status = 'Finalizado' WHERE id = ?", [projectId]);
      insertCashEntry({
        date, concept: `${project.project_code} · ${project.client}`,
        detail: 'Cobro de proyecto finalizado', amount: project.selling_price, type: 'Ingreso', projectId
      });
    });
  }

  function addCashEntry(entry) {
    insertCashEntry(entry);
    persist();
  }

  persist();
  return {
    initialize, getMaterials, getProjects, getCashEntries, getBudgets,
    addBudget, updateBudget, deleteBudget, addMaterial, receiveMaterial,
    addProject, completeProject, addCashEntry, close: () => database.close()
  };
}

module.exports = { createDatabase };