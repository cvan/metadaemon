/* global HTMLScriptElement */
(function () {
  var ls = {};
  try {
    ls = window.localStorage;
  } catch (e) {
  }

  var utils = {};
  utils.toArray = function (arrLike) {
    return Array.prototype.slice.call(arrLike);
  };
  utils.sanitize = (function () {
    var t = document.createElement('span');
    return function (str) {
      t.innerHTML = '';
      t.textContent = str;
      return t.innerHTML;
    };
  })();
  utils.fetchJSON = function (url, preferSkip) {
    // TODO: Move to a Worker.
    var storageKey = 'metadaemon:sites' + url;
    return new Promise(function (resolve, reject) {
      // Adapted from https://github.com/GoogleChrome/pwacompat/blob/master/pwacompat.js
      if (preferSkip) {  // Avoid performing XHR.
        var response;
        try {
          response = JSON.parse(ls[storageKey]);
        } catch (e) {
          // Ignore.
        }
        if (response) {
          resolve(response);
        }
      }
      var xhr = new XMLHttpRequest();
      xhr.open('get', url);
      xhr.addEventListener('load', function () {
        var response = JSON.parse(xhr.responseText);
        try {
          ls[storageKey] = xhr.responseText;
        } catch (e) {
          // Can't save. That is, the user is likely in private mode,
          // or the UA cannot allocate more storage space.
        }
        resolve(response);
      });
      xhr.addEventListener('error', function (err) {
        reject(err);
      });
      xhr.send();
    });
  };

  // Source: https://gist.github.com/revolunet/843889#gistcomment-1234286
  // LZW-compress a string.
  var lzwEncode = utils.lzwEncode = function (str) {
    var dict = {};
    var data = (str + '').split('');
    var out = [];
    var currChar;
    var phrase = data[0];
    var code = 256;
    for (var i = 1; i < data.length; i++) {
      currChar = data[i];
      if (dict['_' + phrase + currChar] != null) {
        phrase += currChar;
      } else {
        out.push(phrase.length > 1 ? dict['_' + phrase] : phrase.charCodeAt(0));
        dict['_' + phrase + currChar] = code;
        code++;
        phrase = currChar;
      }
    }
    out.push(phrase.length > 1 ? dict['_' + phrase] : phrase.charCodeAt(0));
    for (i = 0; i < out.length; i++) {
      out[i] = String.fromCharCode(out[i]);
    }
    return out.join('');
  };
  // Decompress an LZW-encoded string.
  var lzwDecode = utils.lzwDecode = function (str) {
    var dict = {};
    var data = (str + '').split('');
    var currChar = data[0];
    var oldPhrase = currChar;
    var out = [currChar];
    var code = 256;
    var phrase;
    for (var i = 1; i < data.length; i++) {
      var currCode = data[i].charCodeAt(0);
      if (currCode < 256) {
        phrase = data[i];
      } else {
         phrase = dict['_' + currCode] ? dict['_' + currCode] : (oldPhrase + currChar);
      }
      out.push(phrase);
      currChar = phrase.charAt(0);
      dict['_' + code] = oldPhrase + currChar;
      code++;
      oldPhrase = phrase;
    }
    return out.join('');
  };
  var encode = utils.encode = function (str) {
    return lzwEncode(unescape(encodeURIComponent(str)));
  };
  var decode = utils.decode = function (str) {
    return decodeURIComponent(escape(lzwDecode(str)));
  };

  function Page (opts) {
    var ctx = this.ctx = {
      scope: document,
      origin: window.location.origin,
      timeoutComplete: 15000,  // Timeout to page `complete` (15 sec).
      timeoutWorker: 150  // Timeout for worker messaging (150 ms).
    };
    Object.assign(ctx, opts);

    // Incrementing counter to attach to serialised nodes for lookup later.
    ctx._counter = 0;

    // Hash table of identifier => real DOM node.
    ctx._nodes = {};

    ctx._dependencies = {};

    ctx._promises = [];

    ctx._injectedScripts = {};

    var manifestLink = document.head.querySelector('link[rel="manifest"]');
    if (manifestLink && manifestLink.href) {
      var fetchManifest = utils.fetchJSON(manifestLink.href, true);
      ctx._promises.push(fetchManifest);
      fetchManifest.then(function (manifest) {
        ctx._manifest = manifest;
        return injectScript(manifest.main || 'index.js');
      }).catch(console.error.bind(console));
    }

    var loadServiceWorker = new Promise(function (resolve, reject) {
      // Resolve when the Service Worker is activated.
      if ('serviceWorker' in navigator) {
        if (navigator.serviceWorker.controller) {
          resolve();
          return;
        }
        fetchManifest.then(function (manifest) {
          navigator.serviceWorker.register(manifest.src, {
            scope: manifest.serviceworker.scope || '/'
          });
          navigator.serviceWorker.ready.then(resolve).catch(reject);
        });
      }
      resolve();
    });

    ctx._promises.push(loadServiceWorker);

    var injectScript = function (src) {
      var scriptPromise = new Promise(function (resolve, reject) {
        // Check if script was already injected or is still loading and about to be injected.
        if (ctx._injectedScripts[src]) {
          return ctx._injectedScripts[src];
        }
        var script = document.createElement('script');
        script.async = script.defer = true;
        script.src = src;
        script.addEventListener('load', function (evt) {
          resolve(evt);
        });
        script.addEventListener('error', function (evt) {
          delete ctx._injectedScripts[src];
          reject(evt);
        });
        document.body.appendChild(script);
      });
      ctx._injectedScripts[src] = scriptPromise;
      return scriptPromise;
    };

    return {
      serviceWorker: loadServiceWorker,
      complete: new Promise(function (resolve, reject) {
        var timeout = setTimeout(function () {
          reject(new Error('Page timed out on initializing'));
        }, ctx.timeoutComplete);
        return Promise.all(ctx._promises).then(function () {
          clearTimeout(timeout);
          resolve();
        }).catch(reject);
      }),
      manifest: fetchManifest,
      require: function (moduleName) {
        return fetchManifest.then(function (manifest) {
          var moduleVersion = manifest.dependencies[moduleName];
          var moduleUrl = 'https://unpkg.com/' + moduleName;
          if (moduleVersion) {
            moduleUrl += '@' + moduleVersion;
          }
          return injectScript(moduleUrl);
        });
      },
      injectScript: injectScript,
      querySelector: function (el, scope) {
        return (scope || ctx.scope).querySelector(el);
      },
      querySelectorAll: function (el) {
        return utils.toArray((scope || ctx.scope).querySelectorAll(el));
      },
      sanitize: utils.sanitize,
      fetchJSON: utils.fetchJSON
    };
  }

  window.page = new Page();
})();
