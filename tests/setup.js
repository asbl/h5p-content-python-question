import { afterEach, vi } from 'vitest';

const missingTranslation = (key, library = '') => `[Missing translation ${library}:${key}]`;

class BaseCodeQuestion {
  constructor(params = {}, contentId, extras = {}) {
    this.params = params;
    this.contentId = contentId;
    this.extras = extras;
    this.l10n = { parentValue: 'parent' };
  }

  getCodeTesterFactory() {
    return {
      create: vi.fn(() => ({ type: 'tester' })),
    };
  }

  getCodeContainerOptions() {
    return { fromParent: true };
  }
}

globalThis.H5P = {
  t: vi.fn((key, _params, library) => missingTranslation(key, library)),
  createUUID: vi.fn(() => 'uuid'),
  CodeQuestion: BaseCodeQuestion,
  CodeTesterFactory: class {},
};

afterEach(() => {
  globalThis.H5P.t.mockReset();
  globalThis.H5P.t.mockImplementation((key, _params, library) => missingTranslation(key, library));
  globalThis.H5P.createUUID.mockClear();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});