import { openDB } from 'idb';

const DB_NAME = 'taskly_offline';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store for cached tasks
        if (!db.objectStoreNames.contains('tasks')) {
          db.createObjectStore('tasks', { keyPath: 'id' });
        }
        // Store for queued mutations (offline actions)
        if (!db.objectStoreNames.contains('mutationQueue')) {
          const store = db.createObjectStore('mutationQueue', { keyPath: 'queueId', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

// ─── Task Cache ───────────────────────────────────────────

export async function getCachedTasks(workspaceId) {
  const db = await getDB();
  const all = await db.getAll('tasks');
  return all.filter(t => t.workspace_id === workspaceId);
}

export async function setCachedTasks(tasks) {
  const db = await getDB();
  const tx = db.transaction('tasks', 'readwrite');
  // Clear old cache and replace
  await tx.store.clear();
  for (const task of tasks) {
    await tx.store.put(task);
  }
  await tx.done;
}

export async function updateCachedTask(task) {
  const db = await getDB();
  await db.put('tasks', task);
}

export async function deleteCachedTask(id) {
  const db = await getDB();
  await db.delete('tasks', id);
}

// ─── Mutation Queue ───────────────────────────────────────

export async function queueMutation(mutation) {
  const db = await getDB();
  await db.add('mutationQueue', {
    ...mutation,
    timestamp: Date.now(),
  });
}

export async function getQueuedMutations() {
  const db = await getDB();
  return db.getAllFromIndex('mutationQueue', 'timestamp');
}

export async function clearMutationQueue() {
  const db = await getDB();
  await db.clear('mutationQueue');
}

export async function removeMutation(queueId) {
  const db = await getDB();
  await db.delete('mutationQueue', queueId);
}
