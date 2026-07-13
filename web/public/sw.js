// Stub service worker — unregisters itself so browsers stop requesting this file.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.registration.unregister());
