const DB_NAME = 'WisperAgentDB';
const STORE_NAME = 'settings';
const HANDLE_KEY = 'obsidian_vault_handle';

export const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveVaultHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getVaultHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("IndexedDB error", e);
    return null;
  }
};

export const verifyPermission = async (handle: FileSystemHandle, readWrite: boolean): Promise<boolean> => {
  const options = {
    mode: readWrite ? 'readwrite' as const : 'read' as const,
  };
  const anyHandle = handle as any;
  if (typeof anyHandle.queryPermission === 'function' && (await anyHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if (typeof anyHandle.requestPermission === 'function' && (await anyHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
};
