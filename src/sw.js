/*global UVServiceWorker, __uv$config*/
importScripts('uv.bundle.js');
importScripts('uv.config.js');
importScripts(__uv$config.sw || 'uv.sw.js');

const uv = new UVServiceWorker();

async function handleRequest(event) {
    try {
        // Route through UVServiceWorker for specific routes
        if (uv.route(event)) {
            return await uv.fetch(event);
        }
        // Fallback to network fetch for other requests
        return await fetch(event.request);
    } catch (error) {
        // Handle errors, potentially return a fallback response
        console.error('Fetch failed; returning offline page instead.', error);
        return new Response('Network error occurred', { status: 503 });
    }
}

self.addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event));
});
