const { contextBridge, ipcRenderer } = require('electron');

const database = {};
for (const operation of [
  'initialize',
  'getMaterials',
  'getProjects',
  'getCashEntries',
  'getBudgets',
  'addBudget',
  'updateBudget',
  'deleteBudget',
  'addMaterial',
  'receiveMaterial',
  'addProject',
  'completeProject',
  'addCashEntry'
]) {
  database[operation] = (...args) => ipcRenderer.invoke(`database:${operation}`, ...args);
}

contextBridge.exposeInMainWorld('hikariDesktop', { database });