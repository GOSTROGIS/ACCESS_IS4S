import { documentRecord, title, verifyDocument } from './model.mjs';

function requestResult(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || Error('Project storage transaction was cancelled.'));
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function openProjects(name = 'access-is4s-projects-v1') {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore('projects', { keyPath: 'id' });
    const docs = db.createObjectStore('documents', { keyPath: 'id' });
    docs.createIndex('projectId', 'projectId');
  };
  const db = await requestResult(request);
  db.onversionchange = () => db.close();
  return {
    close: () => db.close(),
    async projects() {
      const transaction = db.transaction('projects');
      const done = transactionDone(transaction);
      const records = await requestResult(transaction.objectStore('projects').getAll());
      await done;
      return records.sort((a, b) => b.updated - a.updated);
    },
    async createProject(name, skill = '') {
      const project = { id: crypto.randomUUID(), name: title(name), skill: String(skill).slice(0, 80), created: Date.now(), updated: Date.now() };
      const transaction = db.transaction('projects', 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore('projects').add(project);
      await done;
      return project;
    },
    async documents(projectId) {
      const transaction = db.transaction('documents');
      const done = transactionDone(transaction);
      const records = await requestResult(transaction.objectStore('documents').index('projectId').getAll(projectId));
      await done;
      return records.sort((a, b) => b.updated - a.updated);
    },
    async load(id) {
      const transaction = db.transaction('documents');
      const done = transactionDone(transaction);
      const record = await requestResult(transaction.objectStore('documents').get(id));
      await done;
      if (!record) throw Error('This document is no longer in this browser.');
      return verifyDocument(record);
    },
    async save(values) {
      const record = await documentRecord(values);
      const transaction = db.transaction(['projects', 'documents'], 'readwrite');
      const done = transactionDone(transaction);
      const projects = transaction.objectStore('projects');
      const project = await requestResult(projects.get(record.projectId));
      if (!project) { transaction.abort(); await done; throw Error('Create a project before saving.'); }
      transaction.objectStore('documents').put(record);
      projects.put({ ...project, updated: record.updated });
      await done;
      // Acknowledgement is sent only after the durable transaction and a fresh
      // read independently confirm the exact bytes, length and digest.
      const saved = await this.load(record.id);
      if (saved.sha256 !== record.sha256 || saved.size !== record.size) throw Error('Project storage did not retain the exported bytes.');
      return saved;
    },
    async remove(id) {
      const transaction = db.transaction('documents', 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore('documents').delete(id);
      await done;
    },
  };
}
