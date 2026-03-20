/**
 * Unit tests for LookBook PWA core utility methods.
 *
 * These tests exercise the pure logic methods of LookbookApp that do not
 * depend on live DOM rendering, Firebase, or camera APIs.
 */

// ---------------------------------------------------------------------------
// Minimal browser-environment stubs required by app.js bootstrap code
// ---------------------------------------------------------------------------
global.firebase = {
    auth: () => ({ onAuthStateChanged: () => {} }),
    firestore: () => ({}),
};

// Prevent DOMContentLoaded auto-init from firing during tests
// (jsdom fires the event synchronously, so we override addEventListener to
//  swallow the 'DOMContentLoaded' listener that creates a real LookbookApp)
const _origAdd = document.addEventListener.bind(document);
document.addEventListener = (type, handler, opts) => {
    if (type === 'DOMContentLoaded') return; // skip auto-init
    _origAdd(type, handler, opts);
};

// Suppress expected console noise from constructor / init
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Load app.js after the stubs are in place
const { LookbookApp } = require('../app.js');

// ---------------------------------------------------------------------------
// Helper – create a bare-minimum LookbookApp instance without running init()
// ---------------------------------------------------------------------------
function makeApp(overrides = {}) {
    // Patch init so the constructor does not trigger async Firebase/DOM code
    const origInit = LookbookApp.prototype.init;
    LookbookApp.prototype.init = async () => {};
    const app = new LookbookApp();
    LookbookApp.prototype.init = origInit;
    Object.assign(app, overrides);
    return app;
}

// ---------------------------------------------------------------------------
// getStorageKey
// ---------------------------------------------------------------------------
describe('getStorageKey', () => {
    it('returns namespaced key when user is set', () => {
        const app = makeApp({ user: { uid: 'user123' } });
        expect(app.getStorageKey('categories')).toBe('lookbook_user123_categories');
    });

    it('returns legacy key when no user is set', () => {
        const app = makeApp({ user: null });
        expect(app.getStorageKey('articles')).toBe('lookbook_articles');
    });
});

// ---------------------------------------------------------------------------
// isMobile
// ---------------------------------------------------------------------------
describe('isMobile', () => {
    const originalUserAgent = navigator.userAgent;
    const originalInnerWidth = window.innerWidth;

    afterEach(() => {
        // Restore originals
        Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window, 'innerWidth', {
            value: originalInnerWidth,
            writable: true,
            configurable: true,
        });
    });

    it('returns true for a mobile user-agent string', () => {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
            writable: true,
            configurable: true,
        });
        const app = makeApp();
        expect(app.isMobile()).toBe(true);
    });

    it('returns true when window.innerWidth is 375 (narrow viewport)', () => {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit',
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window, 'innerWidth', {
            value: 375,
            writable: true,
            configurable: true,
        });
        const app = makeApp();
        expect(app.isMobile()).toBe(true);
    });

    it('returns false for a desktop user-agent with wide viewport', () => {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit',
            writable: true,
            configurable: true,
        });
        Object.defineProperty(window, 'innerWidth', {
            value: 1440,
            writable: true,
            configurable: true,
        });
        const app = makeApp();
        expect(app.isMobile()).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// loadFromLocalStorage
// ---------------------------------------------------------------------------
describe('loadFromLocalStorage', () => {
    beforeEach(() => localStorage.clear());

    it('returns parsed array when valid JSON is stored', () => {
        const app = makeApp({ user: null });
        const data = [{ id: '1', name: 'Jeans' }];
        localStorage.setItem('lookbook_articles', JSON.stringify(data));
        expect(app.loadFromLocalStorage('articles')).toEqual(data);
    });

    it('returns empty array when key is not present', () => {
        const app = makeApp({ user: null });
        expect(app.loadFromLocalStorage('outfits')).toEqual([]);
    });

    it('returns empty array and warns when stored JSON is invalid', () => {
        const app = makeApp({ user: null });
        localStorage.setItem('lookbook_categories', 'not-valid-json{{{');
        const result = app.loadFromLocalStorage('categories');
        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// findOutfitById
// ---------------------------------------------------------------------------
describe('findOutfitById', () => {
    const outfit1 = { id: 'o1', name: 'Summer Casual' };
    const outfit2 = { id: 'o2', name: 'Winter Formal' };

    it('finds an outfit from the global outfits array', () => {
        const app = makeApp({ outfits: [outfit1, outfit2], categories: [] });
        expect(app.findOutfitById('o1')).toEqual(outfit1);
    });

    it('falls back to category-embedded outfits', () => {
        const category = { id: 'c1', name: 'Work', outfits: [outfit2] };
        const app = makeApp({ outfits: [], categories: [category] });
        expect(app.findOutfitById('o2')).toEqual(outfit2);
    });

    it('returns null when the outfit does not exist', () => {
        const app = makeApp({ outfits: [outfit1], categories: [] });
        expect(app.findOutfitById('missing')).toBeNull();
    });

    it('returns null gracefully when outfits is not an array', () => {
        const app = makeApp({ outfits: null, categories: [] });
        expect(app.findOutfitById('o1')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// saveToLocalStorage
// ---------------------------------------------------------------------------
describe('saveToLocalStorage', () => {
    beforeEach(() => localStorage.clear());

    it('persists all four data types to localStorage', () => {
        const app = makeApp({
            user: null,
            categories: [{ id: 'c1' }],
            articles: [{ id: 'a1' }],
            outfits: [{ id: 'o1' }],
            collections: [{ id: 'col1' }],
        });
        app.saveToLocalStorage();

        expect(JSON.parse(localStorage.getItem('lookbook_categories'))).toEqual([{ id: 'c1' }]);
        expect(JSON.parse(localStorage.getItem('lookbook_articles'))).toEqual([{ id: 'a1' }]);
        expect(JSON.parse(localStorage.getItem('lookbook_outfits'))).toEqual([{ id: 'o1' }]);
        expect(JSON.parse(localStorage.getItem('lookbook_collections'))).toEqual([{ id: 'col1' }]);
    });

    it('uses user-namespaced keys when user is signed in', () => {
        const app = makeApp({
            user: { uid: 'u42' },
            categories: [],
            articles: [],
            outfits: [],
            collections: [],
        });
        app.saveToLocalStorage();
        expect(localStorage.getItem('lookbook_u42_categories')).toBe('[]');
    });
});
