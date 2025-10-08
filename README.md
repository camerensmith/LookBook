# Lookbook - Personal Style Manager PWA

A Progressive Web App (PWA) for managing your clothing collection and creating outfits. Built with pure HTML, CSS, and JavaScript, optimized for iOS devices.

## Features

### 🗂️ Category Management
- Create custom categories (e.g., "Office", "Work", "School")
- Organize outfits by lifestyle or occasion
- View outfit counts per category

### 📸 Article Management
- **Camera Integration**: Take photos directly with your iPhone camera
- **Automatic Background Removal**: AI-powered background removal for clean clothing images
- **Tagging System**: Add descriptive tags for easy organization
- **Search & Filter**: Find articles by name or tags

### 👕 Outfit Builder
- **Drag & Drop Interface**: Intuitive outfit composition
- **Article Library**: Select from your saved clothing items
- **Positioning Control**: Arrange items exactly where you want them
- **Real-time Preview**: See your outfit come together as you build it

### 💾 Data Persistence
- **Local Storage**: All data saved locally on your device
- **Offline Support**: Works without internet connection
- **PWA Features**: Install as a native app on your home screen

### 🔐 Authentication (Optional)
- **Providers**: Google, Apple, and Email/Password via Firebase Auth
- **User-Scoped Data**: Data is namespaced by user ID when signed in
- **Guest Mode**: Works without an account; data stays on-device

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
