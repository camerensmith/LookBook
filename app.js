// Lookbook PWA - Main Application Logic

class LookbookApp {
    constructor() {
        this.user = null;
        this.categories = [];
        this.articles = [];
        this.outfits = [];
        this.currentView = 'categories';
        this.currentCategory = null;
        this.currentOutfit = null;
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
        
        console.log('LookbookApp initialized with:', {
            categories: this.categories.length,
            articles: this.articles.length,
            outfits: this.outfits.length
        });
        
        this.init();
    }

    init() {
        try {
            this.optimizeForMobile();
            this.bindEvents();
            this.loadData();
            
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

    loadData() {
        try {
            const catKey = this.getStorageKey('categories');
            const artKey = this.getStorageKey('articles');
            const outfitKey = this.getStorageKey('outfits');

            // Use try-catch for each localStorage operation to prevent total failure
            try {
                this.categories = JSON.parse(localStorage.getItem(catKey)) || [];
            } catch (e) {
                console.warn('Failed to load categories, using empty array');
                this.categories = [];
            }
            
            try {
                this.articles = JSON.parse(localStorage.getItem(artKey)) || [];
            } catch (e) {
                console.warn('Failed to load articles, using empty array');
                this.articles = [];
            }
            
            try {
                this.outfits = JSON.parse(localStorage.getItem(outfitKey)) || [];
            } catch (e) {
                console.warn('Failed to load outfits, using empty array');
                this.outfits = [];
            }

            console.log('Data loaded', {
                user: this.user ? this.user.uid : 'guest',
                categories: this.categories.length,
                articles: this.articles.length,
                outfits: this.outfits.length
            });
        } catch (error) {
            console.error('Error loading data:', error);
            // Initialize with empty arrays to prevent app crash
            this.categories = [];
            this.articles = [];
            this.outfits = [];
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
                btn.addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    console.log('Navigation clicked:', action);
                    this.navigateTo(action);
                });
            });

            // Back button events
            const backButtons = document.querySelectorAll('.back-btn');
            console.log('Found back buttons:', backButtons.length);
            
            backButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const backTo = e.target.dataset.back;
                    console.log('Back button clicked:', backTo);
                    this.navigateTo(backTo);
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
                    this.showOutfitForm();
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
                        const provider = new firebase.auth.GoogleAuthProvider();
                        await firebase.auth().signInWithPopup(provider);
                    } catch (err) {
                        console.error('Google sign-in error:', err);
                        alert('Google sign-in failed.');
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
                    'category': 'categoryDetail',
                    'categoryDetail': 'categoryDetail',
                    'outfit': 'outfitDetail',
                    'outfitDetail': 'outfitDetail'
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
                console.log('Successfully navigated to:', normalized);
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
                    break;
                case 'addArticle':
                    this.resetArticleForm();
                    break;
            }
        } catch (error) {
            console.error('Error navigating to view:', error);
        }
    }

    // Category Management
    createCategory() {
        try {
            const nameInput = document.getElementById('categoryName');
            if (!nameInput) {
                console.error('Category name input not found');
                return;
            }
            
            const name = nameInput.value.trim();
            console.log('Creating category:', name);
            
            if (!name) {
                alert('Please enter a category name');
                return;
            }

            const category = {
                id: Date.now().toString(),
                name: name,
                createdAt: new Date().toISOString()
            };

            this.categories.push(category);
            this.saveData();
            this.updateCategorySelect();
            this.navigateTo('categories');
            nameInput.value = '';
            
            console.log('Category created successfully:', category);
            alert('Category created successfully!');
        } catch (error) {
            console.error('Error creating category:', error);
            alert('Error creating category. Please try again.');
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
            const blob = await window.removeBackground(imageData);
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('Background removal failed:', error);
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
        if (this.editingCanvas) {
            this.processedImage = this.editingCanvas.toDataURL('image/png');
            this.closeImageEditor();
            this.showArticleForm();
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
                console.log('Article form shown');
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
            this.navigateTo('categories');
            
            console.log('Article saved successfully:', article);
            alert('Article saved successfully!');
        } catch (error) {
            console.error('Error saving article:', error);
            alert('Error saving article. Please try again.');
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
            
            articlesList.innerHTML = '';

            this.articles.forEach(article => {
                const articleElement = document.createElement('div');
                articleElement.className = 'article-item';
                articleElement.draggable = true;
                articleElement.dataset.articleId = article.id;
                
                articleElement.innerHTML = `
                    <img src="${article.image}" alt="${article.name}">
                    <div class="article-info">
                        <h4>${article.name}</h4>
                        <div class="tags">${article.tags.join(', ')}</div>
                    </div>
                `;
                
                articlesList.appendChild(articleElement);
            });
            
            console.log('Articles rendered:', this.articles.length);
        } catch (error) {
            console.error('Error rendering articles:', error);
        }
    }

    filterArticles(searchTerm) {
        try {
            const articles = document.querySelectorAll('.article-item');
            const term = searchTerm.toLowerCase();
            
            articles.forEach(article => {
                const name = article.querySelector('h4').textContent.toLowerCase();
                const tags = article.querySelector('.tags').textContent.toLowerCase();
                const isVisible = name.includes(term) || tags.includes(term);
                article.style.display = isVisible ? 'block' : 'none';
            });
        } catch (error) {
            console.error('Error filtering articles:', error);
        }
    }

    initDragAndDrop() {
        try {
            const outfitCanvas = document.getElementById('outfitCanvas');
            if (!outfitCanvas) {
                console.error('Outfit canvas not found');
                return;
            }
            
            // Handle drops on outfit canvas
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

            // Make articles draggable
            document.addEventListener('dragstart', (e) => {
                if (e.target.classList.contains('article-item')) {
                    e.dataTransfer.setData('text/plain', e.target.dataset.articleId);
                }
            });
            
            console.log('Drag and drop initialized');
        } catch (error) {
            console.error('Error initializing drag and drop:', error);
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
            
            itemElement.innerHTML = `
                <img src="${outfitItem.article.image}" alt="${outfitItem.article.name}">
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

    saveOutfit() {
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
            
            if (!name || !categoryId || this.currentOutfitItems.length === 0) {
                alert('Please provide a name, select a category, and add at least one article');
                return;
            }

            const outfit = {
                id: Date.now().toString(),
                name: name,
                categoryId: categoryId,
                items: this.currentOutfitItems.map(item => ({
                    articleId: item.articleId,
                    x: item.x,
                    y: item.y
                })),
                createdAt: new Date().toISOString()
            };

            this.outfits.push(outfit);
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
            categoryElement.addEventListener('click', (e) => {
                e.preventDefault();
                this.showCategoryDetail(category);
            }, { passive: true });
            
            const outfitCount = outfitCounts[category.id] || 0;
            
            categoryElement.innerHTML = `
                <div class="category-icon">
                    <span class="material-icons">folder</span>
                </div>
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
            console.log('Categories rendered:', this.categories.length);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
            
            categoryOutfits.innerHTML = '';
            
            const categoryOutfitsList = this.outfits.filter(o => o.categoryId === category.id);
            
            if (categoryOutfitsList.length === 0) {
                categoryOutfits.innerHTML = '<p style="text-align: center; color: #666;">No outfits in this category yet.</p>';
            } else {
                categoryOutfitsList.forEach(outfit => {
                    const outfitElement = document.createElement('div');
                    outfitElement.className = 'outfit-card';
                    outfitElement.onclick = () => this.showOutfitDetail(outfit);
                    
                    outfitElement.innerHTML = `
                        <h3>${outfit.name}</h3>
                        <p>${outfit.items.length} item${outfit.items.length !== 1 ? 's' : ''}</p>
                    `;
                    
                    categoryOutfits.appendChild(outfitElement);
                });
            }
            
            this.navigateTo('categoryDetail');
            console.log('Category detail shown:', category.name);
        } catch (error) {
            console.error('Error showing category detail:', error);
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

    saveData() {
        try {
            localStorage.setItem(this.getStorageKey('categories'), JSON.stringify(this.categories));
            localStorage.setItem(this.getStorageKey('articles'), JSON.stringify(this.articles));
            localStorage.setItem(this.getStorageKey('outfits'), JSON.stringify(this.outfits));
            console.log('Data saved to localStorage');
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
                window.app.loadData();
                window.app.renderCategories();
                window.app.renderArticles();
                window.app.updateCategorySelect();
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
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
