// Mock global do AsyncStorage para testes unitários
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    getItem: jest.fn(async (key) => store[key] || null),
    setItem: jest.fn(async (key, value) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn(async (key) => {
      delete store[key];
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
    getAllKeys: jest.fn(async () => Object.keys(store)),
    multiGet: jest.fn(async (keys) => keys.map((k) => [k, store[k] || null])),
    multiSet: jest.fn(async (entries) => {
      entries.forEach(([k, v]) => {
        store[k] = String(v);
      });
    }),
  };
});

// Mock global do op-sqlite
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    executeSync: jest.fn(() => ({ rows: [] })),
    execute: jest.fn(async () => ({ rows: [] })),
    close: jest.fn(),
  })),
}));

// Mock global do react-native-image-picker
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn((options, callback) => {
    callback({
      assets: [
        {
          uri: 'file:///data/user/0/com.routes/cache/mock_photo.jpg',
          base64: 'MOCK_BASE64',
          width: 1280,
          height: 960,
          fileSize: 150000,
        },
      ],
    });
  }),
  launchImageLibrary: jest.fn(),
}));

// Mock global do react-native-fs
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  exists: jest.fn(async () => true),
  mkdir: jest.fn(async () => true),
  copyFile: jest.fn(async () => true),
  unlink: jest.fn(async () => true),
  stat: jest.fn(async () => ({ size: 1024 })),
}));

