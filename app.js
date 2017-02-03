/* global page, Promise */
(function () {
  // The API entry point to retrieve the complete list of sites.
  var API_SITE_LIST = '/data/sites.json';

  // Fetch the site list from the API and create the list items.
  function loadSiteList () {
    return page.fetchJSON(API_SITE_LIST, true)
      .then(function (data) {
        renderSiteList(data.objects);
      });
  }

  // Creates the list items for the site list.
  // When loaded, these URLs will be will be
  // intercepted by the Service Worker.
  var renderSiteList = function (siteList) {
    var listEl = page.querySelector('#site-list');
    var listHTML = siteList.map(function (site) {
      var uriTokens = site.url.split('/');
      var id = uriTokens[uriTokens.length - 2];
      return [
        '<li itemtype="item" class="list-group-item" data-item-slug="' + page.sanitize(site.slug) + '" data-item-url="' + page.sanitize(site.url) + '">',
        '  <a href="./?id=' + id + '">',
        '    <span itemprop="name">',
        '    ' + page.sanitize(site.name),
        '    </span>',
        '    <img class="img-circle media-object pull-left" src="' + page.sanitize(site.image) + '" width="32" height="32">',
        '    <div class="media-body">',
        '      <strong>' + page.sanitize(site.name) + '</strong>',
        '      <p>' + page.sanitize(site.name) + '</p>',
        '    </div>',
        '  </a>',
        '</li>'
      ].join('\n');
    }).join('\n');
    listEl.innerHTML = listHTML;
  };

  page.complete.then(function () {
    return Promise.all([
      page.require('pwacompat')
    ]);
  }).then(function () {
    console.log('Loaded dependencies');
    loadSiteList();
  }).catch(console.error.bind(console));

/* global performance */

  // Some times we want to measure.
  var startTime = performance.now();
  var interpolationTime = 0;
  var fetchingModelTime = 0;

  // Here is the idea. This is the template for a site. It is
  // in charge of parsing which site is requested from the query-string
  // of the URL; fetch that site, and provide the data as context data to the
  // template. Once the template has been filled, we are going to mark the
  // document as cached and send to the render-store by sending the contents
  // to the Service Worker.

  // The cached mark is a simple `data-*` attribute on the `<html>` element.
  var isCached = document.documentElement.dataset.cached;

  if (isCached) {
    // If cached, log the times, and then we are done.
    logTime();
  } else {
    // If not, fetch the site info,
    // fill the character sheet,
    // log times,
    // and cache.
    var siteSlug = getSiteSlug();
    getSite(siteSlug)
      .then(fillCharSheet)
      .then(logTime)
      .then(cache);
  }

  function getQS (key) {
    // Would use `URLSearchParams` if there was better browser support.
    //return window.location.search.split(new RegExp('[?&]' + key + '=', 'i')[1].split(/[&#]/i)[0];
    return (window.location.search.match(new RegExp(key + '=([^&]+)', 'i')) || [])[1];
  }

  // Extract the site id from the query-string.
  function getSiteSlug () {
    return getQS('id');
  }

  // Fetch the site's info. as JSON.
  function getSite (slug) {
    var fetchingModelStart = performance.now();
    var url = API_SITE_LIST;
    return page.fetchJSON(url).then(response => {
      response = response.objects.filter(item => {
        return item.slug === slug;
      });
      fetchingModelTime = performance.now() - fetchingModelStart;
    });
  }

  // Take the contents of the body as the template, and
  // interpolate it with the site info.
  function fillCharSheet (site) {
    var element = document.querySelector('body');
    element.innerHTML = interpolateTemplate(element.innerHTML, site);
  }

  // Log times for interpolating, fetching, and total loading.
  function logTime () {
    console.log('Loading time:', (performance.now() - startTime) + ' ms');
    console.log('Interpolation time:', interpolationTime + ' ms');
    console.log('Fetching model time:', fetchingModelTime + ' ms');
  }

  // Mark the documents as cached, then get all the HTML content and send to
  // the Service Worker using a `PUT` request into the `./render-store/` URL.
  // You could be wondering we need to send the URL for the cached content,
  // but this info. is implicitly added as the `referrer` property of the
  // request.
  function cache () {
    document.documentElement.dataset.cached = true;
    var data = document.documentElement.outerHTML;
    fetch('./render-store/', {
      method: 'PUT',
      body: data
    }).then(function () {
      console.log('Page cached');
    });
  }

  // Look for `{{key}}` fragments inside the template and replace them with
  // the values of `site[key]`.
  function interpolateTemplate (template, site) {
    var interpolationStart = performance.now();
    var result = template.replace(/{{(\w+)}}/g, function (match, field) {
      return site[field];
    });
    interpolationTime = performance.now() - interpolationStart;
    return result;
  }
})();
