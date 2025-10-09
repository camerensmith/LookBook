// Lookbook PWA - Main Application Logic

class LookbookApp {
    constructor() {
        this.user = null;
        this.categories = [];
        this.articles = [];
        this.outfits = [];
        this.collections = [];
        this.currentView = 'categories';
        this.currentCategory = null;
        this.currentOutfit = null;
        this.currentCollection = null;
        this.navigationHistory = [];
        this.selectedTags = [];
        this.currentCollectionIcon = null;
        this.selectedOutfits = [];
        this.selectedCategories = [];
        this.editingOutfit = null;
        this.editingOutfitItems = [];
        this.editingOutfitChanged = false;
        this.cameraStream = null;
        this.capturedImage = null;
        this.processedImage = null;
        this.currentOutfitItems = [];
        this.currentEditingImage = null;
        this.editingCanvas = null;
        this.editingContext = null;
        this.currentTool = 'brush';
        this.brushSize = 20;
        this.isDrawing = false;
        this.isEditingOutfit = false;
        this.editingOutfitId = null;
        this.currentCategoryIcon = null;
        this.currentOutfitSlots = { head: null, jacket: null, body: null, legs: null, feet: null, accessory: null };
        
        // Firestore
        this.db = null;
        this.syncStatus = 'offline'; // offline, syncing, synced, error
        
        console.log('LookbookApp initialized with:', {
            categories: this.categories.length,
            articles: this.articles.length,
            outfits: this.outfits.length
        });
        
        this.init();
    }

    async init() {
        try {
            this.optimizeForMobile();
            this.bindEvents();
            
            // Load data asynchronously
            await this.loadData();
            
            // Defer heavy operations for mobile performance
            if (this.isMobile()) {
                // Load critical UI first
                this.renderCategories();
                
                // Defer non-critical operations
                setTimeout(() => {
                    this.renderArticles();
                    this.updateCategorySelect();
                }, 100);
            } else {
                this.renderCategories();
                this.renderArticles();
                this.updateCategorySelect();
            }
            
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    }
    
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 768;
    }
    
    // Mobile performance optimizations
    optimizeForMobile() {
        if (this.isMobile()) {
            // Reduce animation complexity on mobile
            document.documentElement.style.setProperty('--animation-duration', '0.2s');
            
            // Optimize touch events
            document.addEventListener('touchstart', () => {}, { passive: true });
            document.addEventListener('touchmove', () => {}, { passive: true });
            
            // Reduce memory usage
            this.batchSize = 3; // Smaller batches for mobile
        } else {
            this.batchSize = 5; // Larger batches for desktop
        }
    }

    // ===== Auth + Storage =====
    getStorageKey(base) {
        // Namespace by user uid if signed in; otherwise use legacy keys
        if (this.user && this.user.uid) return `lookbook_${this.user.uid}_${base}`;
        return `lookbook_${base}`;
    }
    
    // ===== Firestore Methods =====
    initFirestore() {
        try {
            if (firebase && firebase.firestore) {
                this.db = firebase.firestore();
                console.log('Firestore initialized');
                return true;
            } else {
                console.warn('Firestore not available');
                return false;
            }
        } catch (error) {
            console.error('Error initializing Firestore:', error);
            return false;
        }
    }
    
    updateSyncStatus(status, message = '') {
        this.syncStatus = status;
        const syncElement = document.getElementById('syncStatus');
        if (!syncElement) return;
        
        syncElement.className = `sync-status ${status}`;
        
        const textElement = syncElement.querySelector('.sync-text');
        if (textElement) {
            switch (status) {
                case 'offline':
                    textElement.textContent = 'Offline';
                    break;
                case 'syncing':
                    textElement.textContent = message || 'Syncing...';
                    break;
                case 'synced':
                    textElement.textContent = 'Synced';
                    break;
                case 'error':
                    textElement.textContent = message || 'Sync Error';
                    break;
            }
        }
        
        // Show/hide based on status
        if (status === 'offline' || status === 'synced') {
            syncElement.classList.add('hidden');
        } else {
            syncElement.classList.remove('hidden');
        }
    }
    
