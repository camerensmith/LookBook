# Lookbook – Closet, Outfits, and Collections (PWA)

Lookbook is a fast, privacy-first Progressive Web App to capture your closet, tag items, build outfits, and organize them into categories and collections – without ads or bloat.

Primary stakeholder: My girlfriend. She defined the acceptance criteria and guided feature planning. Her goals: an easy, simple, streamlined app to organize work/play/sleepwear, add seasonal/holiday groupings, and keep data trustworthy – no ads, minimal fluff, just the right amount of customization (tags, icons for categories/collections).

## Product Overview (portfolio case study)

- Problem: Existing apps were slow, buggy, ad-heavy, or felt noisy. Trust and speed were missing.
- Outcome: A lean, responsive PWA that works offline, respects user intent, and syncs when signed in.
- Vision: “Simple by default, powerful when needed.”

## Feature Highlights

### Closet (Articles)
- Capture via camera or upload
- Automatic background removal (client-side with manual brush/eraser tools)
- Name + tag on the same screen; duplicate name validation
- Search by name; multi-select tag filtering
- Long-press delete with confirmation; prevents deleting if in use by an outfit

### Outfit Builder
- Two modes:
  - Free placement with drag-and-drop (precise x/y saved)
  - Slot-based builder with locked alignment: Head, Jacket, Body, Legs, Feet, Accessory
- Live preview generation (canvas) and saved preview images
- Edit existing outfits in a dedicated modal with search + tag filtering
- Zoom modal with controls (+/–/Reset) and inline delete icon

### Categories and Collections
- Categories are simple folders for outfits (no auto-spawn from articles)
- Category cards support custom icons
- “Add Outfit” pulls from already created outfits via a multi-select modal
- “Create New” card is always visible in the categories dashboard
- Collections group categories; add existing categories or create one in-flow if none exist
- Tags can be applied to collections and categories

### Navigation and UX
- Precise back navigation (always returns to the immediate prior view)
- Mobile-first event handling (touchstart, long-press); larger hit targets
- Toast notifications replace alerts for non-blocking feedback
- Dark/light theme toggle (MUI icons), preference persisted
- Hangers section in Closet displays saved outfits (deduplicated)

### Persistence and Sync
- LocalStorage by default for offline-first performance
- Optional Firebase Auth (Google, Apple, Email/Password)
- Firestore integration for user-scoped cloud sync (UID-namespaced)
- Hybrid model: local backup + Firestore when signed in

## Enhancements and Bug Fixes (Selected)
- Fixed initial navigation mismatch; restored clickability and view activation
- Reliable back behavior across categories/collections
- Prevented duplicate outfits and improved counts in category tiles
- Touch-friendly drag-and-drop, long-press delete, passive listeners
- Slot alignment locked (Head top; Jacket|Body|Accessory row; Legs; Feet); Body centers when no accessory
- Prevented slot expansion; compact mobile sizing; `object-fit: contain`
- Saved outfit detail now renders with the same grid as builder
- Outfit search and tag filtering optimized
- Removed auto “My Outfits” creation; uncategorized outfits stay global
- Category “Add Outfit” uses modal; immediate category refresh on accept
- Zoom controls layered above image; added delete within zoom
- Closet and Categories empty states centered on mobile
- Removed alerts in favor of toasts; added theme toggle; replaced header text with `wordmark.png`

## Development Timeline (high-level)
1) Foundation: PWA shell, views, basic navigation; LocalStorage persistence
2) Closet flow: capture/upload, background removal, edit tools; save article with tags
3) Outfits: free placement + slot-based builder; previews; edit modal; zoom
4) Organization: categories (with icons), collections (group categories), add outfits via modal
5) Mobile UX: touch DnD, long-press delete, toasts, dark/light mode
6) Sync: Firebase Auth + Firestore (UID namespacing), hybrid local/cloud persistence
7) Polishing: alignment fixes, counts, dedupe, performance, empty states

## API, Auth, and Database
- Firebase Authentication: Google, Apple, Email/Password
- Firestore: user document namespace `users/{uid}/{collection}/data`
  - Collections: `categories`, `articles`, `outfits`, `collections`
  - Security rules: authenticated users can only read/write their own data
- Data model (simplified):
  - Article: `{ id, name, tags[], image, processedImage }`
  - Outfit: `{ id, name, previewImage, items[], slots? }` where items are free-form or `{slot, articleId, image}`
  - Category: `{ id, name, icon?, outfits[] }`
  - Collection: `{ id, name, description?, tags[], icon?, categoryIds[] }`

## Tech Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- UI: Material Icons, MUI web components (CDN)
- PWA: Manifest + Service Worker for offline capability
- Image: `@imgly/background-removal` (CDN) + Canvas for manual tools and previews
- Auth/DB/Hosting: Firebase (Auth, Firestore, Hosting)
- CI/CD: Firebase CLI + GitHub Actions for deploys

## Requirements
### Functional
- Capture or upload images; edit with background tools
- Save articles with unique names and optional tags
- Build outfits (free or slot-based); generate preview images
- Organize outfits into categories; group categories into collections
- Search and filter by tags; multi-select selection modals
- Delete with confirmation; prevent deleting in-use articles
- Zoom and edit previously saved outfits

