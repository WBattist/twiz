/**
 * @type {import('../uv').UltravioletCtor}
 */
const Ultraviolet = self.Ultraviolet;

/**
 * @type {import('../uv').UVClientCtor}
 */
const UVClient = self.UVClient;

/**
 * @type {import('../uv').UVConfig}
 */
const __uv$config = self.__uv$config;

/**
 * @type {string}
 */
const __uv$cookies = self.__uv$cookies;

if (typeof __uv$cookies !== 'string') throw new TypeError('Unable to load global UV data');

if (!self.__uv) __uvHook(self);

self.__uvHook = __uvHook;

function __uvHook(window) {
    if (!window.window) {
        window.__uv$promise = new Promise(resolve => {
            window.onmessage = (e) => {
                if (e.data.__data instanceof MessagePort) {
                    __uvHookReal(window, new Ultraviolet.BareClient(e.data.__data));
                    delete window.onmessage;
                    resolve();
                } else {
                    throw new Error("unreachable: e.data !== MessagePort");
                }
            }
        });
    } else {
        __uvHookReal(window, new Ultraviolet.BareClient());
    }
}

function __uvHookReal(window, bareClient) {
    if ('__uv' in window && window.__uv instanceof Ultraviolet) return false;

    if (window.document && !!window.window) {
        window.document.querySelectorAll('script[__uv-script]').forEach(node => node.remove());
    }

    const worker = !window.window;
    const master = '__uv';
    const methodPrefix = '__uv$';
    const __uv = new Ultraviolet(__uv$config);
    const client = new UVClient(window, bareClient, worker);
    const { HTMLMediaElement, HTMLScriptElement, HTMLAudioElement, HTMLVideoElement, HTMLInputElement, HTMLEmbedElement, HTMLTrackElement, HTMLAnchorElement, HTMLIFrameElement, HTMLAreaElement, HTMLLinkElement, HTMLBaseElement, HTMLFormElement, HTMLImageElement, HTMLSourceElement } = window;

    client.nativeMethods.defineProperty(window, '__uv', { value: __uv, enumerable: false });

    __uv.meta.origin = location.origin;
    __uv.location = client.location.emulate(
        href => href === 'about:srcdoc' ? new URL(href) : new URL(__uv.sourceUrl(href.startsWith('blob:') ? href.slice('blob:'.length) : href)),
        href => __uv.rewriteUrl(href)
    );

    let cookieStr = __uv$cookies;
    __uv.meta.url = __uv.location;
    __uv.domain = __uv.meta.url.host;
    __uv.blobUrls = new window.Map();
    __uv.referrer = '';
    __uv.cookies = [];
    __uv.localStorageObj = {};
    __uv.sessionStorageObj = {};

    if (__uv.location.href === 'about:srcdoc') {
        __uv.meta = window.parent.__uv.meta;
    }

    if (window.EventTarget) {
        __uv.addEventListener = window.EventTarget.prototype.addEventListener;
        __uv.removeListener = window.EventTarget.prototype.removeListener;
        __uv.dispatchEvent = window.EventTarget.prototype.dispatchEvent;
    }

    client.nativeMethods.defineProperty(client.storage.storeProto, '__uv$storageObj', {
        get() {
            return this === client.storage.sessionStorage ? __uv.sessionStorageObj : __uv.localStorageObj;
        },
        enumerable: false,
    });

    if (window.localStorage) {
        for (const key in window.localStorage) {
            if (key.startsWith(methodPrefix + __uv.location.origin + '@')) {
                __uv.localStorageObj[key.slice((methodPrefix + __uv.location.origin + '@').length)] = window.localStorage.getItem(key);
            }
        }
        __uv.lsWrap = client.storage.emulate(client.storage.localStorage, __uv.localStorageObj);
    }

    if (window.sessionStorage) {
        for (const key in window.sessionStorage) {
            if (key.startsWith(methodPrefix + __uv.location.origin + '@')) {
                __uv.sessionStorageObj[key.slice((methodPrefix + __uv.location.origin + '@').length)] = window.sessionStorage.getItem(key);
            }
        }
        __uv.ssWrap = client.storage.emulate(client.storage.sessionStorage, __uv.sessionStorageObj);
    }

    let rawBase = window.document ? client.node.baseURI.get.call(window.document) : window.location.href;
    let base = __uv.sourceUrl(rawBase);

    client.nativeMethods.defineProperty(__uv.meta, 'base', {
        get() {
            if (!window.document) return __uv.meta.url.href;
            if (client.node.baseURI.get.call(window.document) !== rawBase) {
                rawBase = client.node.baseURI.get.call(window.document);
                base = __uv.sourceUrl(rawBase);
            }
            return base;
        },
    });

    __uv.methods = {
        setSource: methodPrefix + 'setSource',
        source: methodPrefix + 'source',
        location: methodPrefix + 'location',
        function: methodPrefix + 'function',
        string: methodPrefix + 'string',
        eval: methodPrefix + 'eval',
        parent: methodPrefix + 'parent',
        top: methodPrefix + 'top',
    };

    __uv.filterKeys = [
        master, __uv.methods.setSource, __uv.methods.source, __uv.methods.location, __uv.methods.function, __uv.methods.string, __uv.methods.eval, __uv.methods.parent, __uv.methods.top,
        methodPrefix + 'protocol', methodPrefix + 'storageObj', methodPrefix + 'url', methodPrefix + 'modifiedStyle', methodPrefix + 'config', methodPrefix + 'dispatched', 'Ultraviolet', '__uvHook',
    ];

    client.on('wrap', (target, wrapped) => {
        client.nativeMethods.defineProperty(wrapped, 'name', client.nativeMethods.getOwnPropertyDescriptor(target, 'name'));
        client.nativeMethods.defineProperty(wrapped, 'length', client.nativeMethods.getOwnPropertyDescriptor(target, 'length'));
        client.nativeMethods.defineProperty(wrapped, __uv.methods.string, { enumerable: false, value: client.nativeMethods.fnToString.call(target) });
        client.nativeMethods.defineProperty(wrapped, __uv.methods.function, { enumerable: false, value: target });
    });

    client.fetch.on('request', event => event.data.input = __uv.rewriteUrl(event.data.input));
    client.fetch.on('requestUrl', event => event.data.value = __uv.sourceUrl(event.data.value));
    client.fetch.on('responseUrl', event => event.data.value = __uv.sourceUrl(event.data.value));

    client.xhr.on('open', event => event.data.input = __uv.rewriteUrl(event.data.input));
    client.xhr.on('responseUrl', event => event.data.value = __uv.sourceUrl(event.data.value));

    client.workers.on('worker', event => event.data.url = __uv.rewriteUrl(event.data.url));
    client.workers.on('addModule', event => event.data.url = __uv.rewriteUrl(event.data.url));
    client.workers.on('importScripts', event => {
        for (const i in event.data.scripts) {
            event.data.scripts[i] = __uv.rewriteUrl(event.data.scripts[i]);
        }
    });
    client.workers.on('postMessage', event => {
        let to = event.data.origin;
        event.data.origin = '*';
        event.data.message = { __data: event.data.message, __origin: __uv.meta.url.origin, __to: to };
    });

    client.navigator.on('sendBeacon', event => event.data.url = __uv.rewriteUrl(event.data.url));

    client.document.on('getCookie', event => event.data.value = cookieStr);
    client.document.on('setCookie', event => {
        __uv.cookie.db().then(db => {
            __uv.cookie.setCookies(event.data.value, db, __uv.meta);
            __uv.cookie.getCookies(db).then(cookies => cookieStr = __uv.cookie.serialize(cookies, __uv.meta, true));
        });

        const cookie = __uv.cookie.setCookie(event.data.value)[0];
        if (!cookie.path) cookie.path = '/';
        if (!cookie.domain) cookie.domain = __uv.meta.url.hostname;

        if (__uv.cookie.validateCookie(cookie, __uv.meta, true)) {
            if (cookieStr.length) cookieStr += '; ';
            cookieStr += `${cookie.name}=${cookie.value}`;
        }

        event.respondWith(event.data.value);
    });

    client.element.on('setInnerHTML', event => {
        switch (event.that.tagName) {
            case 'SCRIPT':
                event.data.value = __uv.js.rewrite(event.data.value);
                break;
            case 'STYLE':
                event.data.value = __uv.rewriteCSS(event.data.value);
                break;
            default:
                event.data.value = __uv.rewriteHtml(event.data.value);
        }
    });

    client.element.on('getInnerHTML', event => {
        event.data.value = event.that.tagName === 'SCRIPT' ? __uv.js.handlerScript(event.data.value) : __uv.rewriteHtml(event.data.value, true);
    });

    client.element.on('setOuterHTML', event => {
        event.data.value = __uv.rewriteHtml(event.data.value, event.that.tagName === 'SCRIPT');
    });

    client.element.on('getOuterHTML', event => {
        event.data.value = event.that.tagName === 'SCRIPT' ? __uv.js.handlerScript(event.data.value) : __uv.rewriteHtml(event.data.value, true);
    });

    client.element.on('insertAdjacentHTML', event => {
        event.data.value = __uv.rewriteHtml(event.data.value, event.data.position === 'beforebegin' || event.data.position === 'afterend');
    });

    client.element.on('setProperty', event => {
        if (event.data.key === 'href') {
            event.data.value = __uv.rewriteUrl(event.data.value);
        }
    });

    client.element.on('getProperty', event => {
        if (event.data.key === 'href') {
            event.data.value = __uv.sourceUrl(event.data.value);
        }
    });

    const cookieSplit = cookieStr.split(/; ?/);
    for (const i in cookieSplit) {
        const cookie = __uv.cookie.setCookie(cookieSplit[i])[0];
        if (__uv.cookie.validateCookie(cookie, __uv.meta, false)) __uv.cookies.push(cookie);
    }

    const proxiedStyle = client.element.handle(HTMLStyleElement, '__uv$modifiedStyle', {
        set(value) {
            return __uv.rewriteCSS(value);
        },
        get(value) {
            return value;
        }
    });

    client.element.handle(HTMLBaseElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLAudioElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLVideoElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLIFrameElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLTrackElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLImageElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLEmbedElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLScriptElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLAnchorElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLAreaElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLLinkElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLSourceElement, '__uv$modifiedStyle', { get() { } });
    client.element.handle(HTMLInputElement, '__uv$modifiedStyle', { get() { } });

    client.element.handle(HTMLFormElement, '__uv$modifiedStyle', {
        set: value => value.replaceAll(/(<input[^<]*)/g, str => str.includes('type="submit"') ? `${str} onclick="this.form.action='${__uv.rewriteUrl(__uv.meta.url.href)}'"` : str),
    });

    if (worker) {
        window.addEventListener('message', e => {
            if (e.data.__origin && e.data.__data && e.data.__to) {
                const client = __uv.swClients.get(e.data.__to);
                if (client) client.postMessage(e.data.__data, e.data.__origin);
            }
        });
    }
}
