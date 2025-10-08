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
                searchArticles.addEventListener('input', (e) => {
                    this.filterArticles(e.target.value);
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

            const clearOutfitBtn = document.getElementById('clearOutfitBtn');
            if (clearOutfitBtn) {
                clearOutfitBtn.addEventListener('click', () => {
                    console.log('Clear outfit button clicked');
                    this.clearOutfit();
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
                this.showArticleForm();
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
                alert('Please provide a name and image for the article');
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
            
            this.showDeleteConfirmation(
                'article',
                article.name,
                () => {
                    this.articles = this.articles.filter(a => a.id !== articleId);
                    this.saveData();
                    this.renderArticles();
                    this.renderArticlesGrid();
                    this.populateTagFilters();
                    this.showToast('Article deleted successfully!');
                }
            );
        } catch (error) {
            console.error('Error deleting article:', error);
            this.showToast('Error deleting article. Please try again.', 'error');
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
            
            // Create a simple selection dialog
            const categoryNames = availableCategories.map(cat => cat.name);
            const selectedName = prompt(`Available categories:\n${categoryNames.join('\n')}\n\nEnter the name of the category to add:`);
            
            if (selectedName) {
                const category = availableCategories.find(cat => 
                    cat.name.toLowerCase() === selectedName.toLowerCase()
                );
                
                if (category) {
                    this.addCategoryToCollection(category.id);
                } else {
                    this.showToast('Category not found. Please check the spelling.', 'error');
                }
            }
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
            
            // Get all outfits from all categories
            const allOutfits = [];
            this.categories.forEach(category => {
                if (category.outfits) {
                    category.outfits.forEach(outfit => {
                        allOutfits.push({
                            ...outfit,
                            categoryName: category.name
                        });
                    });
                }
            });
            
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
                
                // Add click handler to edit outfit
                outfitCard.addEventListener('click', () => {
                    this.editOutfit(outfit.id);
                });
                
                createdOutfitsList.appendChild(outfitCard);
            });
            
            console.log('Created outfits rendered:', allOutfits.length);
        } catch (error) {
            console.error('Error rendering created outfits:', error);
        }
    }

    initDragAndDrop() {
        try {
            const outfitCanvas = document.getElementById('outfitCanvas');
            if (!outfitCanvas) {
                console.error('Outfit canvas not found');
                return;
            }
            
            // Touch-friendly drag and drop variables
            this.draggedElement = null;
            this.dragOffset = { x: 0, y: 0 };
            this.isDragging = false;
            
            // Handle drops on outfit canvas (both mouse and touch)
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
    
    startTouchDrag(element, touch) {
        try {
            this.draggedElement = element;
            this.isDragging = true;
            
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
            
            // Check if we're over the outfit canvas
            const outfitCanvas = document.getElementById('outfitCanvas');
            let droppedOnCanvas = false;
            
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
            
            if (droppedOnCanvas) {
                // Calculate position relative to canvas
                const canvasRect = outfitCanvas.getBoundingClientRect();
                const x = touch.clientX - canvasRect.left;
                const y = touch.clientY - canvasRect.top;
                
                // Add article to outfit
                const articleId = this.draggedElement.dataset.articleId;
                this.addArticleToOutfit(articleId, x, y);
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
            
            console.log('Touch drag ended, dropped on canvas:', droppedOnCanvas);
        } catch (error) {
            console.error('Error ending touch drag:', error);
        }
    }

    addArticleToOutfit(articleId, x, y) {
        try {
            const article = this.articles.find(a => a.id === articleId);
            if (!article) return;

            const outfitItem = {
                id: Date.now().toString(),
                articleId: articleId,
                x: x - 40, // Center the item
                y: y - 40,
                article: article
            };

            this.currentOutfitItems.push(outfitItem);
            this.renderOutfitItem(outfitItem);
            this.updateSaveButton();
            
            console.log('Article added to outfit:', outfitItem);
        } catch (error) {
            console.error('Error adding article to outfit:', error);
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
            
            const imageSrc = outfitItem.article.processedImage || outfitItem.article.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyMEg2MFY2MEgyMFYyMFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+';
            
            itemElement.innerHTML = `
                <img src="${imageSrc}" alt="${this.escapeHtml(outfitItem.article.name)}">
                <button class="remove-btn" onclick="app.removeOutfitItem('${outfitItem.id}')">×</button>
            `;
            
            // Make outfit items draggable
            this.makeDraggable(itemElement, outfitItem);
            
            canvas.appendChild(itemElement);
            
            // Remove placeholder text
            const placeholder = canvas.querySelector('.placeholder-text');
            if (placeholder) placeholder.remove();
        } catch (error) {
            console.error('Error rendering outfit item:', error);
        }
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

    clearOutfit() {
        try {
            this.currentOutfitItems.forEach(item => {
                const element = document.getElementById(`outfit-item-${item.id}`);
                if (element) element.remove();
            });
            
            this.currentOutfitItems = [];
            this.updateSaveButton();
            
            // Show placeholder
            const canvas = document.getElementById('outfitCanvas');
            if (canvas) {
                const placeholder = document.createElement('p');
                placeholder.className = 'placeholder-text';
                placeholder.textContent = 'Drag articles here to build your outfit';
                canvas.appendChild(placeholder);
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
                saveBtn.disabled = this.currentOutfitItems.length === 0;
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
        
        // Pre-calculate outfit counts to avoid repeated filtering
        const outfitCounts = {};
        this.outfits.forEach(outfit => {
            outfitCounts[outfit.categoryId] = (outfitCounts[outfit.categoryId] || 0) + 1;
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
            if (this.currentOutfitItems.length === 0) {
                this.showToast('Please add some articles to your outfit first!', 'info');
                return;
            }
            
            if (this.categories.length === 0) {
                this.showToast('Please create a category first to organize your outfits!', 'info');
                return;
            }
            
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
            
            if (!categoryId) {
                this.showToast('Please select a category for your outfit', 'error');
                return;
            }
            
            if (this.currentOutfitItems.length === 0) {
                this.showToast('Please add some articles to your outfit first!', 'error');
                return;
            }
            
            // Create outfit object
            const outfit = {
                id: Date.now().toString(),
                name: name,
                categoryId: categoryId || null,
                items: [...this.currentOutfitItems],
                createdAt: new Date().toISOString()
            };
            
            // Generate preview image
            const previewImage = await this.generateOutfitPreview();
            outfit.previewImage = previewImage;
            
            // Save outfit to selected category
            const category = this.categories.find(c => c.id === categoryId);
            if (category) {
                if (!category.outfits) category.outfits = [];
                category.outfits.push(outfit);
            } else {
                this.showToast('Selected category not found', 'error');
                return;
            }
            
            // Save data and clear outfit
            this.saveData();
            this.clearOutfit();
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
            
            const categoryOutfitsList = this.outfits.filter(o => o.categoryId === category.id);
            
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
            
            outfitDisplay.innerHTML = '';
            
            outfit.items.forEach(item => {
                const article = this.articles.find(a => a.id === item.articleId);
                if (article) {
                    const img = document.createElement('img');
                    img.src = article.image;
                    img.alt = article.name;
                    img.title = article.name;
                    outfitDisplay.appendChild(img);
                }
            });
            
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