### Non-Functional
- Mobile-first performance (touch-optimized, passive listeners)
- Offline-first with seamless local fallback
- Data integrity and privacy; no ads; explicit user control
- Simple, predictable navigation; minimal cognitive load
- Accessible UI (contrast, hit targets, keyboard-friendly on desktop)

## User Benefits (How features help)
- Background removal + brush/eraser: clean item cutouts for realistic outfit assembly
- Slot-based builder: fast composition with consistent alignment
- Tags + search + filters: quickly find items by season, use-case, or style
- Hangers view: one place to browse saved outfits visually
- Collections: plan capsules or seasonal sets by grouping categories
- Offline support: capture and organize anytime; sync later if signed in
- Dark mode + toasts: comfortable, unobtrusive, modern UX

## Setup (quick)
1) Clone the repo and open `index.html`
2) Optional: configure Firebase Auth + Firestore in `app.js`
3) Deploy with Firebase Hosting or any static host

## License
MIT
## Setup Instructions

### 1. Basic Setup
1. Download all files to a web server or local development environment
2. Ensure HTTPS is enabled (required for camera access)
3. Open `index.html` in a modern web browser

### 2. iOS Installation
1. Open Safari on your iPhone
2. Navigate to your app URL
3. Tap the Share button (📤)
4. Select "Add to Home Screen"
5. Your app will now appear as a native app icon

### 3. Camera Permissions
### 4. Firebase Authentication Setup (Optional)
1. Create a Firebase project in the Firebase Console
2. Enable Authentication providers you need:
   - Google: Auth → Sign-in method → Enable Google
   - Apple: Auth → Sign-in method → Enable Apple (requires Apple setup)
   - Email/Password: Enable Email/Password
3. Add a Web App to obtain your config (apiKey, authDomain, projectId, appId)
4. In `index.html`, Firebase scripts are already included (compat builds)
5. In `app.js`, replace the placeholder in `firebase.initializeApp({ ... })` with your config
6. For Apple sign-in on the web, set up your Apple services ID and redirect URIs per Firebase docs

- Grant camera access when prompted
- The app uses the rear-facing camera by default
- Ensure camera permissions are enabled in iOS Settings

## File Structure

```
lookbook/
├── index.html          # Main HTML file
├── styles.css          # CSS styling
├── app.js             # JavaScript functionality
├── manifest.json      # PWA manifest
├── sw.js             # Service worker
├── README.md          # This file
└── icons/             # App icons (create these)
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    └── icon-512x512.png
```

## Background Removal Integration

The app currently includes a simulated background removal feature. For production use, integrate with one of these services:

### Option 1: Remove.bg API
```javascript
// Replace simulateBackgroundRemoval in app.js
async function removeBackgroundWithAPI(imageData) {
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
            'X-Api-Key': 'YOUR_API_KEY',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            image_url: imageData,
            size: 'auto'
        })
    });
    
    return await response.blob();
}
```

### Option 2: Cloudinary Background Removal
```javascript
// Using Cloudinary's AI background removal
async function removeBackgroundWithCloudinary(imageData) {
    const formData = new FormData();
    formData.append('file', imageData);
    formData.append('upload_preset', 'YOUR_PRESET');
    formData.append('background_removal', 'true');
    
    const response = await fetch('https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload', {
        method: 'POST',
        body: formData
    });
    
    const result = await response.json();
    return result.secure_url;
}
```

### Option 3: Client-side ML Model
For offline functionality, consider using TensorFlow.js with a pre-trained background removal model.

## Browser Compatibility

- ✅ iOS Safari 12+
- ✅ Chrome 70+
- ✅ Firefox 65+
- ✅ Edge 79+
- ✅ Samsung Internet 10+

## PWA Features

- **Installable**: Add to home screen
- **Offline Support**: Works without internet
- **Responsive Design**: Optimized for mobile devices
- **Touch Gestures**: Native iOS-like interactions
- **Background Sync**: Handles offline actions

## Development

### Local Development Server
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

### HTTPS for Local Development
```bash
# Using mkcert (recommended)
mkcert localhost
python -m http.server 8000 --bind localhost

# Using ngrok
ngrok http 8000
```

## Customization

### Colors
Modify the CSS variables in `styles.css`:
```css
:root {
    --primary-color: #6366f1;
    --secondary-color: #8b5cf6;
    --background-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### Icons
Replace the icon files in the `icons/` directory with your own designs. Ensure all sizes are provided for optimal PWA support.

## Troubleshooting

### Camera Not Working
- Ensure HTTPS is enabled
- Check camera permissions in browser settings
- Try refreshing the page
- Ensure the device has a camera

### App Not Installing
- Check if the manifest.json is accessible
- Ensure all icon files exist
- Verify service worker registration
- Check browser console for errors

### Drag & Drop Issues
- Ensure touch events are properly handled on mobile
- Check if the element has the correct draggable attribute
- Verify event listeners are properly bound

## Future Enhancements

- [ ] Cloud sync across devices
- [ ] Social sharing of outfits
- [ ] AI-powered outfit suggestions
- [ ] Seasonal organization
- [ ] Export/import functionality
- [ ] Multiple user support
- [ ] Advanced filtering options

## License

This project is open source and available under the MIT License.

## Support

For issues or questions, please check the browser console for error messages and ensure all files are properly loaded.

---

**Note**: This is a demo application. For production use, implement proper error handling, input validation, and security measures.
