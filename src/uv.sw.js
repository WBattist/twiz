/*globals __uv$config*/
// Users must import the config (and bundle) prior to importing uv.sw.js
// This is to allow us to produce a generic bundle with no hard-coded paths.

/**
 * @type {import('../uv').UltravioletCtor}
 */
const Ultraviolet = self.Ultraviolet;

const cspHeaders = [
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'content-security-policy',
    'content-security-policy-report-only',
    'expect-ct',
    'feature-policy',
    'origin-isolation',
    'strict-transport-security',
    'upgrade-insecure-requests',
    'x-content-type-options',
    'x-download-options',
    'x-frame-options',
    'x-permitted-cross-domain-policies',
    'x-powered-by',
    'x-xss-protection',
];
const emptyMethods = ['GET', 'HEAD'];

class UVServiceWorker extends Ultraviolet.EventEmitter {
    constructor(config = __uv$config) {
        super();
        if (!config.prefix) config.prefix = '/service/';
        this.config = config;
        this.bareClient = new Ultraviolet.BareClient();
    }

    route({ request }) {
        return request.url.startsWith(location.origin + this.config.prefix);
    }

    async fetch({ request }) {
        let fetchedURL;

        try {
            if (!this.route({ request })) return fetch(request);

            const ultraviolet = new Ultraviolet(this.config);
            if (typeof this.config.construct === 'function') {
                this.config.construct(ultraviolet, 'service');
            }

            const db = await ultraviolet.cookie.db();
            ultraviolet.meta.origin = location.origin;
            ultraviolet.meta.base = ultraviolet.meta.url = new URL(ultraviolet.sourceUrl(request.url));

            const requestCtx = new RequestContext(request, ultraviolet, !emptyMethods.includes(request.method.toUpperCase()) ? await request.blob() : null);
            if (ultraviolet.meta.url.protocol === 'blob:') {
                requestCtx.blob = true;
                requestCtx.base = requestCtx.url = new URL(requestCtx.url.pathname);
            }

            if (request.referrer && request.referrer.startsWith(location.origin)) {
                const referer = new URL(ultraviolet.sourceUrl(request.referrer));
                if (requestCtx.headers.origin || (ultraviolet.meta.url.origin !== referer.origin && request.mode === 'cors')) {
                    requestCtx.headers.origin = referer.origin;
                }
                requestCtx.headers.referer = referer.href;
            }

            const cookies = (await ultraviolet.cookie.getCookies(db)) || [];
            const cookieStr = ultraviolet.cookie.serialize(cookies, ultraviolet.meta, false);
            requestCtx.headers['user-agent'] = navigator.userAgent;
            if (cookieStr) requestCtx.headers.cookie = cookieStr;

            const reqEvent = new HookEvent(requestCtx, null, null);
            this.emit('request', reqEvent);
            if (reqEvent.intercepted) return reqEvent.returnValue;

            fetchedURL = requestCtx.blob ? 'blob:' + location.origin + requestCtx.url.pathname : requestCtx.url;

            const response = await this.bareClient.fetch(fetchedURL, {
                headers: requestCtx.headers,
                method: requestCtx.method,
                body: requestCtx.body,
                credentials: requestCtx.credentials,
                mode: requestCtx.mode,
                cache: requestCtx.cache,
                redirect: requestCtx.redirect,
            });

            const responseCtx = new ResponseContext(requestCtx, response);
            const resEvent = new HookEvent(responseCtx, null, null);
            this.emit('beforemod', resEvent);
            if (resEvent.intercepted) return resEvent.returnValue;

            this.stripCSPHeaders(responseCtx);
            this.rewriteLocationHeader(responseCtx, ultraviolet);

            if (["document", "iframe"].includes(request.destination)) {
                this.handleContentDispositionHeader(responseCtx);
            }

            if (responseCtx.headers['set-cookie']) {
                await this.setCookiesAndUpdateClients(ultraviolet, responseCtx, db);
            }

            if (responseCtx.body) {
                responseCtx.body = await this.handleResponseBody(request, responseCtx, ultraviolet, cookies);
            }

            if (requestCtx.headers.accept === 'text/event-stream') {
                responseCtx.headers['content-type'] = 'text/event-stream';
            }
            if (crossOriginIsolated) {
                responseCtx.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
            }

            this.emit('response', resEvent);
            if (resEvent.intercepted) return resEvent.returnValue;

            return new Response(responseCtx.body, {
                headers: responseCtx.headers,
                status: responseCtx.status,
                statusText: responseCtx.statusText,
            });
        } catch (err) {
            if (!['document', 'iframe'].includes(request.destination)) {
                return new Response(undefined, { status: 500 });
            }

            console.error(err);
            return renderError(err, fetchedURL);
        }
    }

    stripCSPHeaders(responseCtx) {
        for (const name of cspHeaders) {
            if (responseCtx.headers[name]) delete responseCtx.headers[name];
        }
    }