    async saveToFirestore(collection, data) {
        if (!this.db || !this.user) {
            console.log('Firestore not available or user not signed in, using localStorage');
            console.log('DB available:', !!this.db, 'User signed in:', !!this.user);
            return false;
        }
        
        try {
            this.updateSyncStatus('syncing', 'Saving...');
            console.log(`Attempting to save ${collection} to Firestore for user:`, this.user.uid);
            
            const docRef = this.db.collection('users').doc(this.user.uid).collection(collection).doc('data');
            console.log('Document reference:', docRef.path);
            
            await docRef.set({
                data: data,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                userId: this.user.uid
            });
            
            this.updateSyncStatus('synced');
            console.log(`✅ Data saved to Firestore: ${collection}`, data);
            return true;
        } catch (error) {
            console.error(`❌ Error saving to Firestore (${collection}):`, error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                user: this.user?.uid,
                collection: collection
            });
            this.updateSyncStatus('error', `Save failed: ${error.message}`);
            return false;
        }
    }
    
    async loadFromFirestore(collection) {
        if (!this.db || !this.user) {
            console.log('Firestore not available or user not signed in, using localStorage');
            return null;
        }
        
        try {
            this.updateSyncStatus('syncing', 'Loading...');
            
            const docRef = this.db.collection('users').doc(this.user.uid).collection(collection).doc('data');
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                this.updateSyncStatus('synced');
                console.log(`Data loaded from Firestore: ${collection}`);
                return data.data || [];
            } else {
                this.updateSyncStatus('synced');
                console.log(`No data found in Firestore: ${collection}`);
                return [];
            }
        } catch (error) {
            console.error(`Error loading from Firestore (${collection}):`, error);
            this.updateSyncStatus('error', 'Load failed');
            return null;
        }
    }

    async loadData() {
        try {
            // Try to load from Firestore first if user is signed in
            if (this.user && this.db) {
                console.log('Loading data from Firestore...');
                
                const [firestoreCategories, firestoreArticles, firestoreOutfits, firestoreCollections] = await Promise.all([
                    this.loadFromFirestore('categories'),
                    this.loadFromFirestore('articles'),
                    this.loadFromFirestore('outfits'),
                    this.loadFromFirestore('collections')
                ]);
                
                // Use Firestore data if available, otherwise fall back to localStorage
                this.categories = firestoreCategories !== null ? firestoreCategories : this.loadFromLocalStorage('categories');
                this.articles = firestoreArticles !== null ? firestoreArticles : this.loadFromLocalStorage('articles');
                this.outfits = firestoreOutfits !== null ? firestoreOutfits : this.loadFromLocalStorage('outfits');
                this.collections = firestoreCollections !== null ? firestoreCollections : this.loadFromLocalStorage('collections');
                
                // If we got data from Firestore, also save it to localStorage as backup
                if (firestoreCategories !== null || firestoreArticles !== null || firestoreOutfits !== null) {
                    this.saveToLocalStorage();
                }
            } else {
                // Fall back to localStorage
                console.log('Loading data from localStorage...');
                this.categories = this.loadFromLocalStorage('categories');
                this.articles = this.loadFromLocalStorage('articles');
                this.outfits = this.loadFromLocalStorage('outfits');
                this.collections = this.loadFromLocalStorage('collections');
            }

            console.log('Data loaded', {
                user: this.user ? this.user.uid : 'guest',
                categories: this.categories.length,
                articles: this.articles.length,
                outfits: this.outfits.length,
                collections: this.collections.length,
                source: this.user && this.db ? 'Firestore' : 'localStorage',
                categoriesData: this.categories
            });
        } catch (error) {
            console.error('Error loading data:', error);
            // Initialize with empty arrays to prevent app crash
            this.categories = [];
            this.articles = [];
            this.outfits = [];
        }
    }
    
    loadFromLocalStorage(type) {
        try {
            const key = this.getStorageKey(type);
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            console.warn(`Failed to load ${type} from localStorage, using empty array`);
            return [];
        }
    }
    
    saveToLocalStorage() {
        try {
            localStorage.setItem(this.getStorageKey('categories'), JSON.stringify(this.categories));
            localStorage.setItem(this.getStorageKey('articles'), JSON.stringify(this.articles));
            localStorage.setItem(this.getStorageKey('outfits'), JSON.stringify(this.outfits));
            localStorage.setItem(this.getStorageKey('collections'), JSON.stringify(this.collections));
            console.log('Data saved to localStorage as backup');
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }

    migrateDataToUserNamespace(uid) {
        try {
            const legacy = {
                categories: JSON.parse(localStorage.getItem('lookbook_categories') || '[]'),
                articles: JSON.parse(localStorage.getItem('lookbook_articles') || '[]'),
                outfits: JSON.parse(localStorage.getItem('lookbook_outfits') || '[]')
            };

            const userCatKey = `lookbook_${uid}_categories`;
            const userArtKey = `lookbook_${uid}_articles`;
            const userOutKey = `lookbook_${uid}_outfits`;

            const userHasData = (
                localStorage.getItem(userCatKey) ||
                localStorage.getItem(userArtKey) ||
                localStorage.getItem(userOutKey)
            );

            if (!userHasData && (legacy.categories.length || legacy.articles.length || legacy.outfits.length)) {
                localStorage.setItem(userCatKey, JSON.stringify(legacy.categories));
                localStorage.setItem(userArtKey, JSON.stringify(legacy.articles));
                localStorage.setItem(userOutKey, JSON.stringify(legacy.outfits));
                console.log('Migrated legacy local data to user namespace');
            }
        } catch (error) {
            console.error('Error migrating data to user namespace:', error);
        }
    }

    bindEvents() {
        try {
            // Navigation events
            const navButtons = document.querySelectorAll('.nav-btn');
            console.log('Found nav buttons:', navButtons.length);
            
            navButtons.forEach(btn => {
                // Add touchstart for immediate mobile response
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const button = e.target.closest('.nav-btn');
                    const action = button ? button.dataset.action : e.target.dataset.action;
                    console.log('Navigation touched:', action);
                    if (action) {
                        // Add immediate visual feedback
                        button.style.transform = 'scale(0.95)';
                        button.style.opacity = '0.8';
                        this.navigateTo(action);
                    }
                }, { passive: false });
                
                // Keep click for desktop and as fallback
                btn.addEventListener('click', (e) => {
                    // Handle clicks on child elements (like spans)
                    const button = e.target.closest('.nav-btn');
                    const action = button ? button.dataset.action : e.target.dataset.action;
                    console.log('Navigation clicked:', action);
                    if (action) {
                        this.navigateTo(action);
                    } else {
                        console.error('No action found for navigation button:', e.target);
                    }
                });
                
                // Reset visual state on touchend
                btn.addEventListener('touchend', (e) => {
                    const button = e.target.closest('.nav-btn');
                    if (button) {
                        button.style.transform = '';
                        button.style.opacity = '';
                    }
                });
            });

            // Back button events
            const backButtons = document.querySelectorAll('.back-btn');
            console.log('Found back buttons:', backButtons.length);
            
            backButtons.forEach(btn => {
                // Add touchstart for immediate mobile response
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const button = e.target.closest('.back-btn');
                    const backTo = button ? button.dataset.back : e.target.dataset.back;
                    console.log('Back button touched:', backTo);
                    if (backTo) {
                        // Add immediate visual feedback
                        button.style.transform = 'scale(0.95)';
                        button.style.opacity = '0.8';
                        this.navigateBack();
                    }
                }, { passive: false });
                
                // Keep click for desktop and as fallback
                btn.addEventListener('click', (e) => {
                    // Handle clicks on child elements (like spans)
                    const button = e.target.closest('.back-btn');
                    const backTo = button ? button.dataset.back : e.target.dataset.back;
                    console.log('Back button clicked:', backTo);
                    if (backTo) {
                        // Use smart back navigation for better UX
                        this.navigateBack();
                    } else {
                        console.error('No back target found for back button:', e.target);
                    }
                });
                
                // Reset visual state on touchend
                btn.addEventListener('touchend', (e) => {
                    const button = e.target.closest('.back-btn');
                    if (button) {
                        button.style.transform = '';
                        button.style.opacity = '';
                    }
                });
            });

            // Form submissions
            const categoryForm = document.getElementById('categoryForm');
            if (categoryForm) {
                categoryForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    console.log('Category form submitted');
                    this.createCategory();
                });
            } else {
                console.error('Category form not found');
            }

            // Category icon upload events
            const categoryIconInput = document.getElementById('categoryIcon');
            const categoryIconPreview = document.getElementById('categoryIconPreview');
            const categoryIconImg = document.getElementById('categoryIconImg');
            const removeCategoryIconBtn = document.getElementById('removeCategoryIcon');

            if (categoryIconInput && categoryIconPreview && categoryIconImg && removeCategoryIconBtn) {
                categoryIconInput.addEventListener('change', (e) => {
                    this.handleCategoryIconUpload(e);
                });

                removeCategoryIconBtn.addEventListener('click', () => {
                    this.removeCategoryIcon();
                });
            }

            const articleForm = document.getElementById('articleForm');
            if (articleForm) {
                articleForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    console.log('Article form submitted');
                    this.saveArticle();
                });
            } else {
                console.error('Article form not found');
            }

            const outfitForm = document.getElementById('outfitForm');
            if (outfitForm) {
                outfitForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    console.log('Outfit form submitted');
                    this.saveOutfit();
                });
            } else {
                console.error('Outfit form not found');
            }

            // Camera events
            const cameraBtn = document.getElementById('cameraBtn');
            if (cameraBtn) {
                cameraBtn.addEventListener('click', () => {
                    console.log('Camera button clicked');
                    this.openCamera();
                });
            }

            const captureBtn = document.getElementById('captureBtn');
            if (captureBtn) {
                captureBtn.addEventListener('click', () => {
                    console.log('Capture button clicked');
                    this.capturePhoto();
                });
            }

            const closeCameraBtn = document.getElementById('closeCameraBtn');
            if (closeCameraBtn) {
                closeCameraBtn.addEventListener('click', () => {
                    console.log('Close camera button clicked');
                    this.closeCamera();
                });
            }

            const retakeBtn = document.getElementById('retakeBtn');
            if (retakeBtn) {
                retakeBtn.addEventListener('click', () => {
                    console.log('Retake button clicked');
                    this.retakePhoto();
                });
            }

            const processBtn = document.getElementById('processBtn');
            if (processBtn) {
                processBtn.addEventListener('click', () => {
                    console.log('Process button clicked');
                    this.removeBackground();
                });
            }

            const reprocessBtn = document.getElementById('reprocessBtn');
            if (reprocessBtn) {
                reprocessBtn.addEventListener('click', () => {
                    console.log('Reprocess button clicked');
                    this.removeBackground();
                });
            }

            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    console.log('Save button clicked');
                    this.showArticleForm();
                });
            }

            // Outfit builder events
            const searchArticles = document.getElementById('searchArticles');
            if (searchArticles) {
                let searchDebounce;
                searchArticles.addEventListener('input', (e) => {
                    const term = e.target.value;
                    // dynamic filter as you type with small debounce for perf
                    clearTimeout(searchDebounce);
                    searchDebounce = setTimeout(() => {
                        this.renderArticles();
                    }, 120);
                });
            }
            
            // Add event listener for "All" tag filter
            const allTagFilter = document.querySelector('.tag-filter-btn[data-tag="all"]');
            if (allTagFilter) {
                allTagFilter.addEventListener('click', () => this.selectTagFilter('all'));
            }
            
            // Initialize long press functionality
            this.initLongPress();
            
            // Save outfit modal events
            this.bindSaveOutfitModalEvents();
            
            // Tag search events
            this.bindTagSearchEvents();
            
            // Collection icon events
            this.bindCollectionIconEvents();
            
            // Outfit selection modal events
            this.bindOutfitSelectionEvents();
            
            // Category selection modal events
            this.bindCategorySelectionEvents();
            
            // Edit outfit modal events
            this.bindEditOutfitEvents();

            const clearOutfitBtn = document.getElementById('clearOutfitBtn');
            if (clearOutfitBtn) {
                clearOutfitBtn.addEventListener('click', () => {
                    console.log('Clear outfit button clicked');
                    this.clearOutfit();
                    this.clearSlots();
                });
            }

            const addExistingOutfitsBtn = document.getElementById('addExistingOutfitsBtn');
            if (addExistingOutfitsBtn) {
                addExistingOutfitsBtn.addEventListener('click', () => {
                    console.log('Add existing outfits button clicked');
                    this.showSelectOutfitsModal();
                });
            }

            const saveOutfitBtn = document.getElementById('saveOutfitBtn');
            if (saveOutfitBtn) {
                saveOutfitBtn.addEventListener('click', () => {
                    console.log('Save outfit button clicked');
                    this.showSaveOutfitModal();
                });
            }

            // Outfit actions
            const editOutfitBtn = document.getElementById('editOutfitBtn');
            if (editOutfitBtn) {
                editOutfitBtn.addEventListener('click', () => {
                    console.log('Edit outfit button clicked');
                    this.editOutfit();
                });
            }

            const deleteOutfitBtn = document.getElementById('deleteOutfitBtn');
            if (deleteOutfitBtn) {
                deleteOutfitBtn.addEventListener('click', () => {
                    console.log('Delete outfit button clicked');
                    this.deleteOutfit();
                });
            }

            // Initialize drag and drop
            this.initDragAndDrop();

            // File upload events
            const fileInput = document.getElementById('fileInput');
            const uploadBtn = document.getElementById('uploadBtn');
            if (fileInput && uploadBtn) {
                uploadBtn.addEventListener('click', () => fileInput.click());
                fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
            }

            // Image editor events
            this.initImageEditor();

            // Auth UI events
            const authBtn = document.getElementById('authBtn');
            if (authBtn) {
                authBtn.addEventListener('click', async () => {
                    if (this.user) {
                        try {
                            await firebase.auth().signOut();
                        } catch (err) {
                            console.error('Sign out error:', err);
                        }
                    } else {
                        const modal = document.getElementById('authModal');
                        if (modal) modal.classList.remove('hidden');
                    }
                });
            }

            const closeAuthBtn = document.getElementById('closeAuthBtn');
            if (closeAuthBtn) {
                closeAuthBtn.addEventListener('click', () => {
                    const modal = document.getElementById('authModal');
                    if (modal) modal.classList.add('hidden');
                });
            }

            const googleBtn = document.getElementById('googleSignInBtn');
            if (googleBtn) {
                googleBtn.addEventListener('click', async () => {
                    try {
                        console.log('Google sign-in button clicked');
                        console.log('Firebase app:', firebase.app());
                        console.log('Firebase auth:', firebase.auth());
                        
                        const provider = new firebase.auth.GoogleAuthProvider();
                        console.log('Google provider created:', provider);
                        
                        // Try popup first, fallback to redirect if popup fails
                        try {
                            console.log('Attempting popup sign-in...');
                            const result = await firebase.auth().signInWithPopup(provider);
                            console.log('Popup sign-in successful:', result);
                        } catch (popupError) {
                            console.warn('Popup failed, trying redirect:', popupError);
                            console.log('Error details:', {
                                code: popupError.code,
                                message: popupError.message,
                                email: popupError.email,
                                credential: popupError.credential
                            });
                            await firebase.auth().signInWithRedirect(provider);
                        }
                    } catch (err) {
                        console.error('Google sign-in error:', err);
                        console.log('Full error object:', err);
                        alert(`Google sign-in failed: ${err.message || err.code || 'Unknown error'}`);
                    }
                });
            }

            const appleBtn = document.getElementById('appleSignInBtn');
            if (appleBtn) {
                appleBtn.addEventListener('click', async () => {
                    try {
                        const provider = new firebase.auth.OAuthProvider('apple.com');
                        provider.addScope('email');
                        provider.addScope('name');
                        await firebase.auth().signInWithPopup(provider);
                    } catch (err) {
                        console.error('Apple sign-in error:', err);
                        alert('Apple sign-in failed (requires Apple setup).');
                    }
                });
            }

            const emailBtn = document.getElementById('emailAuthBtn');
            const toggleModeBtn = document.getElementById('toggleAuthModeBtn');
            const emailInput = document.getElementById('authEmail');
            const passInput = document.getElementById('authPassword');
            let isSignupMode = false;
            if (toggleModeBtn) {
                toggleModeBtn.addEventListener('click', () => {
                    isSignupMode = !isSignupMode;
                    toggleModeBtn.textContent = isSignupMode ? 'Switch to Sign in' : 'Switch to Sign up';
                    if (emailBtn) emailBtn.textContent = isSignupMode ? 'Sign up' : 'Sign in';
                });
            }
            if (emailBtn) {
                emailBtn.addEventListener('click', async () => {
                    const email = emailInput ? emailInput.value.trim() : '';
                    const password = passInput ? passInput.value : '';
                    if (!email || !password) { alert('Enter email and password'); return; }
                    try {
                        if (isSignupMode) {
                            await firebase.auth().createUserWithEmailAndPassword(email, password);
                        } else {
                            await firebase.auth().signInWithEmailAndPassword(email, password);
                        }
                    } catch (err) {
                        console.error('Email auth error:', err);
                        alert(err.message || 'Email auth failed.');
                    }
                });
            }
            
            console.log('All events bound successfully');
        } catch (error) {
            console.error('Error binding events:', error);
        }
    }

    navigateTo(view) {
        try {
            console.log('Navigating to:', view);
            // Normalize incoming view keys (support kebab-case buttons and short aliases)
            const mapViewKey = (key) => {
                if (!key) return '';
                const map = {
                    'categories': 'categories',
                    'create-category': 'createCategory',
                    'createCategory': 'createCategory',
                    'add-outfit': 'addOutfit',
                    'addOutfit': 'addOutfit',
                    'add-article': 'addArticle',
                    'addArticle': 'addArticle',
                    'view-articles': 'viewArticles',
                    'viewArticles': 'viewArticles',
                    'category': 'categoryDetail',
                    'categoryDetail': 'categoryDetail',
                    'outfit': 'outfitDetail',
                    'outfitDetail': 'outfitDetail',
                    'collections': 'collections',
                    'collectionDetail': 'collectionDetail'
                };
                return map[key] || key;
            };

            const normalized = mapViewKey(view);
            
            // Add current view to history before navigating (except for back navigation)
            if (this.currentView && this.currentView !== normalized && !view.startsWith('back-')) {
                this.navigationHistory.push({
                    view: this.currentView,
                    category: this.currentCategory,
                    collection: this.currentCollection
                });
                console.log('Added to navigation history:', this.currentView, 'History length:', this.navigationHistory.length);
            }
            
            // Hide all views
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            // Show target view
            const targetId = normalized.endsWith('View') ? normalized : (normalized + 'View');
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.add('active');
                this.currentView = normalized;
                console.log('Successfully navigated to:', normalized);
            } else {
                console.error('Target view not found:', targetId);
            }

            // Handle specific view logic
            switch (normalized) {
                case 'categories':
                    // Ensure fresh data is loaded when navigating to categories
                    this.loadData().then(() => {
                        this.renderCategories();
                    }).catch(error => {
                        console.error('Error loading data for categories view:', error);
                        // Still render with current data
                        this.renderCategories();
                    });
                    break;
                case 'addOutfit':
                    this.renderArticles();
                    this.populateTagFilters();
                    this.renderCreatedOutfits();
                    break;
                case 'addArticle':
                    this.resetArticleForm();
                    break;
                case 'viewArticles':
                    this.renderArticlesGrid();
                    break;
                case 'collections':
                    this.renderCollections();
                    break;
                case 'createCollection':
                    this.showCreateCollectionForm();
                    break;
                case 'collectionDetail':
                    this.renderCollectionDetail();
                    break;
            }
        } catch (error) {
            console.error('Error navigating to view:', error);
        }
    }
    
    // Handle back navigation with history
    navigateBack() {
        try {
            console.log('NavigateBack called. History length:', this.navigationHistory.length);
            console.log('Current view:', this.currentView);
            console.log('History:', this.navigationHistory);
            
            if (this.navigationHistory.length > 0) {
                const previousState = this.navigationHistory.pop();
                console.log('Navigating back to:', previousState);
                
                // Restore previous state
                if (previousState.category) {
                    this.currentCategory = previousState.category;
                }
                if (previousState.collection) {
                    this.currentCollection = previousState.collection;
                }
                
                // Navigate to previous view without adding to history (to avoid infinite loops)
                this.navigateToWithoutHistory(previousState.view);
            } else {
                console.log('No history, falling back to categories');
                // Fallback to categories if no history
                this.navigateTo('categories');
            }
        } catch (error) {
            console.error('Error navigating back:', error);
            this.navigateTo('categories');
        }
    }
    
    // Navigate without adding to history (for back navigation)
    navigateToWithoutHistory(view) {
        try {
            console.log('Navigating to (no history):', view);
            
            // Normalize incoming view keys
            const mapViewKey = (key) => {
                if (!key) return '';
                const map = {
                    'categories': 'categories',
                    'create-category': 'createCategory',
                    'createCategory': 'createCategory',
                    'add-outfit': 'addOutfit',
                    'addOutfit': 'addOutfit',
                    'add-article': 'addArticle',
                    'addArticle': 'addArticle',
                    'view-articles': 'viewArticles',
                    'viewArticles': 'viewArticles',
                    'category': 'categoryDetail',
                    'categoryDetail': 'categoryDetail',
                    'outfit': 'outfitDetail',
                    'outfitDetail': 'outfitDetail',
                    'collections': 'collections',
                    'collectionDetail': 'collectionDetail'
                };
                return map[key] || key;
            };

            const normalized = mapViewKey(view);
            
            // Hide all views
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            // Show target view
            const targetId = normalized.endsWith('View') ? normalized : (normalized + 'View');
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.add('active');
                this.currentView = normalized;
                console.log('Successfully navigated to (no history):', normalized);
            } else {
                console.error('Target view not found:', targetId);
            }

            // Handle specific view logic
            switch (normalized) {
                case 'categories':
                    this.renderCategories();
                    break;
                case 'addOutfit':
                    this.renderArticles();
                    this.populateTagFilters();
                    this.renderCreatedOutfits();
                    break;
                case 'addArticle':
                    this.resetArticleForm();
                    break;
                case 'viewArticles':
                    this.renderArticlesGrid();
                    break;
                case 'collections':
                    this.renderCollections();
                    break;
                case 'createCollection':
                    this.showCreateCollectionForm();
                    break;
                case 'collectionDetail':
                    this.renderCollectionDetail();
                    break;
            }
        } catch (error) {
            console.error('Error navigating to view (no history):', error);
        }
    }

    // Category Management
    createCategory() {
        try {
            const nameInput = document.getElementById('categoryName');
            const tagsInput = document.getElementById('categoryTags');
            
            if (!nameInput) {
                console.error('Category name input not found');
                return;
            }
            
            const name = nameInput.value.trim();
            const tags = tagsInput ? tagsInput.value.trim() : '';
            console.log('Creating category:', name);
            
            if (!name) {
                this.showToast('Please enter a category name', 'error');
                return;
            }

            const category = {
                id: Date.now().toString(),
                name: name,
                tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [],
                icon: this.currentCategoryIcon || null, // Add icon if uploaded
                outfits: [],
                createdAt: new Date().toISOString()
            };

            this.categories.push(category);
            this.saveData();
            this.updateCategorySelect();
            this.navigateTo('categories');
            
            // Reset form
            nameInput.value = '';
            if (tagsInput) tagsInput.value = '';
            this.removeCategoryIcon();
            
            console.log('Category created successfully:', category);
            this.showToast('Category created successfully!');
        } catch (error) {
            console.error('Error creating category:', error);
            this.showToast('Error creating category. Please try again.', 'error');
        }
    }

    handleCategoryIconUpload(event) {
        try {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.currentCategoryIcon = e.target.result;
                    this.showCategoryIconPreview(e.target.result);
                };
                reader.readAsDataURL(file);
            }
        } catch (error) {
            console.error('Error handling category icon upload:', error);
        }
    }

    showCategoryIconPreview(imageData) {
        try {
            const preview = document.getElementById('categoryIconPreview');
            const img = document.getElementById('categoryIconImg');
            
            if (preview && img) {
                img.src = imageData;
                preview.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error showing category icon preview:', error);
        }
    }

    removeCategoryIcon() {
        try {
            this.currentCategoryIcon = null;
            
            const preview = document.getElementById('categoryIconPreview');
            const input = document.getElementById('categoryIcon');
            
            if (preview && input) {
                preview.classList.add('hidden');
                input.value = '';
            }
        } catch (error) {
            console.error('Error removing category icon:', error);
        }
    }

    // Article Management
    async openCamera() {
        try {
            console.log('Opening camera...');
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            
            const video = document.getElementById('cameraVideo');
            if (video) {
                video.srcObject = this.cameraStream;
                document.getElementById('cameraModal').classList.remove('hidden');
                console.log('Camera opened successfully');
            } else {
                console.error('Camera video element not found');
            }
        } catch (error) {
            console.error('Camera access error:', error);
            alert('Unable to access camera. Please ensure camera permissions are granted.');
        }
    }

    closeCamera() {
        try {
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.stop());
                this.cameraStream = null;
            }
            const modal = document.getElementById('cameraModal');
            if (modal) {
                modal.classList.add('hidden');
            }
            console.log('Camera closed');
        } catch (error) {
            console.error('Error closing camera:', error);
        }
    }

    capturePhoto() {
        try {
            const video = document.getElementById('cameraVideo');
            if (!video) {
                console.error('Camera video element not found');
                return;
            }
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            
            this.capturedImage = canvas.toDataURL('image/jpeg');
            this.closeCamera();
            
            // Open image editor instead of showing preview
            this.openImageEditor(this.capturedImage);
            console.log('Photo captured successfully');
        } catch (error) {
            console.error('Error capturing photo:', error);
        }
    }

    retakePhoto() {
        try {
            this.capturedImage = null;
            const preview = document.getElementById('cameraPreview');
            const processed = document.getElementById('processedImage');
            const form = document.getElementById('articleForm');
            
            if (preview) preview.classList.add('hidden');
            if (processed) processed.classList.add('hidden');
            if (form) form.classList.add('hidden');
            
            console.log('Photo retaken');
        } catch (error) {
            console.error('Error retaking photo:', error);
        }
    }

    async removeBackground() {
        if (!this.capturedImage) return;

        try {
            console.log('Removing background...');
            this.showLoading(true);
            
            // Use a background removal service (you'll need to replace with actual API)
            // For demo purposes, we'll simulate background removal
            this.processedImage = await this.simulateBackgroundRemoval(this.capturedImage);
            
            const finalImg = document.getElementById('finalImage');
            if (finalImg) {
                finalImg.src = this.processedImage;
                document.getElementById('cameraPreview').classList.add('hidden');
                document.getElementById('processedImage').classList.remove('hidden');
                console.log('Background removed successfully');
            }
            
        } catch (error) {
            console.error('Background removal error:', error);
            alert('Failed to remove background. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    async simulateBackgroundRemoval(imageData) {
        // Use the @imgly background removal package
        try {
            console.log('Removing background with @imgly...');
            
            // Check if removeBackground function is available
            if (typeof window.removeBackground !== 'function') {
                console.warn('Background removal not available, using original image');
                return imageData;
            }
            
            const blob = await window.removeBackground(imageData);
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('Background removal failed:', error);
            console.log('Falling back to original image');
            // Fallback to original image
            return imageData;
        }
    }

    // Image Editor Methods
    initImageEditor() {
        this.editingCanvas = document.getElementById('imageCanvas');
        this.editingContext = this.editingCanvas.getContext('2d');
        
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                e.target.closest('.tool-btn').classList.add('active');
                this.currentTool = e.target.closest('.tool-btn').dataset.tool;
            });
        });

        // Brush size control
        const brushSizeSlider = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        if (brushSizeSlider && brushSizeValue) {
            brushSizeSlider.addEventListener('input', (e) => {
                this.brushSize = parseInt(e.target.value);
                brushSizeValue.textContent = this.brushSize + 'px';
            });
        }

        // Canvas drawing events
        this.editingCanvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.editingCanvas.addEventListener('mousemove', (e) => this.draw(e));
        this.editingCanvas.addEventListener('mouseup', () => this.stopDrawing());
        this.editingCanvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events for mobile
        this.editingCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.editingCanvas.dispatchEvent(mouseEvent);
        });

        this.editingCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.editingCanvas.dispatchEvent(mouseEvent);
        });

        this.editingCanvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.editingCanvas.dispatchEvent(mouseEvent);
        });

        // Editor action buttons
        const autoRemoveBtn = document.getElementById('autoRemoveBtn');
        const restoreBtn = document.getElementById('restoreBtn');
        const saveImageBtn = document.getElementById('saveImageBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        const closePreviewBtn = document.getElementById('closePreviewBtn');

        if (autoRemoveBtn) {
            autoRemoveBtn.addEventListener('click', () => this.autoRemoveBackground());
        }
        if (restoreBtn) {
            restoreBtn.addEventListener('click', () => this.restoreOriginalImage());
        }
        if (saveImageBtn) {
            saveImageBtn.addEventListener('click', () => this.saveEditedImage());
        }
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => this.closeImageEditor());
        }
        if (closePreviewBtn) {
            closePreviewBtn.addEventListener('click', () => this.closeImageEditor());
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.openImageEditor(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    }

    openImageEditor(imageData) {
        this.currentEditingImage = imageData;
        this.originalImage = imageData;
        
        // Load image into canvas
        const img = new Image();
        img.onload = () => {
            const canvas = this.editingCanvas;
            const ctx = this.editingContext;
            
            // Calculate dimensions to fit canvas while maintaining aspect ratio
            const maxWidth = canvas.width - 20;
            const maxHeight = canvas.height - 20;
            let { width, height } = img;
            
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width *= ratio;
                height *= ratio;
            }
            
            // Center the image
            const x = (canvas.width - width) / 2;
            const y = (canvas.height - height) / 2;
            
            canvas.width = canvas.width; // Clear canvas
            ctx.drawImage(img, x, y, width, height);
            
            // Store image bounds for drawing calculations
            this.imageBounds = { x, y, width, height };
        };
        img.src = imageData;
        
        // Show the editor modal
        document.getElementById('imagePreviewModal').classList.remove('hidden');
    }

    startDrawing(e) {
        this.isDrawing = true;
        this.draw(e);
    }

    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.editingCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ctx = this.editingContext;
        ctx.globalCompositeOperation = this.currentTool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.lineWidth = this.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (this.currentTool === 'brush') {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#000';
        } else {
            ctx.globalAlpha = 1;
        }
        
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.editingContext.beginPath();
        }
    }

    async autoRemoveBackground() {
        if (!this.currentEditingImage) return;
        
        try {
            this.showLoading(true);
            const processedImage = await this.simulateBackgroundRemoval(this.currentEditingImage);
            
            // Load processed image
            const img = new Image();
            img.onload = () => {
                const canvas = this.editingCanvas;
                const ctx = this.editingContext;
                
                canvas.width = canvas.width; // Clear canvas
                ctx.drawImage(img, this.imageBounds.x, this.imageBounds.y, this.imageBounds.width, this.imageBounds.height);
            };
            img.src = processedImage;
            
        } catch (error) {
            console.error('Auto background removal failed:', error);
            alert('Background removal failed. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    restoreOriginalImage() {
        if (this.originalImage) {
            this.openImageEditor(this.originalImage);
        }
    }

    saveEditedImage() {
        try {
            const nameInput = document.getElementById('editorArticleName');
            const tagsInput = document.getElementById('editorArticleTags');
            
            if (!nameInput || !nameInput.value.trim()) {
                this.showToast('Please enter an article name', 'error');
                return;
            }
            
            if (this.editingCanvas) {
                this.processedImage = this.editingCanvas.toDataURL('image/png');
                
                // Store the article details temporarily
                this.tempArticleName = nameInput.value.trim();
                this.tempArticleTags = tagsInput ? tagsInput.value.trim() : '';
                
                this.closeImageEditor();
                
                // If we have all the details, save the article directly
                if (this.tempArticleName && this.processedImage) {
                    this.saveArticleDirectly();
                } else {
                    this.showArticleForm();
                }
            }
        } catch (error) {
            console.error('Error saving edited image:', error);
            this.showToast('Error saving image. Please try again.', 'error');
        }
    }

    closeImageEditor() {
        document.getElementById('imagePreviewModal').classList.add('hidden');
        this.currentEditingImage = null;
        this.originalImage = null;
    }

    showArticleForm() {
        try {
            const form = document.getElementById('articleForm');
            if (form) {
                form.classList.remove('hidden');
                
                // Populate form with saved details if available
                const nameInput = document.getElementById('articleName');
                const tagsInput = document.getElementById('articleTags');
                
                if (nameInput && this.tempArticleName) {
                    nameInput.value = this.tempArticleName;
                }
                if (tagsInput && this.tempArticleTags) {
                    tagsInput.value = this.tempArticleTags;
                }
                
                console.log('Article form shown with pre-filled data');
            }
        } catch (error) {
            console.error('Error showing article form:', error);
        }
    }

    saveArticleDirectly() {
        try {
            if (!this.tempArticleName || !this.processedImage) {
                console.error('Missing article data for direct save');
                this.showToast('Error: Missing article data', 'error');
                return;
            }
            // Unique name validation
            const nameLower = this.tempArticleName.trim().toLowerCase();
            if (this.articles.some(a => a.name && a.name.trim().toLowerCase() === nameLower)) {
                this.showToast('An article with this name already exists', 'error');
                return;
            }
            
            const article = {
                id: Date.now().toString(),
                name: this.tempArticleName,
                tags: this.tempArticleTags ? this.tempArticleTags.split(',').map(t => t.trim()) : [],
                image: this.processedImage,
                createdAt: new Date().toISOString()
            };
            
            this.articles.push(article);
            this.saveData();
            this.resetArticleForm();
            
            // Clear temporary article details
            this.tempArticleName = null;
            this.tempArticleTags = null;
            
            console.log('Article saved directly:', article);
            this.showToast('Article saved successfully!');
            // Navigate to Closet
            this.navigateTo('view-articles');
        } catch (error) {
            console.error('Error saving article directly:', error);
            this.showToast('Error saving article. Please try again.', 'error');
        }
    }
    
    saveArticle() {
        try {
            const nameInput = document.getElementById('articleName');
            const tagsInput = document.getElementById('articleTags');
            
            if (!nameInput || !tagsInput) {
                console.error('Article form inputs not found');
                return;
            }
            
            const name = nameInput.value.trim();
            const tags = tagsInput.value.trim();
            
            console.log('Saving article:', { name, tags });
            
            if (!name || !this.processedImage) {
                this.showToast('Please provide a name and image for the article', 'error');
                return;
            }

            // Unique name validation
            const nameLower = name.trim().toLowerCase();
            if (this.articles.some(a => a.name && a.name.trim().toLowerCase() === nameLower)) {
                this.showToast('An article with this name already exists', 'error');
                return;
            }

            const article = {
                id: Date.now().toString(),
                name: name,
                tags: tags ? tags.split(',').map(t => t.trim()) : [],
                image: this.processedImage,
                createdAt: new Date().toISOString()
            };

            this.articles.push(article);
            this.saveData();
            this.resetArticleForm();
            
            // Clear temporary article details
            this.tempArticleName = null;
            this.tempArticleTags = null;
            
            console.log('Article saved successfully:', article);
            this.showToast('Article saved successfully!');
            // Navigate to Closet
            this.navigateTo('view-articles');
        } catch (error) {
            console.error('Error saving article:', error);
            this.showToast('Error saving article. Please try again.', 'error');
        }
    }

    resetArticleForm() {
        try {
            this.capturedImage = null;
            this.processedImage = null;
            
            const preview = document.getElementById('cameraPreview');
            const processed = document.getElementById('processedImage');
            const form = document.getElementById('articleForm');
            const nameInput = document.getElementById('articleName');
            const tagsInput = document.getElementById('articleTags');
            
            if (preview) preview.classList.add('hidden');
            if (processed) processed.classList.add('hidden');
            if (form) form.classList.add('hidden');
            if (nameInput) nameInput.value = '';
            if (tagsInput) tagsInput.value = '';
            
            console.log('Article form reset');
        } catch (error) {
            console.error('Error resetting article form:', error);
        }
    }

    // Outfit Management
    renderArticles() {
        try {
            const articlesList = document.getElementById('articlesList');
            if (!articlesList) {
                console.error('Articles list element not found');
                return;
            }
            
            // Get search and filter values
            const searchInput = document.getElementById('searchArticles');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            const activeTagFilter = document.querySelector('.tag-filter-btn.active');
            const selectedTag = activeTagFilter ? activeTagFilter.dataset.tag : 'all';
            
            // Filter articles
            const filteredArticles = this.articles.filter(article => {
                const matchesSearch = !searchTerm || 
                    article.name.toLowerCase().includes(searchTerm) ||
                    (article.tags && article.tags.toLowerCase().includes(searchTerm));
                
                // Check if article matches any of the selected tags
                const matchesSelectedTags = this.selectedTags.length === 0 || 
                    (article.tags && this.selectedTags.some(selectedTag => {
                        if (Array.isArray(article.tags)) {
                            return article.tags.some(tag => tag.toLowerCase().includes(selectedTag.toLowerCase()));
                        } else {
                            return article.tags.toLowerCase().includes(selectedTag.toLowerCase());
                        }
                    }));
                
                return matchesSearch && matchesSelectedTags;
            });
            
            articlesList.innerHTML = '';

            if (filteredArticles.length === 0) {
                articlesList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <span class="material-icons">search_off</span>
                        </div>
                        <h3>No Articles Found</h3>
                        <p>Try adjusting your search or filter criteria</p>
                    </div>
                `;
                return;
            }

            filteredArticles.forEach(article => {
                const articleElement = document.createElement('div');
                articleElement.className = 'article-item';
                articleElement.draggable = true;
                articleElement.dataset.articleId = article.id;
                
                // Use processed image if available, otherwise fallback to original or placeholder
                const imageSrc = article.processedImage || article.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg0MFY0MEgyMFYyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                
                articleElement.innerHTML = `
                    <img src="${imageSrc}" alt="${this.escapeHtml(article.name)}" class="article-thumbnail">
                    <div class="article-info">
                        <h4>${this.escapeHtml(article.name)}</h4>
                        <div class="tags">${this.escapeHtml(article.tags || '')}</div>
                    </div>
                `;
                
                articlesList.appendChild(articleElement);
            });
            
            console.log('Articles rendered:', filteredArticles.length, 'of', this.articles.length);
        } catch (error) {
            console.error('Error rendering articles:', error);
        }
    }

    // Populate tag filters from all articles
    populateTagFilters() {
        try {
            const tagFiltersContainer = document.querySelector('.tag-filters');
            if (!tagFiltersContainer) return;
            
            // Get all unique tags from articles
            const allTags = new Set();
            this.articles.forEach(article => {
                if (article.tags) {
                    const tags = article.tags.split(',').map(tag => tag.trim().toLowerCase());
                    tags.forEach(tag => {
                        if (tag) allTags.add(tag);
                    });
                }
            });
            
            // Clear existing filter buttons (except "All")
            const existingButtons = tagFiltersContainer.querySelectorAll('.tag-filter-btn:not([data-tag="all"])');
            existingButtons.forEach(btn => btn.remove());
            
            // Add tag filter buttons
            Array.from(allTags).sort().forEach(tag => {
                const button = document.createElement('button');
                button.className = 'tag-filter-btn';
                button.dataset.tag = tag;
                button.textContent = tag;
                button.addEventListener('click', () => this.selectTagFilter(tag));
                tagFiltersContainer.appendChild(button);
            });
        } catch (error) {
            console.error('Error populating tag filters:', error);
        }
    }
    
    // Handle tag filter selection
    selectTagFilter(tag) {
        try {
            // Update active state
            document.querySelectorAll('.tag-filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`[data-tag="${tag}"]`).classList.add('active');
            
            // Re-render articles with new filter
            this.renderArticles();
        } catch (error) {
            console.error('Error selecting tag filter:', error);
        }
    }
    
    filterArticles(searchTerm) {
        // This method is now handled by renderArticles() with filtering
        this.renderArticles();
    }
    
    // Initialize long press functionality for delete actions
    initLongPress() {
        try {
            this.longPressTimer = null;
            this.longPressDelay = 800; // 800ms for long press
            this.longPressTarget = null;
            
            // Add long press event listeners to document
            document.addEventListener('touchstart', (e) => {
                // Skip long press on delete buttons and their children
                if (e.target.closest('.delete-btn')) {
                    return;
                }
                this.handleLongPressStart(e);
            }, { passive: true });
            
            document.addEventListener('touchend', (e) => {
                this.handleLongPressEnd(e);
            }, { passive: true });
            
            document.addEventListener('touchmove', (e) => {
                this.handleLongPressCancel(e);
            }, { passive: true });
            
            console.log('Long press functionality initialized');
        } catch (error) {
            console.error('Error initializing long press:', error);
        }
    }
    
    handleLongPressStart(e) {
        try {
            const target = e.target.closest('.article-item, .outfit-item, .category-card, .created-outfit-card');
            if (!target) return;
            
            this.longPressTarget = target;
            this.longPressTimer = setTimeout(() => {
                this.triggerLongPress(target);
            }, this.longPressDelay);
            
            // Add visual feedback
            target.style.transform = 'scale(0.95)';
            target.style.opacity = '0.8';
        } catch (error) {
            console.error('Error handling long press start:', error);
        }
    }
    
    handleLongPressEnd(e) {
        try {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            if (this.longPressTarget) {
                // Reset visual feedback
                this.longPressTarget.style.transform = '';
                this.longPressTarget.style.opacity = '';
                this.longPressTarget = null;
            }
        } catch (error) {
            console.error('Error handling long press end:', error);
        }
    }
    
    handleLongPressCancel(e) {
        try {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            if (this.longPressTarget) {
                // Reset visual feedback
                this.longPressTarget.style.transform = '';
                this.longPressTarget.style.opacity = '';
                this.longPressTarget = null;
            }
        } catch (error) {
            console.error('Error handling long press cancel:', error);
        }
    }
    
    triggerLongPress(target) {
        try {
            if (!target) return;
            
            // Determine what type of item this is and show appropriate delete confirmation
            if (target.classList.contains('article-item')) {
                const articleId = target.dataset.articleId;
                const article = this.articles.find(a => a.id === articleId);
                if (article) {
                    this.showDeleteConfirmation('article', article.name, () => {
                        this.deleteArticle(articleId);
                    });
                }
            } else if (target.classList.contains('outfit-item')) {
                const itemId = target.id.replace('outfit-item-', '');
                const outfitItem = this.currentOutfitItems.find(item => item.id === itemId);
                if (outfitItem) {
                    this.showDeleteConfirmation('outfit item', outfitItem.article.name, () => {
                        this.removeOutfitItem(itemId);
                    });
                }
            } else if (target.classList.contains('category-card')) {
                const categoryId = target.dataset.categoryId;
                const category = this.categories.find(c => c.id === categoryId);
                if (category) {
                    this.showDeleteConfirmation('category', category.name, () => {
                        this.deleteCategory(categoryId);
                    });
                }
            } else if (target.classList.contains('created-outfit-card')) {
                const outfitId = target.dataset.outfitId;
                const outfit = this.findOutfitById(outfitId);
                if (outfit) {
                    this.showDeleteConfirmation('outfit', outfit.name, () => {
                        this.deleteOutfit(outfitId);
                    });
                }
            }
            
            // Reset visual feedback
            target.style.transform = '';
            target.style.opacity = '';
            this.longPressTarget = null;
        } catch (error) {
            console.error('Error triggering long press:', error);
        }
    }
    
    showDeleteConfirmation(itemType, itemName, onConfirm) {
        try {
            const confirmed = confirm(`Are you sure you want to delete ${itemType} "${itemName}"?`);
            if (confirmed) {
                onConfirm();
            }
        } catch (error) {
            console.error('Error showing delete confirmation:', error);
        }
    }
    
    findOutfitById(outfitId) {
        try {
            for (const category of this.categories) {
                if (category.outfits) {
                    const outfit = category.outfits.find(o => o.id === outfitId);
                    if (outfit) return outfit;
                }
            }
            return null;
        } catch (error) {
            console.error('Error finding outfit by ID:', error);
            return null;
        }
    }
    
    deleteOutfit(outfitId) {
        try {
            // Find and remove outfit from category
            for (const category of this.categories) {
                if (category.outfits) {
                    const outfitIndex = category.outfits.findIndex(o => o.id === outfitId);
                    if (outfitIndex !== -1) {
                        category.outfits.splice(outfitIndex, 1);
                        break;
                    }
                }
            }
            
            // Save data and refresh views
            this.saveData();
            this.renderCreatedOutfits();
            
            console.log('Outfit deleted:', outfitId);
        } catch (error) {
            console.error('Error deleting outfit:', error);
        }
    }
    
    deleteArticle(articleId) {
        try {
            const article = this.articles.find(a => a.id === articleId);
            if (!article) {
                this.showToast('Article not found', 'error');
                return;
            }
            // Prevent deleting if article is used in any outfit (global or category)
            const inGlobalOutfit = Array.isArray(this.outfits) && this.outfits.some(o => Array.isArray(o.items) && o.items.some(it => it.articleId === articleId));
            const inCategoryOutfit = Array.isArray(this.categories) && this.categories.some(c => Array.isArray(c.outfits) && c.outfits.some(o => Array.isArray(o.items) && o.items.some(it => it.articleId === articleId)));
            if (inGlobalOutfit || inCategoryOutfit) {
                this.showToast('Cannot delete: this article is used in an outfit', 'error');
                return;
            }
            
            this.showDeleteConfirmation('article', article.name, () => {
                this.articles = this.articles.filter(a => a.id !== articleId);
                this.saveData();
                this.renderArticles();
                this.renderArticlesGrid();
                this.populateTagFilters();
                this.showToast('Article deleted successfully!');
            });
        } catch (error) {
            console.error('Error deleting article:', error);
            this.showToast('Error deleting article. Please try again.', 'error');
        }
    }
    
    deleteOutfit(outfitId) {
        try {
            const outfit = this.findOutfitById(outfitId);
            if (!outfit) {
                this.showToast('Outfit not found', 'error');
                return;
            }
            
            this.showDeleteConfirmation(
                'outfit',
                outfit.name,
                () => {
                    // Find and remove outfit from its category
                    this.categories.forEach(category => {
                        if (category.outfits) {
                            category.outfits = category.outfits.filter(o => o.id !== outfitId);
                        }
                    });
                    
                    this.saveData();
                    this.renderCreatedOutfits();
                    this.showToast('Outfit deleted successfully!');
                }
            );
        } catch (error) {
            console.error('Error deleting outfit:', error);
            this.showToast('Error deleting outfit. Please try again.', 'error');
        }
    }
    
    deleteCategory(categoryId) {
        try {
            const category = this.categories.find(c => c.id === categoryId);
            if (!category) {
                this.showToast('Category not found', 'error');
                return;
            }
            
            // Check if category has outfits
            if (category.outfits && category.outfits.length > 0) {
                this.showDeleteConfirmation(
                    'category',
                    category.name,
                    () => {
                        this.categories = this.categories.filter(c => c.id !== categoryId);
                        this.saveData();
                        this.renderCategories();
                        this.updateCategorySelect();
                        this.navigateTo('categories');
                        this.showToast('Category deleted successfully!');
                    }
                );
            } else {
                this.categories = this.categories.filter(c => c.id !== categoryId);
                this.saveData();
                this.renderCategories();
                this.updateCategorySelect();
                this.navigateTo('categories');
                this.showToast('Category deleted successfully!');
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            this.showToast('Error deleting category. Please try again.', 'error');
        }
    }
    
    deleteCollection(collectionId) {
        try {
            const collection = this.collections.find(c => c.id === collectionId);
            if (!collection) {
                this.showToast('Collection not found', 'error');
                return;
            }
            
            this.showDeleteConfirmation(
                'collection',
                collection.name,
                () => {
                    this.collections = this.collections.filter(c => c.id !== collectionId);
                    this.saveData();
                    this.navigateTo('collections');
                    this.showToast('Collection deleted successfully!');
                }
            );
        } catch (error) {
            console.error('Error deleting collection:', error);
            this.showToast('Error deleting collection. Please try again.', 'error');
        }
    }
    
    // Collections Management
    renderCollections() {
        try {
            const collectionsList = document.getElementById('collectionsList');
            if (!collectionsList) {
                console.error('Collections list element not found');
                return;
            }
            
            if (this.collections.length === 0) {
                collectionsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <span class="material-icons">collections</span>
                        </div>
                        <h3>No Collections Yet</h3>
                        <p>Create your first collection to organize your categories!</p>
                        <button class="btn-primary" onclick="window.app.showCreateCollectionForm()">
                            <span class="material-icons">add</span>
                            <span>Create Collection</span>
                        </button>
                    </div>
                `;
                return;
            }
            
            collectionsList.innerHTML = '';
            
            this.collections.forEach(collection => {
                const collectionCard = document.createElement('div');
                collectionCard.className = 'collection-card';
                collectionCard.dataset.collectionId = collection.id;
                
                // Get category names for this collection
                const categoryNames = collection.categoryIds
                    .map(id => this.categories.find(c => c.id === id)?.name)
                    .filter(name => name);
                
                const iconHtml = collection.icon 
                    ? `<img src="${collection.icon}" alt="${this.escapeHtml(collection.name)}" class="collection-custom-icon">`
                    : `<span class="material-icons">collections</span>`;
                
                collectionCard.innerHTML = `
                    <div class="collection-header">
                        <div class="collection-icon">
                            ${iconHtml}
                        </div>
                        <div class="collection-info">
                            <h3>${this.escapeHtml(collection.name)}</h3>
                            <p>${this.escapeHtml(collection.description || 'No description')}</p>
                        </div>
                    </div>
                    <div class="collection-categories">
                        ${categoryNames.map(name => 
                            `<span class="collection-category-tag">${this.escapeHtml(name)}</span>`
                        ).join('')}
                    </div>
                `;
                
                // Add click handler to view collection
                collectionCard.addEventListener('click', () => {
                    this.viewCollection(collection.id);
                });
                
                collectionsList.appendChild(collectionCard);
            });
            
            console.log('Collections rendered:', this.collections.length);
        } catch (error) {
            console.error('Error rendering collections:', error);
        }
    }
    
    showCreateCollectionForm() {
        try {
            this.navigateTo('createCollection');
            this.populateCategoryCheckboxes();
            this.bindCollectionFormEvents();
        } catch (error) {
            console.error('Error showing create collection form:', error);
        }
    }
    
    populateCategoryCheckboxes() {
        try {
            const categoryCheckboxes = document.getElementById('categoryCheckboxes');
            if (!categoryCheckboxes) return;
            
            categoryCheckboxes.innerHTML = '';
            
            this.categories.forEach(category => {
                const checkboxItem = document.createElement('div');
                checkboxItem.className = 'category-checkbox-item';
                
                checkboxItem.innerHTML = `
                    <input type="checkbox" id="category-${category.id}" value="${category.id}">
                    <label for="category-${category.id}">${this.escapeHtml(category.name)}</label>
                `;
                
                categoryCheckboxes.appendChild(checkboxItem);
            });
        } catch (error) {
            console.error('Error populating category checkboxes:', error);
        }
    }
    
    bindCollectionFormEvents() {
        try {
            const collectionForm = document.getElementById('collectionForm');
            if (collectionForm) {
                collectionForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.createCollection();
                });
            }
        } catch (error) {
            console.error('Error binding collection form events:', error);
        }
    }
    
    createCollection() {
        try {
            const nameInput = document.getElementById('collectionName');
            const descriptionInput = document.getElementById('collectionDescription');
            const tagsInput = document.getElementById('collectionTags');
            const checkboxes = document.querySelectorAll('#categoryCheckboxes input[type="checkbox"]:checked');
            
            if (!nameInput || !descriptionInput) {
                console.error('Collection form inputs not found');
                return;
            }
            
            const name = nameInput.value.trim();
            const description = descriptionInput.value.trim();
            const tags = tagsInput ? tagsInput.value.trim() : '';
            const categoryIds = Array.from(checkboxes).map(cb => cb.value);
            
            if (!name) {
                this.showToast('Please enter a collection name', 'error');
                return;
            }
            
            // Categories are now optional - collections can exist without categories initially
            
            const collection = {
                id: Date.now().toString(),
                name: name,
                description: description,
                tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [],
                icon: this.currentCollectionIcon || null,
                categoryIds: categoryIds,
                createdAt: new Date().toISOString()
            };
            
            this.collections.push(collection);
            this.saveData();
            
            // Reset form
            nameInput.value = '';
            descriptionInput.value = '';
            if (tagsInput) tagsInput.value = '';
            checkboxes.forEach(cb => cb.checked = false);
            this.removeCollectionIcon();
            
            // Navigate back to collections
            this.navigateTo('collections');
            
            console.log('Collection created:', collection);
            this.showToast('Collection created successfully!');
        } catch (error) {
            console.error('Error creating collection:', error);
        }
    }
    
    viewCollection(collectionId) {
        try {
            const collection = this.collections.find(c => c.id === collectionId);
            if (!collection) {
                console.error('Collection not found:', collectionId);
                return;
            }
            
            // Store current collection for the detail view
            this.currentCollection = collection;
            this.navigateTo('collectionDetail');
        } catch (error) {
            console.error('Error viewing collection:', error);
        }
    }
    
    renderCollectionDetail() {
        try {
            if (!this.currentCollection) {
                console.error('No current collection to render');
                return;
            }
            
            const title = document.getElementById('collectionDetailTitle');
            const categoriesList = document.getElementById('collectionCategories');
            
            if (title) {
                title.textContent = this.currentCollection.name;
            }
            
            if (categoriesList) {
                if (this.currentCollection.categoryIds.length === 0) {
                    categoriesList.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-icon">
                                <span class="material-icons">folder_open</span>
                            </div>
                            <h3>No Categories Yet</h3>
                            <p>Add categories to this collection to organize your outfits!</p>
                            <button class="btn-primary" onclick="window.app.showAddCategoryToCollection()">
                                <span class="material-icons">add</span>
                                <span>Add Category</span>
                            </button>
                        </div>
                    `;
                    return;
                }
                
                categoriesList.innerHTML = '';
                
                this.currentCollection.categoryIds.forEach(categoryId => {
                    const category = this.categories.find(c => c.id === categoryId);
                    if (category) {
                        const categoryCard = document.createElement('div');
                        categoryCard.className = 'collection-category-card';
                        categoryCard.dataset.categoryId = category.id;
                        
                        const outfitCount = category.outfits ? category.outfits.length : 0;
                        
                        categoryCard.innerHTML = `
                            <button class="remove-category-btn" onclick="window.app.removeCategoryFromCollection('${categoryId}')" title="Remove from collection">×</button>
                            <div class="category-icon">
                                ${category.icon ? 
                                    `<img src="${category.icon}" alt="${this.escapeHtml(category.name)}" class="category-custom-icon">` :
                                    `<span class="material-icons">folder</span>`
                                }
                            </div>
                            <h3>${this.escapeHtml(category.name)}</h3>
                            <p>${outfitCount} outfit${outfitCount !== 1 ? 's' : ''}</p>
                        `;
                        
                        // Add click handler to view category
                        categoryCard.addEventListener('click', (e) => {
                            if (!e.target.classList.contains('remove-category-btn')) {
                                this.currentCategory = category;
                                this.navigateTo('categoryDetail');
                            }
                        });
                        
                        categoriesList.appendChild(categoryCard);
                    }
                });
            }
            
            console.log('Collection detail rendered for:', this.currentCollection.name);
        } catch (error) {
            console.error('Error rendering collection detail:', error);
        }
    }
    
    showAddCategoryToCollection() {
        try {
            if (!this.currentCollection) {
                console.error('No current collection');
                return;
            }
            
            // Get categories not already in this collection
            const availableCategories = this.categories.filter(cat => 
                !this.currentCollection.categoryIds.includes(cat.id)
            );
            
            if (availableCategories.length === 0) {
                this.showToast('No available categories to add. Create a category first!', 'info');
                return;
            }
            
            // Show category selection modal
            this.showSelectCategoriesModal(availableCategories);
        } catch (error) {
            console.error('Error showing add category dialog:', error);
        }
    }
    
    addCategoryToCollection(categoryId) {
        try {
            if (!this.currentCollection) {
                console.error('No current collection');
                return;
            }
            
            if (!this.currentCollection.categoryIds.includes(categoryId)) {
                this.currentCollection.categoryIds.push(categoryId);
                this.saveData();
                this.renderCollectionDetail();
                console.log('Category added to collection:', categoryId);
            this.showToast('Category added to collection!');
            }
        } catch (error) {
            console.error('Error adding category to collection:', error);
        }
    }
    
    removeCategoryFromCollection(categoryId) {
        try {
            if (!this.currentCollection) {
                console.error('No current collection');
                return;
            }
            
            const confirmed = confirm('Remove this category from the collection?');
            if (confirmed) {
                this.currentCollection.categoryIds = this.currentCollection.categoryIds.filter(id => id !== categoryId);
                this.saveData();
                this.renderCollectionDetail();
                console.log('Category removed from collection:', categoryId);
                this.showToast('Category removed from collection!');
            }
        } catch (error) {
            console.error('Error removing category from collection:', error);
        }
    }
    
    editCollection() {
        try {
            if (!this.currentCollection) {
                console.error('No current collection');
                return;
            }
            
            const newName = prompt('Edit collection name:', this.currentCollection.name);
            if (newName && newName.trim() !== this.currentCollection.name) {
                this.currentCollection.name = newName.trim();
                this.saveData();
                this.renderCollectionDetail();
                console.log('Collection name updated');
                this.showToast('Collection updated!');
            }
            
            const newDescription = prompt('Edit collection description:', this.currentCollection.description || '');
            if (newDescription !== null) {
                this.currentCollection.description = newDescription.trim();
                this.saveData();
                this.renderCollectionDetail();
                console.log('Collection description updated');
                this.showToast('Collection updated!');
            }
        } catch (error) {
            console.error('Error editing collection:', error);
        }
    }
    
    // Render created outfits in the add outfit view
    renderCreatedOutfits() {
        try {
            const createdOutfitsList = document.getElementById('createdOutfitsList');
            if (!createdOutfitsList) {
                console.error('Created outfits list element not found');
                return;
            }
            
            // Collect all outfits across categories and global list, but dedupe by id
            const idToOutfit = new Map();
            // From categories
            this.categories.forEach(category => {
                if (Array.isArray(category.outfits)) {
                    category.outfits.forEach(outfit => {
                        if (!idToOutfit.has(outfit.id)) {
                            idToOutfit.set(outfit.id, { ...outfit, categoryName: category.name });
                        }
                    });
                }
            });
            // Also include any global outfits that may not be in a category yet
            if (Array.isArray(this.outfits)) {
                this.outfits.forEach(outfit => {
                    if (!idToOutfit.has(outfit.id)) {
                        idToOutfit.set(outfit.id, { ...outfit, categoryName: null });
                    }
                });
            }
            const allOutfits = Array.from(idToOutfit.values());
            
            if (allOutfits.length === 0) {
                createdOutfitsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <span class="material-icons">checkroom</span>
                        </div>
                        <h3>No Outfits Yet</h3>
                        <p>Create your first outfit by dragging articles to the canvas above</p>
                    </div>
                `;
                return;
            }
            
            createdOutfitsList.innerHTML = '';
            
            allOutfits.forEach(outfit => {
                const outfitCard = document.createElement('div');
                outfitCard.className = 'created-outfit-card';
                outfitCard.dataset.outfitId = outfit.id;
                
                const previewImage = outfit.previewImage || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDIwMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04MCA0MEgxMjBWODBIODBWNDBaIiBmaWxsPSIjOTlBM0FGIi8+Cjwvc3ZnPg==';
                
                outfitCard.innerHTML = `
                    <img src="${previewImage}" alt="${this.escapeHtml(outfit.name)}" class="created-outfit-preview">
                    <h4 class="created-outfit-name">${this.escapeHtml(outfit.name)}</h4>
                `;
                
                // Add edit/delete buttons
                this.addCardActionButtons(outfitCard, 'outfit', outfit.id);
                
                // Click: open zoom modal (not actions)
                outfitCard.addEventListener('click', (e) => {
                    if (!e.target.closest('.card-actions')) {
                        this.openOutfitZoom(outfit);
                    }
                });
                
                createdOutfitsList.appendChild(outfitCard);
            });
            
            console.log('Created outfits rendered:', allOutfits.length);
        } catch (error) {
            console.error('Error rendering created outfits:', error);
        }
    }

    openAddOutfitsToCategory() {
        try {
            // Flag that we're adding existing outfits into the currently viewed category
            this.addToCategoryMode = true;
            this.addToCategoryId = this.currentCategory ? this.currentCategory.id : null;
            this.showSelectOutfitsModal();
        } catch (error) {
            console.error('Error opening add outfits to category:', error);
            this.showToast('Error opening outfits. Please try again.', 'error');
        }
    }

    openOutfitZoom(outfit) {
        try {
            const modal = document.getElementById('outfitZoomModal');
            const title = document.getElementById('outfitZoomTitle');
            const img = document.getElementById('outfitZoomImage');
            const closeBtn = document.getElementById('closeOutfitZoomModal');
            const zoomIn = document.getElementById('zoomInBtn');
            const zoomOut = document.getElementById('zoomOutBtn');
            const zoomReset = document.getElementById('zoomResetBtn');
            if (!modal || !title || !img) return;
            title.textContent = outfit.name || 'Outfit';
            img.src = outfit.previewImage || '';
            img.style.transform = 'scale(1)';
            let scale = 1;
            const apply = () => { img.style.transform = `scale(${scale})`; };
            if (zoomIn) zoomIn.onclick = () => { scale = Math.min(4, scale + 0.2); apply(); };
            if (zoomOut) zoomOut.onclick = () => { scale = Math.max(0.5, scale - 0.2); apply(); };
            if (zoomReset) zoomReset.onclick = () => { scale = 1; apply(); };
            if (closeBtn) closeBtn.onclick = () => { modal.classList.add('hidden'); };
            modal.classList.remove('hidden');
        } catch (error) {
            console.error('Error opening outfit zoom:', error);
        }
    }

    initDragAndDrop() {
        try {
            const outfitCanvas = document.getElementById('outfitCanvas');
            const slotGrid = document.getElementById('slotGrid');
            if (!outfitCanvas && !slotGrid) {
                console.error('No drop target found (neither outfitCanvas nor slotGrid)');
                return;
            }
            
            // Touch-friendly drag and drop variables
            this.draggedElement = null;
            this.dragOffset = { x: 0, y: 0 };
            this.isDragging = false;
            
            // Handle drops on outfit canvas (both mouse and touch)
            if (outfitCanvas) {
                outfitCanvas.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    outfitCanvas.style.borderColor = '#8b5cf6';
                });
                
                outfitCanvas.addEventListener('dragleave', (e) => {
                    e.preventDefault();
                    outfitCanvas.style.borderColor = '#6366f1';
                });
                
                outfitCanvas.addEventListener('drop', (e) => {
                    e.preventDefault();
                    outfitCanvas.style.borderColor = '#6366f1';
                    
                    const articleId = e.dataTransfer.getData('text/plain');
                    this.addArticleToOutfit(articleId, e.offsetX, e.offsetY);
                });
            }

            // Handle drops on slot grid
            if (slotGrid) {
                const slots = slotGrid.querySelectorAll('.slot');
                slots.forEach(slot => {
                    slot.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        slot.style.borderColor = '#8b5cf6';
                    });
                    slot.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        slot.style.borderColor = '#cbd5e1';
                    });
                    slot.addEventListener('drop', (e) => {
                        e.preventDefault();
                        slot.style.borderColor = '#cbd5e1';
                        const key = slot.dataset.slot;
                        const articleId = e.dataTransfer.getData('text/plain');
                        const article = this.articles.find(a => a.id === articleId);
                        if (article) {
                            this.currentOutfitSlots[key] = { articleId: article.id, name: article.name, image: article.processedImage || article.image, article };
                            this.renderSlots();
                            this.updateSaveButton();
                        }
                    });
                });
            }

            // Make articles draggable (mouse)
            document.addEventListener('dragstart', (e) => {
                if (e.target.classList.contains('article-item')) {
                    e.dataTransfer.setData('text/plain', e.target.dataset.articleId);
                }
            });
            
            // Touch events for mobile drag and drop
            document.addEventListener('touchstart', (e) => {
                const articleItem = e.target.closest('.article-item');
                if (articleItem) {
                    e.preventDefault();
                    this.startTouchDrag(articleItem, e.touches[0]);
                }
            }, { passive: false });
            
            document.addEventListener('touchmove', (e) => {
                if (this.isDragging && this.draggedElement) {
                    e.preventDefault();
                    this.updateTouchDrag(e.touches[0]);
                }
            }, { passive: false });
            
            document.addEventListener('touchend', (e) => {
                if (this.isDragging) {
                    e.preventDefault();
                    this.endTouchDrag(e.changedTouches[0]);
                }
            }, { passive: false });
            
            console.log('Drag and drop initialized with touch support');
        } catch (error) {
            console.error('Error initializing drag and drop:', error);
        }
    }

    // Slots rendering and assignment
    renderSlots() {
        try {
            const grid = document.getElementById('slotGrid');
            if (!grid) return;
            const slots = grid.querySelectorAll('.slot');
            slots.forEach(slotEl => {
                const key = slotEl.dataset.slot;
                const content = slotEl.querySelector('.slot-content');
                content.innerHTML = '';
                const item = this.currentOutfitSlots[key];
                if (item) {
                    slotEl.classList.add('filled');
                    slotEl.classList.remove('empty');
                    const img = document.createElement('img');
                    img.src = item.image || item.processedImage || item.article?.processedImage || item.article?.image || '';
                    img.alt = this.escapeHtml(item.name || item.article?.name || '');
                    content.appendChild(img);
                } else {
                    slotEl.classList.add('empty');
                    slotEl.classList.remove('filled');
                    const p = document.createElement('p');
                    p.className = 'placeholder-text';
                    p.textContent = 'Drop here';
                    content.appendChild(p);
                }
            });
        } catch (error) {
            console.error('Error rendering slots:', error);
        }
    }

    clearSlots() {
        this.currentOutfitSlots = { head: null, body: null, legs: null, feet: null, accessory: null };
        this.renderSlots();
        this.updateSaveButton();
    }
    
    startTouchDrag(element, touch) {
        try {
            this.draggedElement = element;
            this.isDragging = true;
            
            // Lock touch screen to prevent scrolling
            this.lockTouchScreen();
            
            const rect = element.getBoundingClientRect();
            this.dragOffset = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
            
            // Create a visual feedback element
            this.dragPreview = element.cloneNode(true);
            this.dragPreview.style.position = 'fixed';
            this.dragPreview.style.pointerEvents = 'none';
            this.dragPreview.style.zIndex = '1000';
            this.dragPreview.style.opacity = '0.8';
            this.dragPreview.style.transform = 'scale(1.1)';
            this.dragPreview.style.left = (touch.clientX - this.dragOffset.x) + 'px';
            this.dragPreview.style.top = (touch.clientY - this.dragOffset.y) + 'px';
            document.body.appendChild(this.dragPreview);
            
            // Add visual feedback to original element
            element.style.opacity = '0.5';
            
            console.log('Touch drag started');
        } catch (error) {
            console.error('Error starting touch drag:', error);
        }
    }
    
    updateTouchDrag(touch) {
        try {
            if (this.dragPreview) {
                this.dragPreview.style.left = (touch.clientX - this.dragOffset.x) + 'px';
                this.dragPreview.style.top = (touch.clientY - this.dragOffset.y) + 'px';
            }
            
            // Check if we're over the outfit canvas
            const outfitCanvas = document.getElementById('outfitCanvas');
            if (outfitCanvas) {
                const canvasRect = outfitCanvas.getBoundingClientRect();
                const isOverCanvas = touch.clientX >= canvasRect.left && 
                                   touch.clientX <= canvasRect.right &&
                                   touch.clientY >= canvasRect.top && 
                                   touch.clientY <= canvasRect.bottom;
                
                if (isOverCanvas) {
                    outfitCanvas.style.borderColor = '#8b5cf6';
                    outfitCanvas.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
                } else {
                    outfitCanvas.style.borderColor = '#6366f1';
                    outfitCanvas.style.backgroundColor = 'transparent';
                }
            }
        } catch (error) {
            console.error('Error updating touch drag:', error);
        }
    }
    
    endTouchDrag(touch) {
        try {
            if (!this.draggedElement) return;
            
            // Determine drop target: slot grid or free canvas
            const outfitCanvas = document.getElementById('outfitCanvas');
            const slotGrid = document.getElementById('slotGrid');
            let droppedOnCanvas = false;
            let droppedOnSlots = false;
            
            if (outfitCanvas) {
                const canvasRect = outfitCanvas.getBoundingClientRect();
                droppedOnCanvas = touch.clientX >= canvasRect.left && 
                                  touch.clientX <= canvasRect.right &&
                                  touch.clientY >= canvasRect.top && 
                                  touch.clientY <= canvasRect.bottom;
                // Reset canvas styling
                outfitCanvas.style.borderColor = '#6366f1';
                outfitCanvas.style.backgroundColor = 'transparent';
            }
            if (!droppedOnCanvas && slotGrid) {
                const gridRect = slotGrid.getBoundingClientRect();
                droppedOnSlots = touch.clientX >= gridRect.left &&
                                 touch.clientX <= gridRect.right &&
                                 touch.clientY >= gridRect.top &&
                                 touch.clientY <= gridRect.bottom;
            }
            
            if (droppedOnCanvas) {
                // Calculate position relative to canvas
                const canvasRect = outfitCanvas.getBoundingClientRect();
                const x = touch.clientX - canvasRect.left;
                const y = touch.clientY - canvasRect.top;
                
                // If slot grid exists, assign to nearest slot, else add freely
                const articleId = this.draggedElement.dataset.articleId;
                const article = this.articles.find(a => a.id === articleId);
                if (slotGrid && article) {
                    const slots = Array.from(slotGrid.querySelectorAll('.slot'));
                    // Find slot whose rect contains the drop point
                    const target = slots.find(s => {
                        const r = s.getBoundingClientRect();
                        return touch.clientX >= r.left && touch.clientX <= r.right && touch.clientY >= r.top && touch.clientY <= r.bottom;
                    });
                    if (target) {
                        const key = target.dataset.slot;
                        this.currentOutfitSlots[key] = { articleId: article.id, name: article.name, image: article.processedImage || article.image, article };
                        this.renderSlots();
                        this.updateSaveButton();
                    } else {
                        // Fallback to free placement if not on a slot
                        this.addArticleToOutfit(article, 'normal');
                    }
                } else if (article) {
                    this.addArticleToOutfit(article, 'normal');
                }
            } else if (droppedOnSlots && slotGrid) {
                // Dropped directly on slot grid (no canvas present)
                const articleId = this.draggedElement.dataset.articleId;
                const article = this.articles.find(a => a.id === articleId);
                if (article) {
                    const slots = Array.from(slotGrid.querySelectorAll('.slot'));
                    const target = slots.find(s => {
                        const r = s.getBoundingClientRect();
                        return touch.clientX >= r.left && touch.clientX <= r.right && touch.clientY >= r.top && touch.clientY <= r.bottom;
                    });
                    if (target) {
                        const key = target.dataset.slot;
                        this.currentOutfitSlots[key] = { articleId: article.id, name: article.name, image: article.processedImage || article.image, article };
                        this.renderSlots();
                        this.updateSaveButton();
                    }
                }
            }
            
            // Clean up
            if (this.dragPreview) {
                document.body.removeChild(this.dragPreview);
                this.dragPreview = null;
            }
            
            if (this.draggedElement) {
                this.draggedElement.style.opacity = '1';
            }
            
            this.draggedElement = null;
            this.isDragging = false;
            
            // Unlock touch screen
            this.unlockTouchScreen();
            
            console.log('Touch drag ended, dropped on canvas:', droppedOnCanvas);
        } catch (error) {
            console.error('Error ending touch drag:', error);
            // Make sure to unlock even if there's an error
            this.unlockTouchScreen();
        }
    }

    addArticleToOutfit(articleId, x, y) {
        try {
            console.log('Adding article to outfit:', { articleId, x, y, currentItems: this.currentOutfitItems.length });
            
            const article = this.articles.find(a => a.id === articleId);
            if (!article) {
                console.warn('Article not found:', articleId);
                return;
            }

            const outfitItem = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                articleId: articleId,
                name: article.name,
                image: article.processedImage || article.image,
                x: x - 40, // Center the item
                y: y - 40,
                article: article // Keep for backward compatibility
            };

            this.currentOutfitItems.push(outfitItem);
            console.log('Outfit items after adding:', this.currentOutfitItems.length);
            console.log('Outfit item data:', outfitItem);
            
            this.renderOutfitItem(outfitItem);
            this.updateSaveButton();
            
            console.log('Article added to outfit:', outfitItem);
        } catch (error) {
            console.error('Error adding article to outfit:', error);
        }
    }

    renderOutfitItems() {
        try {
            const canvas = document.getElementById('outfitCanvas');
            if (!canvas) return;
            
            console.log('renderOutfitItems called with', this.currentOutfitItems.length, 'items');
            
            // Clear existing items
            canvas.innerHTML = '';
            
            if (this.currentOutfitItems.length === 0) {
                canvas.innerHTML = '<p class="placeholder-text">Drag articles here to build your outfit</p>';
                return;
            }
            
            // Render all current outfit items
            console.log('Current outfit items array:', this.currentOutfitItems);
            this.currentOutfitItems.forEach((item, index) => {
                console.log(`Rendering item ${index}:`, item);
                const itemElement = document.createElement('div');
                itemElement.className = 'outfit-item';
                itemElement.id = `outfit-item-${item.id}`;
                itemElement.style.left = item.x + 'px';
                itemElement.style.top = item.y + 'px';
                
                // Handle both data structures: item.image or item.article.image
                const imageSrc = item.image || 
                                (item.article && (item.article.processedImage || item.article.image)) || 
                                'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg2MFY2MEgyMFYyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                
                console.log('Rendering outfit item:', {
                    itemId: item.id,
                    itemName: item.name,
                    hasImage: !!item.image,
                    hasArticle: !!item.article,
                    articleImage: item.article?.image,
                    articleProcessedImage: item.article?.processedImage,
                    finalImageSrc: imageSrc.substring(0, 50) + '...',
                    isDataUrl: imageSrc.startsWith('data:'),
                    isFallback: imageSrc.includes('PHN2ZyB3aWR0aD0iODAi'),
                    imageLength: imageSrc.length
                });
                
                // Handle both data structures for name: item.name or item.article.name
                const itemName = item.name || (item.article && item.article.name) || 'Unknown Item';
                
                itemElement.innerHTML = `
                    <img src="${imageSrc}" alt="${this.escapeHtml(itemName)}" class="outfit-item-image">
                    <div class="outfit-item-name">${this.escapeHtml(itemName)}</div>
                    <button class="remove-item-btn" onclick="window.app.removeOutfitItem('${item.id}')">
                        <span class="material-icons">close</span>
                    </button>
                `;
                
                // Make outfit items draggable
                this.makeOutfitItemDraggable(itemElement, item);
                
                canvas.appendChild(itemElement);
            });
            
            console.log('Outfit items rendered:', this.currentOutfitItems.length);
        } catch (error) {
            console.error('Error rendering outfit items:', error);
        }
    }
    
    renderOutfitItem(outfitItem) {
        try {
            const canvas = document.getElementById('outfitCanvas');
            if (!canvas) return;
            
            const itemElement = document.createElement('div');
            itemElement.className = 'outfit-item';
            itemElement.id = `outfit-item-${outfitItem.id}`;
            itemElement.style.left = outfitItem.x + 'px';
            itemElement.style.top = outfitItem.y + 'px';
            
            // Handle both data structures: item.image or item.article.image
            const imageSrc = outfitItem.image || 
                            (outfitItem.article && (outfitItem.article.processedImage || outfitItem.article.image)) || 
                            'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg2MFY2MEgyMFYyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
            
            // Handle both data structures for name: item.name or item.article.name
            const itemName = outfitItem.name || (outfitItem.article && outfitItem.article.name) || 'Unknown Item';
            
            itemElement.innerHTML = `
                <img src="${imageSrc}" alt="${this.escapeHtml(itemName)}" class="outfit-item-image">
                <div class="outfit-item-name">${this.escapeHtml(itemName)}</div>
                <button class="remove-item-btn" onclick="window.app.removeOutfitItem('${outfitItem.id}')">
                    <span class="material-icons">close</span>
                </button>
            `;
            
            // Make outfit items draggable using the correct method
            this.makeOutfitItemDraggable(itemElement, outfitItem);
            
            canvas.appendChild(itemElement);
            
            // Remove placeholder text
            const placeholder = canvas.querySelector('.placeholder-text');
            if (placeholder) placeholder.remove();
            
            console.log('Outfit item rendered:', outfitItem.id);
        } catch (error) {
            console.error('Error rendering outfit item:', error);
        }
    }

    makeOutfitItemDraggable(element, outfitItem, mode = 'normal') {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        const lockTouchScreen = () => {
            // Prevent scrolling and other touch interactions
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
            document.body.style.webkitTouchCallout = 'none';
        };
        
        const unlockTouchScreen = () => {
            // Restore normal touch behavior
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
            document.body.style.webkitTouchCallout = '';
        };
        
        element.addEventListener('mousedown', (e) => {
            if (e.target.closest('.remove-item-btn') || e.target.closest('.remove-btn')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            
            element.style.zIndex = '100';
            element.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
            
            // Update outfit item position
            outfitItem.x = startLeft + deltaX;
            outfitItem.y = startTop + deltaY;
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10';
                element.style.cursor = 'grab';
            }
        });
        
        // Touch events for mobile with screen locking
        element.addEventListener('touchstart', (e) => {
            if (e.target.closest('.remove-item-btn') || e.target.closest('.remove-btn')) return;
            
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            
            element.style.zIndex = '100';
            
            // Lock touch screen to prevent scrolling
            lockTouchScreen();
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            // Always prevent default to stop scrolling
            e.preventDefault();
            e.stopPropagation();
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
            
            outfitItem.x = startLeft + deltaX;
            outfitItem.y = startTop + deltaY;
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10';
                
                // Unlock touch screen
                unlockTouchScreen();
            }
        }, { passive: false });
        
        // Also unlock on touch cancel (when touch is interrupted)
        document.addEventListener('touchcancel', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10';
                unlockTouchScreen();
            }
        }, { passive: false });
    }
    
    makeDraggable(element, outfitItem) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        element.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('remove-btn')) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left);
            startTop = parseInt(element.style.top);
            
            element.style.zIndex = '100';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
            
            // Update outfit item position
            outfitItem.x = startLeft + deltaX;
            outfitItem.y = startTop + deltaY;
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10';
            }
        });
        
        // Touch events for mobile
        element.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('remove-btn')) return;
            
            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = parseInt(element.style.left);
            startTop = parseInt(element.style.top);
            
            element.style.zIndex = '100';
        });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
            
            outfitItem.x = startLeft + deltaX;
            outfitItem.y = startTop + deltaY;
        });
        
        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                element.style.zIndex = '10';
            }
        });
    }

    removeOutfitItem(itemId) {
        try {
            this.currentOutfitItems = this.currentOutfitItems.filter(item => item.id !== itemId);
            const element = document.getElementById(`outfit-item-${itemId}`);
            if (element) element.remove();
            
            this.updateSaveButton();
            
            // Show placeholder if no items
            if (this.currentOutfitItems.length === 0) {
                const canvas = document.getElementById('outfitCanvas');
                if (canvas) {
                    const placeholder = document.createElement('p');
                    placeholder.className = 'placeholder-text';
                    placeholder.textContent = 'Drag articles here to build your outfit';
                    canvas.appendChild(placeholder);
                }
            }
            
            console.log('Outfit item removed:', itemId);
        } catch (error) {
            console.error('Error removing outfit item:', error);
        }
    }

    async generateOutfitPreview() {
        try {
            const canvas = document.getElementById('outfitCanvas');
            if (!canvas) {
                console.error('Outfit canvas not found');
                return null;
            }

            // Create a temporary canvas to capture the outfit
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set canvas size to match the outfit canvas
            const rect = canvas.getBoundingClientRect();
            tempCanvas.width = rect.width;
            tempCanvas.height = rect.height;
            
            // Fill with background color
            tempCtx.fillStyle = 'rgba(99, 102, 241, 0.05)';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // Draw each outfit item at its exact position
            for (const item of this.currentOutfitItems) {
                const article = this.articles.find(a => a.id === item.articleId);
                if (article && article.image) {
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = () => {
                            // Draw the article image at its saved position
                            tempCtx.drawImage(img, item.x, item.y, 80, 80);
                            resolve();
                        };
                        img.onerror = reject;
                        img.src = article.image;
                    });
                }
            }
            
            // Convert canvas to data URL
            const dataURL = tempCanvas.toDataURL('image/png');
            console.log('Outfit preview generated');
            return dataURL;
            
        } catch (error) {
            console.error('Error generating outfit preview:', error);
            return null;
        }
    }

    async generateSlotsPreview() {
        try {
            const grid = document.getElementById('slotGrid');
            if (!grid) return null;
            const rect = grid.getBoundingClientRect();
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');
            tempCanvas.width = Math.ceil(rect.width);
            tempCanvas.height = Math.ceil(rect.height);
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            // Compute slot rects
            const getSlotRect = (key) => {
                const el = grid.querySelector(`.slot[data-slot="${key}"]`);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height };
            };

            const order = ['head', 'jacket', 'body', 'legs', 'feet', 'accessory'];
            for (const key of order) {
                const s = this.currentOutfitSlots[key];
                if (!s) continue;
                const slotR = getSlotRect(key);
                if (!slotR) continue;
                const img = await this.loadImage(s.image);
                // Fit image into slot while preserving aspect
                const scale = Math.min(slotR.w / img.width, slotR.h / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const dx = slotR.x + (slotR.w - drawW) / 2;
                const dy = slotR.y + (slotR.h - drawH) / 2;
                ctx.drawImage(img, dx, dy, drawW, drawH);
            }

            return tempCanvas.toDataURL('image/png');
        } catch (error) {
            console.error('Error generating slots preview:', error);
            return null;
        }
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    clearOutfit() {
        try {
            this.currentOutfitItems = [];
            this.updateSaveButton();
            
            // Clear canvas and show placeholder
            const canvas = document.getElementById('outfitCanvas');
            if (canvas) {
                canvas.innerHTML = '<p class="placeholder-text">Drag articles here to build your outfit</p>';
            }
            
            console.log('Outfit cleared');
        } catch (error) {
            console.error('Error clearing outfit:', error);
        }
    }

    updateSaveButton() {
        try {
            const saveBtn = document.getElementById('saveOutfitBtn');
            if (saveBtn) {
                const slotCount = Object.values(this.currentOutfitSlots || {}).filter(Boolean).length;
                const shouldDisable = (this.currentOutfitItems.length === 0) && (slotCount === 0);
                saveBtn.disabled = shouldDisable;
                console.log('Save button updated:', {
                    itemsCount: this.currentOutfitItems.length,
                    slotCount,
                    disabled: shouldDisable,
                    buttonFound: !!saveBtn
                });
            } else {
                console.warn('Save button not found!');
            }
        } catch (error) {
            console.error('Error updating save button:', error);
        }
    }

    showOutfitForm() {
        try {
            const form = document.getElementById('outfitForm');
            if (form) {
                form.classList.remove('hidden');
                console.log('Outfit form shown');
            }
        } catch (error) {
            console.error('Error showing outfit form:', error);
        }
    }

    async saveOutfit() {
        try {
            const nameInput = document.getElementById('outfitName');
            const categorySelect = document.getElementById('outfitCategory');
            
            if (!nameInput || !categorySelect) {
                console.error('Outfit form inputs not found');
                return;
            }
            
            const name = nameInput.value.trim();
            const categoryId = categorySelect.value;
            
            console.log('Saving outfit:', { name, categoryId, items: this.currentOutfitItems.length });
            
            if (!name || this.currentOutfitItems.length === 0) {
                alert('Please provide a name and add at least one article');
                return;
            }

            // Generate outfit preview image
            const previewImage = await this.generateOutfitPreview();

            if (this.isEditingOutfit && this.editingOutfitId) {
                // Update existing outfit
                const outfitIndex = this.outfits.findIndex(o => o.id === this.editingOutfitId);
                if (outfitIndex !== -1) {
                    this.outfits[outfitIndex] = {
                        ...this.outfits[outfitIndex],
                        name: name,
                        categoryId: categoryId,
                        items: this.currentOutfitItems.map(item => ({
                            articleId: item.articleId,
                            x: item.x,
                            y: item.y
                        })),
                        previewImage: previewImage, // Update the preview image
                        updatedAt: new Date().toISOString()
                    };
                    console.log('Outfit updated:', this.outfits[outfitIndex]);
                }
                // Reset editing mode
                this.isEditingOutfit = false;
                this.editingOutfitId = null;
            } else {
                // Create new outfit
                const outfit = {
                    id: Date.now().toString(),
                    name: name,
                    categoryId: categoryId || null, // Allow null for uncategorized outfits
                    items: this.currentOutfitItems.map(item => ({
                        articleId: item.articleId,
                        x: item.x,
                        y: item.y
                    })),
                    previewImage: previewImage, // Add the static preview image
                    createdAt: new Date().toISOString()
                };
                this.outfits.push(outfit);
                console.log('New outfit created:', outfit);
            }

            this.saveData();
            
            // Reset form
            nameInput.value = '';
            categorySelect.value = '';
            document.getElementById('outfitForm').classList.add('hidden');
            this.clearOutfit();
            
            this.navigateTo('categories');
            
            console.log('Outfit saved successfully:', outfit);
            alert('Outfit saved successfully!');
        } catch (error) {
            console.error('Error saving outfit:', error);
            alert('Error saving outfit. Please try again.');
        }
    }

    // Category and Outfit Display - Mobile Optimized
    renderCategories() {
        try {
            const categoriesList = document.getElementById('categoriesList');
            if (!categoriesList) {
                console.error('Categories list element not found');
                return;
            }
            
            console.log('Rendering categories, count:', this.categories.length, 'categories:', this.categories);
            
            // Show loading state
            categoriesList.innerHTML = '<div class="loading-spinner">Loading categories...</div>';
            
            // Use requestAnimationFrame for smooth rendering
            requestAnimationFrame(() => {
                this.renderCategoriesBatch(categoriesList, 0);
            });
            
        } catch (error) {
            console.error('Error rendering categories:', error);
            const categoriesList = document.getElementById('categoriesList');
            if (categoriesList) {
                categoriesList.innerHTML = '<div class="error-message">Failed to load categories</div>';
            }
        }
    }
    
    renderCategoriesBatch(categoriesList, startIndex) {
        const batchSize = this.batchSize || 5; // Use mobile-optimized batch size
        const endIndex = Math.min(startIndex + batchSize, this.categories.length);
        
        if (startIndex === 0) {
            categoriesList.innerHTML = '';
            
            // Handle empty categories case
            if (this.categories.length === 0) {
                categoriesList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <span class="material-icons">folder_open</span>
                        </div>
                        <h3>No Categories Yet</h3>
                        <p>Create your first category to organize your outfits!</p>
                        <p>Use the "Create Category" button above to get started.</p>
                    </div>
                `;
                console.log('No categories found, showing empty state');
                return;
            }
        }
        
        // Pre-calculate outfit counts including embedded category.outfits
        const outfitCounts = {};
        this.categories.forEach(cat => {
            let count = 0;
            if (Array.isArray(cat.outfits)) count += cat.outfits.length;
            // Also include global outfits assigned by categoryId
            count += this.outfits.filter(o => o.categoryId === cat.id).length;
            outfitCounts[cat.id] = count;
        });
        
        // Create document fragment for batch DOM updates
        const fragment = document.createDocumentFragment();
        
        for (let i = startIndex; i < endIndex; i++) {
            const category = this.categories[i];
            const categoryElement = document.createElement('div');
            categoryElement.className = 'category-card';
            categoryElement.setAttribute('data-category-id', category.id);
            
            // Use touch-friendly event handling
            categoryElement.addEventListener('touchstart', (e) => {
                e.preventDefault();
                // Add immediate visual feedback
                categoryElement.style.transform = 'scale(0.95)';
                categoryElement.style.opacity = '0.8';
                this.showCategoryDetail(category);
            }, { passive: false });
            
            categoryElement.addEventListener('click', (e) => {
                e.preventDefault();
                this.showCategoryDetail(category);
            }, { passive: true });
            
            // Reset visual state on touchend
            categoryElement.addEventListener('touchend', (e) => {
                categoryElement.style.transform = '';
                categoryElement.style.opacity = '';
            });
            
            const outfitCount = outfitCounts[category.id] || 0;
            
            // Use custom icon if available, otherwise show default folder icon
            const iconContent = category.icon 
                ? `<div class="category-custom-icon"><img src="${category.icon}" alt="${category.name}"></div>`
                : `<div class="category-icon"><span class="material-icons">folder</span></div>`;
            
            categoryElement.innerHTML = `
                ${iconContent}
                <h3>${this.escapeHtml(category.name)}</h3>
                <div class="outfit-count">${outfitCount} outfit${outfitCount !== 1 ? 's' : ''}</div>
            `;
            
            // Add edit/delete buttons
            this.addCardActionButtons(categoryElement, 'category', category.id);
            
            fragment.appendChild(categoryElement);
        }
        
        categoriesList.appendChild(fragment);
        
        // Continue with next batch if there are more categories
        if (endIndex < this.categories.length) {
            requestAnimationFrame(() => {
                this.renderCategoriesBatch(categoriesList, endIndex);
            });
        } else {
            // All categories rendered, now add the "Create New" card
            this.addCreateNewCard(categoriesList);
            console.log('Categories rendered:', this.categories.length);
        }
    }
    
    addCreateNewCard(categoriesList) {
        try {
            // Check if "Create New" card already exists
            const existingCreateCard = categoriesList.querySelector('.create-new-card');
            if (existingCreateCard) {
                return; // Already exists, don't add another
            }
            
            const createCard = document.createElement('div');
            createCard.className = 'category-card create-new-card';
            
            // Add touch-friendly event handling
            createCard.addEventListener('touchstart', (e) => {
                e.preventDefault();
                // Add immediate visual feedback
                createCard.style.transform = 'scale(0.95)';
                createCard.style.opacity = '0.8';
                this.navigateTo('create-category');
            }, { passive: false });
            
            createCard.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo('create-category');
            }, { passive: true });
            
            // Reset visual state on touchend
            createCard.addEventListener('touchend', (e) => {
                createCard.style.transform = '';
                createCard.style.opacity = '';
            });
            
            createCard.innerHTML = `
                <div class="category-icon create-icon">
                    <span class="material-icons">add_circle_outline</span>
                </div>
                <h3>Create New</h3>
                <div class="outfit-count">New Category</div>
            `;
            
            categoriesList.appendChild(createCard);
            console.log('Create New card added');
        } catch (error) {
            console.error('Error adding Create New card:', error);
        }
    }
    
    renderArticlesGrid() {
        try {
            const articlesGrid = document.getElementById('articlesGrid');
            if (!articlesGrid) {
                console.error('Articles grid element not found');
                return;
            }
            
            console.log('Rendering articles grid, count:', this.articles.length);
            
            if (this.articles.length === 0) {
                articlesGrid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <span class="material-icons">inventory_2</span>
                        </div>
                        <h3>No Articles Yet</h3>
                        <p>Add your first article to start building outfits!</p>
                        <button class="btn-primary" onclick="window.app.navigateTo('add-article')">
                            <span class="material-icons">add</span>
                            <span>Add Article</span>
                        </button>
                    </div>
                `;
                return;
            }
            
            articlesGrid.innerHTML = '';
            
            this.articles.forEach(article => {
                const articleCard = document.createElement('div');
                articleCard.className = 'article-card';
                
                // Add touch-friendly event handling
                articleCard.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    articleCard.style.transform = 'scale(0.95)';
                    articleCard.style.opacity = '0.8';
                }, { passive: false });
                
                articleCard.addEventListener('touchend', (e) => {
                    articleCard.style.transform = '';
                    articleCard.style.opacity = '';
                });
                
                const imageSrc = article.image || article.processedImage || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg0MFY0MEgyMFYyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
                
                articleCard.innerHTML = `
                    <img src="${imageSrc}" alt="${this.escapeHtml(article.name)}" class="article-image">
                    <div class="article-name">${this.escapeHtml(article.name)}</div>
                    <div class="article-tags">${this.escapeHtml(article.tags || '')}</div>
                    <button class="delete-btn" onclick="window.app.deleteArticle('${article.id}')">
                        <span class="material-icons">delete</span>
                        <span>Delete</span>
                    </button>
                `;
                
                // Ensure delete works on mobile: intercept touch and click on the button
                const deleteBtn = articleCard.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('touchstart', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.deleteArticle(article.id);
                    }, { passive: false });
                    deleteBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.deleteArticle(article.id);
                    });
                }
                
                articlesGrid.appendChild(articleCard);
            });
            
            console.log('Articles grid rendered successfully');
        } catch (error) {
            console.error('Error rendering articles grid:', error);
            const articlesGrid = document.getElementById('articlesGrid');
            if (articlesGrid) {
                articlesGrid.innerHTML = '<div class="error-message">Failed to load articles</div>';
            }
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    lockTouchScreen() {
        // Prevent scrolling and other touch interactions
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.webkitTouchCallout = 'none';
    }
    
    unlockTouchScreen() {
        // Restore normal touch behavior
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        document.body.style.webkitTouchCallout = '';
    }
    
    // Toast notification system
    showToast(message, type = 'success', duration = 3000) {
        try {
            const toast = document.getElementById('toast');
            const toastIcon = toast.querySelector('.toast-icon');
            const toastMessage = toast.querySelector('.toast-message');
            
            if (!toast || !toastIcon || !toastMessage) {
                console.error('Toast elements not found');
                return;
            }
            
            // Set message
            toastMessage.textContent = message;
            
            // Set icon and type
            toast.className = 'toast';
            switch (type) {
                case 'success':
                    toastIcon.textContent = '✓';
                    toast.classList.add('success');
                    break;
                case 'error':
                    toastIcon.textContent = '✕';
                    toast.classList.add('error');
                    break;
                case 'info':
                    toastIcon.textContent = 'ℹ';
                    toast.classList.add('info');
                    break;
                default:
                    toastIcon.textContent = '✓';
                    toast.classList.add('success');
            }
            
            // Show toast
            toast.classList.remove('hidden');
            toast.classList.add('show');
            
            // Auto-hide after duration
            setTimeout(() => {
                this.hideToast();
            }, duration);
            
        } catch (error) {
            console.error('Error showing toast:', error);
        }
    }
    
    hideToast() {
        try {
            const toast = document.getElementById('toast');
            if (toast) {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.classList.add('hidden');
                }, 300); // Wait for transition
            }
        } catch (error) {
            console.error('Error hiding toast:', error);
        }
    }
    
    // Save Outfit Modal
    bindSaveOutfitModalEvents() {
        try {
            const modal = document.getElementById('saveOutfitModal');
            const closeBtn = document.getElementById('closeSaveOutfitModal');
            const form = document.getElementById('saveOutfitForm');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    this.closeSaveOutfitModal();
                });
            }
            
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveOutfitFromModal();
                });
            }
            
            // Close modal when clicking outside
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        this.closeSaveOutfitModal();
                    }
                });
            }
        } catch (error) {
            console.error('Error binding save outfit modal events:', error);
        }
    }
    
    showSaveOutfitModal() {
        try {
            const slotCount = Object.values(this.currentOutfitSlots || {}).filter(Boolean).length;
            if (this.currentOutfitItems.length === 0 && slotCount === 0) {
                this.showToast('Please add at least one article (slot or canvas) first', 'info');
                return;
            }
            
            // Categories are optional; if none exist, we'll save to "My Outfits" automatically
            
            const modal = document.getElementById('saveOutfitModal');
            const nameInput = document.getElementById('modalOutfitName');
            const categorySelect = document.getElementById('modalOutfitCategory');
            
            if (modal && nameInput && categorySelect) {
                // Clear form
                nameInput.value = '';
                categorySelect.value = '';
                
                // Populate category select
                this.updateModalCategorySelect();
                
                // Show modal
                modal.classList.remove('hidden');
                
                // Focus on name input
                setTimeout(() => {
                    nameInput.focus();
                }, 100);
            }
        } catch (error) {
            console.error('Error showing save outfit modal:', error);
        }
    }
    
    closeSaveOutfitModal() {
        try {
            const modal = document.getElementById('saveOutfitModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error closing save outfit modal:', error);
        }
    }
    
    updateModalCategorySelect() {
        try {
            const categorySelect = document.getElementById('modalOutfitCategory');
            if (!categorySelect) return;
            
            // Clear existing options except the first one
            categorySelect.innerHTML = '<option value="">Select Category</option>';
            
            this.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                categorySelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error updating modal category select:', error);
        }
    }
    
    // Tag Search Functionality
    bindTagSearchEvents() {
        try {
            const tagSearchInput = document.getElementById('tagSearchInput');
            const tagSearchDropdown = document.getElementById('tagSearchDropdown');
            
            if (tagSearchInput && tagSearchDropdown) {
                tagSearchInput.addEventListener('click', () => {
                    this.toggleTagSearchDropdown();
                });
                
                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (!tagSearchInput.contains(e.target) && !tagSearchDropdown.contains(e.target)) {
                        this.closeTagSearchDropdown();
                    }
                });
            }
        } catch (error) {
            console.error('Error binding tag search events:', error);
        }
    }
    
    toggleTagSearchDropdown() {
        try {
            const tagSearchInput = document.getElementById('tagSearchInput');
            const tagSearchDropdown = document.getElementById('tagSearchDropdown');
            
            if (tagSearchInput && tagSearchDropdown) {
                if (tagSearchDropdown.classList.contains('hidden')) {
                    this.openTagSearchDropdown();
                } else {
                    this.closeTagSearchDropdown();
                }
            }
        } catch (error) {
            console.error('Error toggling tag search dropdown:', error);
        }
    }
    
    openTagSearchDropdown() {
        try {
            const tagSearchInput = document.getElementById('tagSearchInput');
            const tagSearchDropdown = document.getElementById('tagSearchDropdown');
            const tagSearchOptions = document.getElementById('tagSearchOptions');
            
            if (tagSearchInput && tagSearchDropdown && tagSearchOptions) {
                // Populate tag options
                this.populateTagSearchOptions();
                
                // Show dropdown
                tagSearchInput.classList.add('active');
                tagSearchDropdown.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error opening tag search dropdown:', error);
        }
    }
    
    closeTagSearchDropdown() {
        try {
            const tagSearchInput = document.getElementById('tagSearchInput');
            const tagSearchDropdown = document.getElementById('tagSearchDropdown');
            
            if (tagSearchInput && tagSearchDropdown) {
                tagSearchInput.classList.remove('active');
                tagSearchDropdown.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error closing tag search dropdown:', error);
        }
    }
    
    populateTagSearchOptions() {
        try {
            const tagSearchOptions = document.getElementById('tagSearchOptions');
            if (!tagSearchOptions) return;
            
            // Get all unique tags from articles
            const allTags = new Set();
            this.articles.forEach(article => {
                if (article.tags) {
                    let tags = [];
                    if (Array.isArray(article.tags)) {
                        // Tags are stored as array
                        tags = article.tags.map(tag => tag.trim().toLowerCase());
                    } else if (typeof article.tags === 'string') {
                        // Tags are stored as comma-separated string
                        tags = article.tags.split(',').map(tag => tag.trim().toLowerCase());
                    }
                    tags.forEach(tag => {
                        if (tag) allTags.add(tag);
                    });
                }
            });
            
            tagSearchOptions.innerHTML = '';
            
            if (allTags.size === 0) {
                tagSearchOptions.innerHTML = '<div class="tag-search-option">No tags available</div>';
                return;
            }
            
            Array.from(allTags).sort().forEach(tag => {
                const option = document.createElement('div');
                option.className = 'tag-search-option';
                
                const isSelected = this.selectedTags.includes(tag);
                
                option.innerHTML = `
                    <input type="checkbox" id="tag-${tag}" value="${tag}" ${isSelected ? 'checked' : ''}>
                    <label for="tag-${tag}">${tag}</label>
                `;
                
                const checkbox = option.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', () => {
                    this.toggleTagSelection(tag);
                });
                
                tagSearchOptions.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating tag search options:', error);
        }
    }
    
    toggleTagSelection(tag) {
        try {
            if (this.selectedTags.includes(tag)) {
                this.selectedTags = this.selectedTags.filter(t => t !== tag);
            } else {
                this.selectedTags.push(tag);
            }
            
            this.updateSelectedTagsDisplay();
            this.renderArticles(); // Re-render with new filter
        } catch (error) {
            console.error('Error toggling tag selection:', error);
        }
    }
    
    updateSelectedTagsDisplay() {
        try {
            const tagSearchInput = document.getElementById('tagSearchInput');
            const placeholder = tagSearchInput.querySelector('.tag-search-placeholder');
            
            if (this.selectedTags.length === 0) {
                placeholder.textContent = 'Select tags to filter...';
            } else {
                placeholder.textContent = `${this.selectedTags.length} tag(s) selected`;
            }
        } catch (error) {
            console.error('Error updating selected tags display:', error);
        }
    }
    
    // Collection Icon Functionality
    bindCollectionIconEvents() {
        try {
            const collectionIcon = document.getElementById('collectionIcon');
            const removeCollectionIcon = document.getElementById('removeCollectionIcon');
            
            if (collectionIcon) {
                collectionIcon.addEventListener('change', (e) => this.handleCollectionIconUpload(e));
            }
            
            if (removeCollectionIcon) {
                removeCollectionIcon.addEventListener('click', () => this.removeCollectionIcon());
            }
        } catch (error) {
            console.error('Error binding collection icon events:', error);
        }
    }
    
    handleCollectionIconUpload(event) {
        try {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.currentCollectionIcon = e.target.result;
                    this.showCollectionIconPreview(e.target.result);
                };
                reader.readAsDataURL(file);
            }
        } catch (error) {
            console.error('Error handling collection icon upload:', error);
        }
    }
    
    showCollectionIconPreview(imageData) {
        try {
            const preview = document.getElementById('collectionIconPreview');
            const img = document.getElementById('collectionIconImg');
            
            if (preview && img) {
                img.src = imageData;
                preview.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error showing collection icon preview:', error);
        }
    }
    
    removeCollectionIcon() {
        try {
            this.currentCollectionIcon = null;
            const preview = document.getElementById('collectionIconPreview');
            const input = document.getElementById('collectionIcon');
            
            if (preview) {
                preview.classList.add('hidden');
            }
            if (input) {
                input.value = '';
            }
        } catch (error) {
            console.error('Error removing collection icon:', error);
        }
    }
    
    // Outfit Selection Modal Functionality
    bindOutfitSelectionEvents() {
        try {
            const selectAllBtn = document.getElementById('selectAllBtn');
            const clearSelectionBtn = document.getElementById('clearSelectionBtn');
            const acceptSelectedOutfits = document.getElementById('acceptSelectedOutfits');
            const closeSelectOutfitsModal = document.getElementById('closeSelectOutfitsModal');
            
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => this.selectAllOutfits());
            }
            
            if (clearSelectionBtn) {
                clearSelectionBtn.addEventListener('click', () => this.clearOutfitSelection());
            }
            
            if (acceptSelectedOutfits) {
                acceptSelectedOutfits.addEventListener('click', () => this.acceptSelectedOutfits());
            }
            
            if (closeSelectOutfitsModal) {
                closeSelectOutfitsModal.addEventListener('click', () => this.closeSelectOutfitsModal());
            }
        } catch (error) {
            console.error('Error binding outfit selection events:', error);
        }
    }
    
    showSelectOutfitsModal() {
        try {
            const modal = document.getElementById('selectOutfitsModal');
            if (modal) {
                this.selectedOutfits = [];
                this.populateOutfitsSelection();
                modal.classList.remove('hidden');
                this.updateSelectedCount();
            }
        } catch (error) {
            console.error('Error showing select outfits modal:', error);
        }
    }
    
    closeSelectOutfitsModal() {
        try {
            const modal = document.getElementById('selectOutfitsModal');
            if (modal) {
                modal.classList.add('hidden');
                this.selectedOutfits = [];
                this.addToCategoryMode = false;
                this.addToCategoryId = null;
            }
        } catch (error) {
            console.error('Error closing select outfits modal:', error);
        }
    }
    
    populateOutfitsSelection() {
        try {
            const outfitsList = document.getElementById('outfitsSelectionList');
            if (!outfitsList) return;
            
            // Get all outfits from all categories
            const allOutfits = [];
            this.categories.forEach(category => {
                if (category.outfits) {
                    category.outfits.forEach(outfit => {
                        allOutfits.push({
                            ...outfit,
                            categoryName: category.name,
                            categoryId: category.id
                        });
                    });
                }
            });
            
            if (allOutfits.length === 0) {
                outfitsList.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                        <div class="empty-icon">
                            <span class="material-icons">checkroom</span>
                        </div>
                        <h3>No Outfits Available</h3>
                        <p>Create some outfits first to select from them</p>
                    </div>
                `;
                return;
            }
            
            outfitsList.innerHTML = '';
            
            allOutfits.forEach(outfit => {
                const outfitCard = document.createElement('div');
                outfitCard.className = 'outfit-selection-card';
                outfitCard.dataset.outfitId = outfit.id;
                
                const previewImage = outfit.previewImage || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgdmlld0JveD0iMCAwIDIwMCAxMjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTIwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04MCA0MEgxMjBWODBIODBWNDBaIiBmaWxsPSIjOTlBM0FGIi8+Cjwvc3ZnPg==';
                
                outfitCard.innerHTML = `
                    <input type="checkbox" class="outfit-selection-checkbox" data-outfit-id="${outfit.id}">
                    <img src="${previewImage}" alt="${this.escapeHtml(outfit.name)}" class="outfit-selection-preview">
                    <div class="outfit-selection-name">${this.escapeHtml(outfit.name)}</div>
                    <div class="outfit-selection-category">${this.escapeHtml(outfit.categoryName)}</div>
                `;
                
                // Add click handler for card selection
                outfitCard.addEventListener('click', (e) => {
                    if (e.target.type !== 'checkbox') {
                        const checkbox = outfitCard.querySelector('.outfit-selection-checkbox');
                        checkbox.checked = !checkbox.checked;
                        this.toggleOutfitSelection(outfit.id, checkbox.checked);
                    }
                });
                
                // Add change handler for checkbox
                const checkbox = outfitCard.querySelector('.outfit-selection-checkbox');
                checkbox.addEventListener('change', (e) => {
                    this.toggleOutfitSelection(outfit.id, e.target.checked);
                });
                
                outfitsList.appendChild(outfitCard);
            });
            
            console.log('Outfits selection populated:', allOutfits.length);
        } catch (error) {
            console.error('Error populating outfits selection:', error);
        }
    }
    
    toggleOutfitSelection(outfitId, isSelected) {
        try {
            if (isSelected) {
                if (!this.selectedOutfits.includes(outfitId)) {
                    this.selectedOutfits.push(outfitId);
                }
            } else {
                this.selectedOutfits = this.selectedOutfits.filter(id => id !== outfitId);
            }
            
            this.updateSelectedCount();
            this.updateCardSelection(outfitId, isSelected);
        } catch (error) {
            console.error('Error toggling outfit selection:', error);
        }
    }
    
    updateCardSelection(outfitId, isSelected) {
        try {
            const card = document.querySelector(`[data-outfit-id="${outfitId}"]`).closest('.outfit-selection-card');
            if (card) {
                if (isSelected) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            }
        } catch (error) {
            console.error('Error updating card selection:', error);
        }
    }
    
    updateSelectedCount() {
        try {
            const countElement = document.getElementById('selectedCount');
            if (countElement) {
                countElement.textContent = this.selectedOutfits.length;
            }
        } catch (error) {
            console.error('Error updating selected count:', error);
        }
    }
    
    selectAllOutfits() {
        try {
            const checkboxes = document.querySelectorAll('.outfit-selection-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
                const outfitId = checkbox.dataset.outfitId;
                if (!this.selectedOutfits.includes(outfitId)) {
                    this.selectedOutfits.push(outfitId);
                }
                this.updateCardSelection(outfitId, true);
            });
            this.updateSelectedCount();
        } catch (error) {
            console.error('Error selecting all outfits:', error);
        }
    }
    
    clearOutfitSelection() {
        try {
            const checkboxes = document.querySelectorAll('.outfit-selection-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
                const outfitId = checkbox.dataset.outfitId;
                this.updateCardSelection(outfitId, false);
            });
            this.selectedOutfits = [];
            this.updateSelectedCount();
        } catch (error) {
            console.error('Error clearing outfit selection:', error);
        }
    }
    
    acceptSelectedOutfits() {
        try {
            if (this.selectedOutfits.length === 0) {
                this.showToast('Please select at least one outfit', 'error');
                return;
            }
            
            const selectedCount = this.selectedOutfits.length;
            if (this.addToCategoryMode && this.addToCategoryId) {
                // Add selected outfits into the current category
                const category = this.categories.find(c => c.id === this.addToCategoryId);
                if (category) {
                    if (!category.outfits) category.outfits = [];
                    this.selectedOutfits.forEach(outfitId => {
                        const outfit = this.findOutfitById(outfitId);
                        if (!outfit) return;
                        // Avoid duplicates by id
                        if (!category.outfits.find(o => o.id === outfit.id)) {
                            const copy = { ...outfit, categoryId: category.id };
                            category.outfits.push(copy);
                        }
                    });
                    this.saveData();
                    // Re-render the category detail grid dynamically
                    const container = document.getElementById('categoryOutfits');
                    if (container) {
                        this.renderCategoryOutfits(category, container);
                    }
                    this.closeSelectOutfitsModal();
                    this.showToast(`${selectedCount} outfit(s) added successfully!`);
                    return;
                }
            }

            // Fallback: add into the outfit builder canvas (legacy behaviour)
            this.selectedOutfits.forEach(outfitId => {
                const outfit = this.findOutfitById(outfitId);
                if (outfit) {
                    outfit.items.forEach(item => {
                        this.currentOutfitItems.push({
                            ...item,
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
                        });
                    });
                }
            });
            this.closeSelectOutfitsModal();
            this.renderOutfitItems();
            this.showToast(`${selectedCount} outfit(s) added successfully!`);
        } catch (error) {
            console.error('Error accepting selected outfits:', error);
            this.showToast('Error adding outfits. Please try again.', 'error');
        }
    }
    
    // Category Selection Modal Functionality
    bindCategorySelectionEvents() {
        try {
            const selectAllCategoriesBtn = document.getElementById('selectAllCategoriesBtn');
            const clearCategoriesSelectionBtn = document.getElementById('clearCategoriesSelectionBtn');
            const acceptSelectedCategories = document.getElementById('acceptSelectedCategories');
            const closeSelectCategoriesModal = document.getElementById('closeSelectCategoriesModal');
            
            if (selectAllCategoriesBtn) {
                selectAllCategoriesBtn.addEventListener('click', () => this.selectAllCategories());
            }
            
            if (clearCategoriesSelectionBtn) {
                clearCategoriesSelectionBtn.addEventListener('click', () => this.clearCategorySelection());
            }
            
            if (acceptSelectedCategories) {
                acceptSelectedCategories.addEventListener('click', () => this.acceptSelectedCategories());
            }
            
            if (closeSelectCategoriesModal) {
                closeSelectCategoriesModal.addEventListener('click', () => this.closeSelectCategoriesModal());
            }
        } catch (error) {
            console.error('Error binding category selection events:', error);
        }
    }
    
    showSelectCategoriesModal(availableCategories) {
        try {
            const modal = document.getElementById('selectCategoriesModal');
            if (modal) {
                this.selectedCategories = [];
                this.availableCategories = availableCategories;
                this.populateCategoriesSelection();
                modal.classList.remove('hidden');
                this.updateSelectedCategoriesCount();
            }
        } catch (error) {
            console.error('Error showing select categories modal:', error);
        }
    }
    
    closeSelectCategoriesModal() {
        try {
            const modal = document.getElementById('selectCategoriesModal');
            if (modal) {
                modal.classList.add('hidden');
                this.selectedCategories = [];
                this.availableCategories = null;
            }
        } catch (error) {
            console.error('Error closing select categories modal:', error);
        }
    }
    
    populateCategoriesSelection() {
        try {
            const categoriesList = document.getElementById('categoriesSelectionList');
            if (!categoriesList || !this.availableCategories) return;
            
            if (this.availableCategories.length === 0) {
                categoriesList.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                        <div class="empty-icon">
                            <span class="material-icons">folder_open</span>
                        </div>
                        <h3>No Categories Available</h3>
                        <p>All categories are already in this collection</p>
                    </div>
                `;
                return;
            }
            
            categoriesList.innerHTML = '';
            
            this.availableCategories.forEach(category => {
                const categoryCard = document.createElement('div');
                categoryCard.className = 'category-selection-card';
                categoryCard.dataset.categoryId = category.id;
                
                const outfitCount = category.outfits ? category.outfits.length : 0;
                const iconHtml = category.icon 
                    ? `<img src="${category.icon}" alt="${this.escapeHtml(category.name)}">`
                    : `<span class="material-icons">folder</span>`;
                
                categoryCard.innerHTML = `
                    <input type="checkbox" class="category-selection-checkbox" data-category-id="${category.id}">
                    <div class="category-selection-icon">
                        ${iconHtml}
                    </div>
                    <div class="category-selection-name">${this.escapeHtml(category.name)}</div>
                    <div class="category-selection-count">${outfitCount} outfit${outfitCount !== 1 ? 's' : ''}</div>
                `;
                
                // Add click handler for card selection
                categoryCard.addEventListener('click', (e) => {
                    if (e.target.type !== 'checkbox') {
                        const checkbox = categoryCard.querySelector('.category-selection-checkbox');
                        checkbox.checked = !checkbox.checked;
                        this.toggleCategorySelection(category.id, checkbox.checked);
                    }
                });
                
                // Add change handler for checkbox
                const checkbox = categoryCard.querySelector('.category-selection-checkbox');
                checkbox.addEventListener('change', (e) => {
                    this.toggleCategorySelection(category.id, e.target.checked);
                });
                
                categoriesList.appendChild(categoryCard);
            });
            
            console.log('Categories selection populated:', this.availableCategories.length);
        } catch (error) {
            console.error('Error populating categories selection:', error);
        }
    }
    
    toggleCategorySelection(categoryId, isSelected) {
        try {
            if (isSelected) {
                if (!this.selectedCategories.includes(categoryId)) {
                    this.selectedCategories.push(categoryId);
                }
            } else {
                this.selectedCategories = this.selectedCategories.filter(id => id !== categoryId);
            }
            
            this.updateSelectedCategoriesCount();
            this.updateCategoryCardSelection(categoryId, isSelected);
        } catch (error) {
            console.error('Error toggling category selection:', error);
        }
    }
    
    updateCategoryCardSelection(categoryId, isSelected) {
        try {
            const card = document.querySelector(`[data-category-id="${categoryId}"]`).closest('.category-selection-card');
            if (card) {
                if (isSelected) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            }
        } catch (error) {
            console.error('Error updating category card selection:', error);
        }
    }
    
    updateSelectedCategoriesCount() {
        try {
            const countElement = document.getElementById('selectedCategoriesCount');
            if (countElement) {
                countElement.textContent = this.selectedCategories.length;
            }
        } catch (error) {
            console.error('Error updating selected categories count:', error);
        }
    }
    
    selectAllCategories() {
        try {
            const checkboxes = document.querySelectorAll('.category-selection-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
                const categoryId = checkbox.dataset.categoryId;
                if (!this.selectedCategories.includes(categoryId)) {
                    this.selectedCategories.push(categoryId);
                }
                this.updateCategoryCardSelection(categoryId, true);
            });
            this.updateSelectedCategoriesCount();
        } catch (error) {
            console.error('Error selecting all categories:', error);
        }
    }
    
    clearCategorySelection() {
        try {
            const checkboxes = document.querySelectorAll('.category-selection-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
                const categoryId = checkbox.dataset.categoryId;
                this.updateCategoryCardSelection(categoryId, false);
            });
            this.selectedCategories = [];
            this.updateSelectedCategoriesCount();
        } catch (error) {
            console.error('Error clearing category selection:', error);
        }
    }
    
    acceptSelectedCategories() {
        try {
            if (this.selectedCategories.length === 0) {
                this.showToast('Please select at least one category', 'error');
                return;
            }
            
            // Add selected categories to collection
            this.selectedCategories.forEach(categoryId => {
                this.addCategoryToCollection(categoryId);
            });
            
            this.closeSelectCategoriesModal();
            this.showToast(`${this.selectedCategories.length} categor${this.selectedCategories.length !== 1 ? 'ies' : 'y'} added successfully!`);
        } catch (error) {
            console.error('Error accepting selected categories:', error);
            this.showToast('Error adding categories. Please try again.', 'error');
        }
    }
    
    // Edit/Delete Functionality for Cards
    addCardActionButtons(card, type, id) {
        try {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'card-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'card-action-btn edit';
            editBtn.innerHTML = '<span class="material-icons">edit</span>';
            editBtn.title = 'Edit';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this.editCard(type, id);
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'card-action-btn delete';
            deleteBtn.innerHTML = '<span class="material-icons">delete</span>';
            deleteBtn.title = 'Delete';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteCard(type, id);
            };
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            card.appendChild(actionsDiv);
        } catch (error) {
            console.error('Error adding card action buttons:', error);
        }
    }
    
    editCard(type, id) {
        try {
            switch (type) {
                case 'category':
                    this.editCategory(id);
                    break;
                case 'collection':
                    this.editCollection(id);
                    break;
                case 'article':
                    this.editArticle(id);
                    break;
                case 'outfit':
                    this.editOutfit(id);
                    break;
                default:
                    console.error('Unknown card type:', type);
            }
        } catch (error) {
            console.error('Error editing card:', error);
        }
    }
    
    deleteCard(type, id) {
        try {
            switch (type) {
                case 'category':
                    this.deleteCategory(id);
                    break;
                case 'collection':
                    this.deleteCollection(id);
                    break;
                case 'article':
                    this.deleteArticle(id);
                    break;
                case 'outfit':
                    this.deleteOutfit(id);
                    break;
                default:
                    console.error('Unknown card type:', type);
            }
        } catch (error) {
            console.error('Error deleting card:', error);
        }
    }
    
    editCategory(categoryId) {
        try {
            const category = this.categories.find(c => c.id === categoryId);
            if (!category) {
                this.showToast('Category not found', 'error');
                return;
            }
            
            const newName = prompt('Enter new category name:', category.name);
            if (newName && newName.trim() !== category.name) {
                category.name = newName.trim();
                this.saveData();
                this.renderCategories();
                this.showToast('Category updated successfully!');
            }
        } catch (error) {
            console.error('Error editing category:', error);
            this.showToast('Error updating category. Please try again.', 'error');
        }
    }
    
    editCollection(collectionId) {
        try {
            const collection = this.collections.find(c => c.id === collectionId);
            if (!collection) {
                this.showToast('Collection not found', 'error');
                return;
            }
            
            const newName = prompt('Enter new collection name:', collection.name);
            if (newName && newName.trim() !== collection.name) {
                collection.name = newName.trim();
                this.saveData();
                this.renderCollections();
                this.showToast('Collection updated successfully!');
            }
        } catch (error) {
            console.error('Error editing collection:', error);
            this.showToast('Error updating collection. Please try again.', 'error');
        }
    }
    
    editArticle(articleId) {
        try {
            const article = this.articles.find(a => a.id === articleId);
            if (!article) {
                this.showToast('Article not found', 'error');
                return;
            }
            
            const newName = prompt('Enter new article name:', article.name);
            if (newName && newName.trim() !== article.name) {
                article.name = newName.trim();
                this.saveData();
                this.renderArticles();
                this.renderArticlesGrid();
                this.showToast('Article updated successfully!');
            }
        } catch (error) {
            console.error('Error editing article:', error);
            this.showToast('Error updating article. Please try again.', 'error');
        }
    }
    
    // Edit Outfit Modal Functionality
    bindEditOutfitEvents() {
        try {
            const closeEditOutfitModal = document.getElementById('closeEditOutfitModal');
            const saveEditOutfitBtn = document.getElementById('saveEditOutfitBtn');
            const clearEditOutfitBtn = document.getElementById('clearEditOutfitBtn');
            const editOutfitSearch = document.getElementById('editOutfitSearch');
            const editOutfitTagSearchInput = document.getElementById('editOutfitTagSearchInput');
            
            if (closeEditOutfitModal) {
                closeEditOutfitModal.addEventListener('click', () => this.closeEditOutfitModal());
            }
            
            if (saveEditOutfitBtn) {
                saveEditOutfitBtn.addEventListener('click', () => this.saveEditOutfit());
            }
            
            if (clearEditOutfitBtn) {
                clearEditOutfitBtn.addEventListener('click', () => this.clearEditOutfit());
            }
            
            if (editOutfitSearch) {
                editOutfitSearch.addEventListener('input', () => this.filterEditOutfitArticles());
            }
            
            if (editOutfitTagSearchInput) {
                editOutfitTagSearchInput.addEventListener('click', () => this.toggleEditOutfitTagSearch());
            }
            
            // Bind tag search events for edit outfit
            this.bindEditOutfitTagSearchEvents();
        } catch (error) {
            console.error('Error binding edit outfit events:', error);
        }
    }
    
    bindEditOutfitTagSearchEvents() {
        try {
            const editOutfitTagSearchDropdown = document.getElementById('editOutfitTagSearchDropdown');
            
            if (editOutfitTagSearchDropdown) {
                editOutfitTagSearchDropdown.addEventListener('click', (e) => e.stopPropagation());
            }
            
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                this.closeEditOutfitTagSearch();
            });
        } catch (error) {
            console.error('Error binding edit outfit tag search events:', error);
        }
    }
    
    editOutfit(outfitId) {
        try {
            const outfit = this.findOutfitById(outfitId);
            if (!outfit) {
                this.showToast('Outfit not found', 'error');
                return;
            }
            
            this.editingOutfit = outfit;
            this.editingOutfitItems = [...outfit.items];
            this.editingOutfitChanged = false;
            
            this.showEditOutfitModal();
        } catch (error) {
            console.error('Error editing outfit:', error);
            this.showToast('Error opening outfit editor. Please try again.', 'error');
        }
    }
    
    showEditOutfitModal() {
        try {
            const modal = document.getElementById('editOutfitModal');
            const title = document.getElementById('editOutfitTitle');
            
            if (modal && title) {
                title.textContent = `Editing Outfit: ${this.editingOutfit.name}`;
                modal.classList.remove('hidden');
                this.populateEditOutfitArticles();
                this.renderEditOutfitItems();
            }
        } catch (error) {
            console.error('Error showing edit outfit modal:', error);
        }
    }
    
    closeEditOutfitModal() {
        try {
            if (this.editingOutfitChanged) {
                const saveChanges = confirm('Do you want to save changes?');
                if (saveChanges) {
                    this.saveEditOutfit();
                    return;
                }
            }
            
            const modal = document.getElementById('editOutfitModal');
            if (modal) {
                modal.classList.add('hidden');
                this.editingOutfit = null;
                this.editingOutfitItems = [];
                this.editingOutfitChanged = false;
            }
        } catch (error) {
            console.error('Error closing edit outfit modal:', error);
        }
    }
    
    populateEditOutfitArticles() {
        try {
            const articlesList = document.getElementById('editOutfitArticlesList');
            if (!articlesList) return;
            
            articlesList.innerHTML = '';
            
            this.articles.forEach(article => {
                const articleItem = document.createElement('div');
                articleItem.className = 'article-item';
                articleItem.dataset.articleId = article.id;
                
                // Check if article is already in the outfit
                const isInOutfit = this.editingOutfitItems.some(item => item.articleId === article.id);
                if (isInOutfit) {
                    articleItem.classList.add('highlighted');
                }
                
                const imageSrc = article.processedImage || article.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik00MCA0MEg2MFY2MEg0MFY0MFoiIGZpbGw9IiM5OUEzQUYiLz4KPC9zdmc+';
                
                articleItem.innerHTML = `
                    <img src="${imageSrc}" alt="${this.escapeHtml(article.name)}" class="article-thumbnail">
                    <div class="article-name">${this.escapeHtml(article.name)}</div>
                    <div class="article-tags">${this.escapeHtml(article.tags || '')}</div>
                `;
                
                // Add drag functionality
                this.makeArticleDraggable(articleItem, article, 'edit');
                
                articlesList.appendChild(articleItem);
            });
        } catch (error) {
            console.error('Error populating edit outfit articles:', error);
        }
    }
    
    renderEditOutfitItems() {
        try {
            const canvas = document.getElementById('editOutfitCanvas');
            if (!canvas) return;
            
            if (this.editingOutfitItems.length === 0) {
                canvas.innerHTML = '<p class="placeholder-text">Drag articles here to build your outfit</p>';
                return;
            }
            
            canvas.innerHTML = '';
            
            this.editingOutfitItems.forEach(item => {
                const itemElement = document.createElement('div');
                itemElement.className = 'outfit-item';
                itemElement.style.left = item.x + 'px';
                itemElement.style.top = item.y + 'px';
                itemElement.dataset.itemId = item.id;
                
                const imageSrc = item.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik00MCA0MEg2MFY2MEg0MFY0MFoiIGZpbGw9IiM5OUEzQUYiLz4KPC9zdmc+';
                
                itemElement.innerHTML = `
                    <img src="${imageSrc}" alt="${this.escapeHtml(item.name)}" class="outfit-item-image">
                    <div class="outfit-item-name">${this.escapeHtml(item.name)}</div>
                    <button class="remove-item-btn" onclick="window.app.removeEditOutfitItem('${item.id}')">
                        <span class="material-icons">close</span>
                    </button>
                `;
                
                // Add drag functionality
                this.makeOutfitItemDraggable(itemElement, item, 'edit');
                
                canvas.appendChild(itemElement);
            });
        } catch (error) {
            console.error('Error rendering edit outfit items:', error);
        }
    }
    
    makeArticleDraggable(element, article, mode = 'normal') {
        try {
            let isDragging = false;
            let startX, startY, initialX, initialY;
            
            const handleStart = (e) => {
                isDragging = true;
                const rect = element.getBoundingClientRect();
                startX = e.clientX || e.touches[0].clientX;
                startY = e.clientY || e.touches[0].clientY;
                initialX = rect.left;
                initialY = rect.top;
                
                element.style.zIndex = '1000';
                element.style.opacity = '0.8';
                element.style.transform = 'scale(1.05)';
                
                // Lock touch screen for mobile dragging
                if (e.touches) {
                    this.lockTouchScreen();
                }
                
                e.preventDefault();
            };
            
            const handleMove = (e) => {
                if (!isDragging) return;
                
                const currentX = e.clientX || e.touches[0].clientX;
                const currentY = e.clientY || e.touches[0].clientY;
                
                const deltaX = currentX - startX;
                const deltaY = currentY - startY;
                
                element.style.left = (initialX + deltaX) + 'px';
                element.style.top = (initialY + deltaY) + 'px';
                
                e.preventDefault();
            };
            
            const handleEnd = (e) => {
                if (!isDragging) return;
                isDragging = false;
                
                element.style.zIndex = '';
                element.style.opacity = '';
                element.style.transform = '';
                
                // Unlock touch screen for mobile
                if (e.changedTouches) {
                    this.unlockTouchScreen();
                }
                
                // Check if dropped on outfit canvas
                const canvas = document.getElementById(mode === 'edit' ? 'editOutfitCanvas' : 'outfitCanvas');
                if (canvas) {
                    const canvasRect = canvas.getBoundingClientRect();
                    const elementRect = element.getBoundingClientRect();
                    
                    if (elementRect.left < canvasRect.right &&
                        elementRect.right > canvasRect.left &&
                        elementRect.top < canvasRect.bottom &&
                        elementRect.bottom > canvasRect.top) {
                        
                        // Add to outfit
                        this.addArticleToOutfit(article, mode);
                        
                        // Highlight the article
                        element.classList.add('highlighted');
                    } else {
                        // Return to original position
                        element.style.left = '';
                        element.style.top = '';
                    }
                }
                
                e.preventDefault();
            };
            
            // Mouse events
            element.addEventListener('mousedown', handleStart);
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            
            // Touch events
            element.addEventListener('touchstart', handleStart, { passive: false });
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd, { passive: false });
        } catch (error) {
            console.error('Error making article draggable:', error);
        }
    }
    
    addArticleToOutfit(article, mode = 'normal') {
        try {
            console.log('Adding article to outfit (method 2):', { 
                articleId: article.id, 
                articleName: article.name, 
                hasImage: !!(article.processedImage || article.image),
                mode,
                currentItems: this.currentOutfitItems.length 
            });
            
            console.log('Full article object:', article);
            
            // Check if article is already in the outfit
            const existingItem = this.currentOutfitItems.find(item => item.articleId === article.id);
            if (existingItem) {
                console.log('Article already in outfit, skipping:', article.id);
                return;
            }
            
            const newItem = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                articleId: article.id,
                name: article.name,
                image: article.processedImage || article.image,
                x: Math.random() * 200 + 50, // Random position
                y: Math.random() * 200 + 50
            };
            
            console.log('Created outfit item:', newItem);
            console.log('Article image data:', {
                hasProcessedImage: !!article.processedImage,
                hasImage: !!article.image,
                processedImageType: article.processedImage ? article.processedImage.substring(0, 50) + '...' : 'none',
                imageType: article.image ? article.image.substring(0, 50) + '...' : 'none',
                finalImage: newItem.image ? newItem.image.substring(0, 50) + '...' : 'none'
            });
            
            if (mode === 'edit') {
                this.editingOutfitItems.push(newItem);
                this.editingOutfitChanged = true;
                this.renderEditOutfitItems();
            } else {
                this.currentOutfitItems.push(newItem);
                console.log('Outfit items after adding:', this.currentOutfitItems.length);
                this.renderOutfitItems();
                this.updateSaveButton();
            }
        } catch (error) {
            console.error('Error adding article to outfit:', error);
        }
    }
    
    removeEditOutfitItem(itemId) {
        try {
            this.editingOutfitItems = this.editingOutfitItems.filter(item => item.id !== itemId);
            this.editingOutfitChanged = true;
            this.renderEditOutfitItems();
            this.populateEditOutfitArticles(); // Update highlights
        } catch (error) {
            console.error('Error removing edit outfit item:', error);
        }
    }
    
    clearEditOutfit() {
        try {
            this.editingOutfitItems = [];
            this.editingOutfitChanged = true;
            this.renderEditOutfitItems();
            this.populateEditOutfitArticles(); // Update highlights
        } catch (error) {
            console.error('Error clearing edit outfit:', error);
        }
    }
    
    async saveEditOutfit() {
        try {
            if (!this.editingOutfit) return;
            
            // Update the outfit
            this.editingOutfit.items = [...this.editingOutfitItems];
            this.editingOutfit.previewImage = await this.generateOutfitPreview(this.editingOutfitItems);
            
            this.saveData();
            this.closeEditOutfitModal();
            this.showToast('Outfit updated successfully!');
            
            // Refresh the current view
            if (this.currentView === 'addOutfit') {
                this.renderCreatedOutfits();
            }
        } catch (error) {
            console.error('Error saving edit outfit:', error);
            this.showToast('Error updating outfit. Please try again.', 'error');
        }
    }
    
    toggleEditOutfitTagSearch() {
        try {
            const dropdown = document.getElementById('editOutfitTagSearchDropdown');
            if (dropdown) {
                dropdown.classList.toggle('hidden');
                if (!dropdown.classList.contains('hidden')) {
                    this.populateEditOutfitTagSearchOptions();
                }
            }
        } catch (error) {
            console.error('Error toggling edit outfit tag search:', error);
        }
    }
    
    closeEditOutfitTagSearch() {
        try {
            const dropdown = document.getElementById('editOutfitTagSearchDropdown');
            if (dropdown) {
                dropdown.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error closing edit outfit tag search:', error);
        }
    }
    
    populateEditOutfitTagSearchOptions() {
        try {
            const tagSearchOptions = document.getElementById('editOutfitTagSearchOptions');
            if (!tagSearchOptions) return;
            
            // Get all unique tags from articles
            const allTags = new Set();
            this.articles.forEach(article => {
                if (article.tags) {
                    let tags = [];
                    if (Array.isArray(article.tags)) {
                        tags = article.tags.map(tag => tag.trim().toLowerCase());
                    } else if (typeof article.tags === 'string') {
                        tags = article.tags.split(',').map(tag => tag.trim().toLowerCase());
                    }
                    tags.forEach(tag => {
                        if (tag) allTags.add(tag);
                    });
                }
            });
            
            tagSearchOptions.innerHTML = '';
            
            if (allTags.size === 0) {
                tagSearchOptions.innerHTML = '<div class="tag-search-option">No tags available</div>';
                return;
            }
            
            Array.from(allTags).sort().forEach(tag => {
                const option = document.createElement('div');
                option.className = 'tag-search-option';
                
                option.innerHTML = `
                    <input type="checkbox" id="edit-tag-${tag}" value="${tag}">
                    <label for="edit-tag-${tag}">${tag}</label>
                `;
                
                const checkbox = option.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', () => {
                    this.filterEditOutfitArticles();
                });
                
                tagSearchOptions.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating edit outfit tag search options:', error);
        }
    }
    
    filterEditOutfitArticles() {
        try {
            const searchTerm = document.getElementById('editOutfitSearch').value.toLowerCase();
            const selectedTags = Array.from(document.querySelectorAll('#editOutfitTagSearchOptions input[type="checkbox"]:checked'))
                .map(cb => cb.value);
            
            const articlesList = document.getElementById('editOutfitArticlesList');
            if (!articlesList) return;
            
            const articles = articlesList.querySelectorAll('.article-item');
            
            articles.forEach(articleElement => {
                const articleId = articleElement.dataset.articleId;
                const article = this.articles.find(a => a.id === articleId);
                
                if (!article) return;
                
                const matchesSearch = !searchTerm || 
                    article.name.toLowerCase().includes(searchTerm) ||
                    (article.tags && article.tags.toLowerCase().includes(searchTerm));
                
                const matchesTags = selectedTags.length === 0 || 
                    (article.tags && selectedTags.some(selectedTag => {
                        if (Array.isArray(article.tags)) {
                            return article.tags.some(tag => tag.toLowerCase().includes(selectedTag.toLowerCase()));
                        } else {
                            return article.tags.toLowerCase().includes(selectedTag.toLowerCase());
                        }
                    }));
                
                if (matchesSearch && matchesTags) {
                    articleElement.style.display = 'block';
                } else {
                    articleElement.style.display = 'none';
                }
            });
        } catch (error) {
            console.error('Error filtering edit outfit articles:', error);
        }
    }
    
    async saveOutfitFromModal() {
        try {
            const nameInput = document.getElementById('modalOutfitName');
            const categorySelect = document.getElementById('modalOutfitCategory');
            
            if (!nameInput || !categorySelect) {
                console.error('Modal form inputs not found');
                return;
            }
            
            const name = nameInput.value.trim();
            const categoryId = categorySelect.value;
            
            if (!name) {
                this.showToast('Please enter an outfit name', 'error');
                return;
            }
            
            // Category is optional
            const slotCount = Object.values(this.currentOutfitSlots || {}).filter(Boolean).length;
            if (this.currentOutfitItems.length === 0 && slotCount === 0) {
                this.showToast('Please add some articles to your outfit first!', 'error');
                return;
            }
            
            // Create outfit object
            const outfit = {
                id: Date.now().toString(),
                name: name,
                categoryId: categoryId || null,
                items: [],
                createdAt: new Date().toISOString()
            };
            
            // Build items list from slots if any are filled, otherwise use free placement items
            if (slotCount > 0) {
                const order = ['head', 'jacket', 'body', 'legs', 'feet', 'accessory'];
                order.forEach(slotKey => {
                    const s = this.currentOutfitSlots[slotKey];
                    if (s) {
                        outfit.items.push({
                            id: `${slotKey}-${Date.now()}`,
                            slot: slotKey,
                            articleId: s.articleId,
                            name: s.name,
                            image: s.image
                        });
                    }
                });
            } else {
                outfit.items = [...this.currentOutfitItems];
            }
            
            // Generate preview image
            let previewImage = null;
            if (slotCount > 0) {
                previewImage = await this.generateSlotsPreview();
            } else {
                previewImage = await this.generateOutfitPreview();
            }
            outfit.previewImage = previewImage;
            
            // Save outfit to selected category or create "My Outfits" category
            if (categoryId) {
                const category = this.categories.find(c => c.id === categoryId);
                if (category) {
                    if (!category.outfits) category.outfits = [];
                    category.outfits.push(outfit);
                } else {
                    this.showToast('Selected category not found', 'error');
                    return;
                }
            } else {
                // Add to "My Outfits" (uncategorized)
                let myOutfitsCategory = this.categories.find(c => c.name === 'My Outfits');
                if (!myOutfitsCategory) {
                    myOutfitsCategory = {
                        id: 'my-outfits',
                        name: 'My Outfits',
                        outfits: [],
                        createdAt: new Date().toISOString()
                    };
                    this.categories.push(myOutfitsCategory);
                }
                myOutfitsCategory.outfits.push(outfit);
            }
            
            // Save data and clear outfit
            this.saveData();
            this.clearOutfit();
            this.clearSlots();
            this.closeSaveOutfitModal();
            this.renderCreatedOutfits();
            
            this.showToast('Outfit saved successfully!');
            console.log('Outfit saved:', outfit);
            
        } catch (error) {
            console.error('Error saving outfit from modal:', error);
            this.showToast('Error saving outfit. Please try again.', 'error');
        }
    }

    showCategoryDetail(category) {
        try {
            this.currentCategory = category;
            const titleElement = document.getElementById('categoryDetailTitle');
            if (titleElement) {
                titleElement.textContent = category.name;
            }
            
            const categoryOutfits = document.getElementById('categoryOutfits');
            if (!categoryOutfits) return;
            
            // Show loading state
            categoryOutfits.innerHTML = '<div class="loading-spinner">Loading outfits...</div>';
            
            // Reload fresh data to ensure we have the latest outfits
            this.loadData().then(() => {
                // Use requestAnimationFrame for smooth rendering
                requestAnimationFrame(() => {
                    this.renderCategoryOutfits(category, categoryOutfits);
                });
            }).catch(error => {
                console.error('Error loading data for category detail:', error);
                // Still render with current data
                requestAnimationFrame(() => {
                    this.renderCategoryOutfits(category, categoryOutfits);
                });
            });
            
            this.navigateTo('categoryDetail');
            console.log('Category detail shown:', category.name);
        } catch (error) {
            console.error('Error showing category detail:', error);
            const categoryOutfits = document.getElementById('categoryOutfits');
            if (categoryOutfits) {
                categoryOutfits.innerHTML = '<div class="error-message">Failed to load outfits</div>';
            }
        }
    }
    
    renderCategoryOutfits(category, categoryOutfits) {
        try {
            categoryOutfits.innerHTML = '';
            
            const categoryOutfitsList = (category.outfits && Array.isArray(category.outfits))
                ? category.outfits
                : this.outfits.filter(o => o.categoryId === category.id);
            
            if (categoryOutfitsList.length === 0) {
                categoryOutfits.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No outfits in this category yet.</p>';
            } else {
                // Create document fragment for better performance
                const fragment = document.createDocumentFragment();
                
                categoryOutfitsList.forEach(outfit => {
                    const outfitElement = document.createElement('div');
                    outfitElement.className = 'outfit-card';
                    outfitElement.setAttribute('data-outfit-id', outfit.id);
                    
                    // Use touch-friendly event handling
                    outfitElement.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.showOutfitDetail(outfit);
                    }, { passive: true });
                    
                    // Use preview image if available, otherwise show icon
                    const previewContent = outfit.previewImage 
                        ? `<div class="outfit-preview"><img src="${outfit.previewImage}" alt="${outfit.name}"></div>`
                        : `<div class="outfit-icon"><span class="material-icons">checkroom</span></div>`;
                    
                    outfitElement.innerHTML = `
                        ${previewContent}
                        <h3>${this.escapeHtml(outfit.name)}</h3>
                        <p>${outfit.items.length} item${outfit.items.length !== 1 ? 's' : ''}</p>
                    `;
                    
                    fragment.appendChild(outfitElement);
                });
                
                categoryOutfits.appendChild(fragment);
            }
            
            console.log('Category outfits rendered:', categoryOutfitsList.length);
        } catch (error) {
            console.error('Error rendering category outfits:', error);
            categoryOutfits.innerHTML = '<div class="error-message">Failed to load outfits</div>';
        }
    }

    showOutfitDetail(outfit) {
        try {
            this.currentOutfit = outfit;
            const titleElement = document.getElementById('outfitDetailTitle');
            if (titleElement) {
                titleElement.textContent = outfit.name;
            }
            
            const outfitDisplay = document.getElementById('outfitDisplay');
            if (!outfitDisplay) return;
            
            // Render using slot grid if outfit has slot-based items, otherwise show preview image
            outfitDisplay.innerHTML = '';
            const hasSlots = outfit.items.some(it => it.slot);
            if (hasSlots) {
                const grid = document.createElement('div');
                grid.className = 'slot-grid';
                grid.innerHTML = `
                    <div class="slot" data-slot="head"><div class="slot-label">Head</div><div class="slot-content"></div></div>
                    <div class="slot" data-slot="jacket"><div class="slot-label">Jacket</div><div class="slot-content"></div></div>
                    <div class="slot" data-slot="body"><div class="slot-label">Body</div><div class="slot-content"></div></div>
                    <div class="slot" data-slot="legs"><div class="slot-label">Legs</div><div class="slot-content"></div></div>
                    <div class="slot" data-slot="feet"><div class="slot-label">Feet</div><div class="slot-content"></div></div>
                    <div class="slot" data-slot="accessory"><div class="slot-label">Accessory</div><div class="slot-content"></div></div>
                `;
                outfitDisplay.appendChild(grid);
                // map slot -> item
                const bySlot = {};
                outfit.items.forEach(it => { if (it.slot) bySlot[it.slot] = it; });
                ['head','jacket','body','legs','feet','accessory'].forEach(slot => {
                    const it = bySlot[slot];
                    const content = grid.querySelector(`.slot[data-slot="${slot}"] .slot-content`);
                    if (!content) return;
                    if (it) {
                        const img = document.createElement('img');
                        img.src = it.image || (this.articles.find(a=>a.id===it.articleId)?.image) || '';
                        img.alt = it.name || '';
                        content.appendChild(img);
                    } else {
                        const p = document.createElement('p');
                        p.className = 'placeholder-text';
                        p.textContent = '—';
                        content.appendChild(p);
                    }
                });
            } else if (outfit.previewImage) {
                const img = document.createElement('img');
                img.src = outfit.previewImage;
                img.alt = outfit.name;
                img.style.maxWidth = '100%';
                outfitDisplay.appendChild(img);
            }
            
            this.navigateTo('outfitDetail');
            console.log('Outfit detail shown:', outfit.name);
        } catch (error) {
            console.error('Error showing outfit detail:', error);
        }
    }

    editOutfit() {
        try {
            if (!this.currentOutfit) return;
            
            // Set editing mode flag
            this.isEditingOutfit = true;
            this.editingOutfitId = this.currentOutfit.id;
            
            // Populate outfit builder with current outfit
            this.currentOutfitItems = this.currentOutfit.items.map(item => {
                const article = this.articles.find(a => a.id === item.articleId);
                return {
                    id: Date.now().toString() + Math.random(),
                    articleId: item.articleId,
                    x: item.x,
                    y: item.y,
                    article: article
                };
            });
            
            // Clear canvas and render items
            const canvas = document.getElementById('outfitCanvas');
            if (canvas) {
                canvas.innerHTML = '';
                
                this.currentOutfitItems.forEach(item => {
                    this.renderOutfitItem(item);
                });
            }
            
            this.updateSaveButton();
            this.navigateTo('addOutfit');
            console.log('Outfit edit mode activated');
        } catch (error) {
            console.error('Error editing outfit:', error);
        }
    }

    deleteOutfit() {
        try {
            if (!this.currentOutfit) return;
            
            if (confirm('Are you sure you want to delete this outfit?')) {
                this.outfits = this.outfits.filter(o => o.id !== this.currentOutfit.id);
                this.saveData();
                this.navigateTo('category');
                console.log('Outfit deleted:', this.currentOutfit.name);
            }
        } catch (error) {
            console.error('Error deleting outfit:', error);
        }
    }

    updateCategorySelect() {
        try {
            const select = document.getElementById('outfitCategory');
            if (!select) {
                console.error('Outfit category select not found');
                return;
            }
            
            select.innerHTML = '<option value="">Select Category</option>';
            
            this.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });
            
            console.log('Category select updated with', this.categories.length, 'categories');
        } catch (error) {
            console.error('Error updating category select:', error);
        }
    }

    showLoading(show) {
        try {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                if (show) {
                    overlay.classList.remove('hidden');
                } else {
                    overlay.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error showing/hiding loading:', error);
        }
    }

    async saveData() {
        try {
            // Always save to localStorage as backup
            this.saveToLocalStorage();
            
            // Try to save to Firestore if user is signed in
            if (this.user && this.db) {
                console.log('Saving data to Firestore...');
                
                // Save all collections in parallel
                const savePromises = [
                    this.saveToFirestore('categories', this.categories),
                    this.saveToFirestore('articles', this.articles),
                    this.saveToFirestore('outfits', this.outfits),
                    this.saveToFirestore('collections', this.collections)
                ];
                
                const results = await Promise.allSettled(savePromises);
                const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
                
                if (successCount === 3) {
                    console.log('All data saved to Firestore successfully');
                } else {
                    console.warn(`Only ${successCount}/3 collections saved to Firestore`);
                }
            } else {
                console.log('Data saved to localStorage only (user not signed in or Firestore unavailable)');
            }
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DOM loaded, initializing LookbookApp...');
        window.app = new LookbookApp();
        
        // Firebase init (replace with your config)
        const firebaseConfig = {
            apiKey: 'AIzaSyDcYyZE9GTB143sYuCgomvft2SM4y0YUw4',
            authDomain: 'project-lookbook.firebaseapp.com',
            projectId: 'project-lookbook',
            appId: '1:420746963131:web:21c2a7c112ae2a4c30a19e'
        };
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        // Initialize Firestore
        window.app.initFirestore();

        // Auth state listener
        firebase.auth().onAuthStateChanged((user) => {
            try {
                window.app.user = user || null;
                const authBtn = document.getElementById('authBtn');
                if (authBtn) {
                    authBtn.textContent = user ? 'Sign out' : 'Sign in';
                }
                const modal = document.getElementById('authModal');
                if (modal) modal.classList.add('hidden');

                if (user) {
                    window.app.migrateDataToUserNamespace(user.uid);
                }
                
                // Load data asynchronously and then render
                window.app.loadData().then(() => {
                    window.app.renderCategories();
                    window.app.renderArticles();
                    window.app.updateCategorySelect();
                }).catch(error => {
                    console.error('Error loading data after auth change:', error);
                    // Still render with empty data
                    window.app.renderCategories();
                    window.app.renderArticles();
                    window.app.updateCategorySelect();
                });
            } catch (err) {
                console.error('Error handling auth state change:', err);
            }
        });
        console.log('LookbookApp initialized successfully');
    } catch (error) {
        console.error('Error initializing LookbookApp:', error);
    }
});

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('SW registered successfully: ', registration);
            })
            .catch(registrationError => {
                console.error('SW registration failed: ', registrationError);
                // Don't show error to user as it's not critical for app functionality
            });
    });
} else {
    console.log('Service Worker not supported in this browser');
}