    rewriteLocationHeader(responseCtx, ultraviolet) {
        if (responseCtx.headers.location) {
            responseCtx.headers.location = ultraviolet.rewriteUrl(responseCtx.headers.location);
        }
    }

    handleContentDispositionHeader(responseCtx) {
        const header = responseCtx.getHeader("content-disposition");
        if (!/\s*?((inline|attachment);\s*?)filename=/i.test(header)) {
            const type = /^\s*?attachment/i.test(header) ? 'attachment' : 'inline';
            const [filename] = new URL(responseCtx.request.url).pathname.split('/').slice(-1);
            responseCtx.headers['content-disposition'] = `${type}; filename=${JSON.stringify(filename)}`;
        }
    }

    async setCookiesAndUpdateClients(ultraviolet, responseCtx, db) {
        await ultraviolet.cookie.setCookies(responseCtx.headers['set-cookie'], db, ultraviolet.meta);
        const clients = await self.clients.matchAll();
        for (const client of clients) {
            client.postMessage({
                msg: 'updateCookies',
                url: ultraviolet.meta.url.href,
            });
        }
        delete responseCtx.headers['set-cookie'];
    }

    async handleResponseBody(request, responseCtx, ultraviolet, cookies) {
        switch (request.destination) {
            case 'script':
                return ultraviolet.js.rewrite(await responseCtx.raw.text());
            case 'worker': {
                const scripts = [ultraviolet.bundleScript, ultraviolet.clientScript, ultraviolet.configScript, ultraviolet.handlerScript]
                    .map(script => JSON.stringify(script))
                    .join(',');
                let body = `(async ()=>{${ultraviolet.createJsInject(ultraviolet.cookie.serialize(cookies, ultraviolet.meta, true), request.referrer)} importScripts(${scripts}); await __uv$promise;\n`;
                body += ultraviolet.js.rewrite(await responseCtx.raw.text());
                body += "\n})()";
                return body;
            }
            case 'style':
                return ultraviolet.rewriteCSS(await responseCtx.raw.text());
            case 'iframe':
            case 'document':
                if (responseCtx.getHeader("content-type")?.startsWith("text/html")) {
                    return this.handleHtmlResponse(responseCtx, ultraviolet, cookies, request.referrer);
                }
                break;
        }
        return responseCtx.raw.body;
    }

    async handleHtmlResponse(responseCtx, ultraviolet, cookies, referrer) {
        let modifiedResponse = await responseCtx.raw.text();
        if (Array.isArray(this.config.inject)) {
            const injectArray = this.config.inject;
            const url = new URL(responseCtx.request.url);
            for (const inject of injectArray) {
                const regex = new RegExp(inject.host);
                if (regex.test(url.host)) {
                    if (inject.injectTo === "head") {
                        modifiedResponse = this.injectIntoHtml(modifiedResponse, '<head>', inject.html);
                    } else if (inject.injectTo === "body") {
                        modifiedResponse = this.injectIntoHtml(modifiedResponse, '<body>', inject.html);
                    }
                }
            }
        }
        return ultraviolet.rewriteHtml(modifiedResponse, {
            document: true,
            injectHead: ultraviolet.createHtmlInject(
                ultraviolet.handlerScript,
                ultraviolet.bundleScript,
                ultraviolet.clientScript,
                ultraviolet.configScript,
                ultraviolet.cookie.serialize(cookies, ultraviolet.meta, true),
                referrer
            ),
        });
    }

    injectIntoHtml(html, tag, content) {
        const upperTag = tag.toUpperCase();
        const position = html.indexOf(tag);
        const upperPosition = html.indexOf(upperTag);
        if (position !== -1 || upperPosition !== -1) {
            return html.slice(0, position) + content + html.slice(position);
        }
        return html;
    }

    static Ultraviolet = Ultraviolet;
}

self.UVServiceWorker = UVServiceWorker;

class ResponseContext {
    constructor(request, response) {
        this.request = request;
        this.raw = response;
        this.ultraviolet = request.ultraviolet;
        this.headers = Object.fromEntries(response.rawHeaders);
        this.status = response.status;
        this.statusText = response.statusText;
        this.body = response.body;
    }

    get url() {
        return this.request.url;
    }

    get base() {
        return this.request.base;
    }

    set base(val) {
        this.request.base = val;
    }

    getHeader(key) {
        return Array.isArray(this.headers[key]) ? this.headers[key][0] : this.headers[key];
    }
}

class RequestContext {
    constructor(request, ultraviolet, body) {
        this.url = request.url;
        this.method = request.method;
        this.headers = Object.fromEntries(request.headers);
        this.body = body;
        this.ultraviolet = ultraviolet;
        this.base = null;
        this.blob = false;
    }
}

class HookEvent {
    constructor(context, intercepted, returnValue) {
        this.context = context;
        this.intercepted = intercepted;
        this.returnValue = returnValue;
    }
}

self.addEventListener('fetch', (event) => {
    event.respondWith((async () => {
        const uvServiceWorker = new UVServiceWorker();
        return uvServiceWorker.fetch(event);
    })());
});
