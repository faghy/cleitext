/*
 * Kross Booking loader, part of the Kross Booking plugin for Cleitext.
 * GPL-2.0-or-later.
 *
 * Cleitext adds this file only to pages that show the widget (a
 * `.kross-container`, from the block or the Fresco element). It loads, once
 * and in this order:
 *
 *   1. jQuery, unless the page already has it (the copy shipped with the
 *      plugin, never from a CDN);
 *   2. the widget's stylesheet and script from data.krossbooking.com, for the
 *      hotel, widget and version written on the container by the block.
 *
 * Why a loader instead of three tags: the Kross widget script needs jQuery
 * (it bundles Select2 and calls jQuery as soon as it runs), so jQuery must
 * have run before it. Scripts that Cleitext adds to a page are independent,
 * and a script added from JavaScript runs whenever it arrives: chaining them
 * here (the widget is requested in jQuery's `load` event) is what keeps the
 * order, as WordPress did with the script's `jquery` dependency.
 */
(function () {
  'use strict';

  var BASE = 'https://data.krossbooking.com/widget/v6/';
  var JQUERY = 'jquery-3.7.1.min.js';
  var SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  var NUMBER = /^[1-9][0-9]{0,9}$/;

  // Once per page, however many widgets it has.
  if (window.cleitextKrossBooking) return;

  /** The first container with a valid hotel, widget and version. */
  function configOf(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var hotel = nodes[i].getAttribute('data-hotel-id') || '';
      var widget = nodes[i].getAttribute('data-cx-widget') || '';
      var version = nodes[i].getAttribute('data-cx-version') || '6';
      if (SAFE_ID.test(hotel) && NUMBER.test(widget) && NUMBER.test(version)) {
        return { hotel: hotel, widget: widget, version: version };
      }
    }
    return null;
  }

  /** The address of jQuery: next to this file. */
  function jqueryUrl() {
    var self = document.currentScript;
    var src = self && self.src;
    if (!src) {
      var scripts = document.querySelectorAll('script[src*="/kross-booking/"]');
      src = scripts.length ? scripts[scripts.length - 1].src : '';
    }
    return src ? src.replace(/[^/?#]*(?:[?#].*)?$/, JQUERY) : '';
  }

  function addScript(src, onload) {
    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener('load', onload);
    script.addEventListener('error', function () {
      console.error('Kross Booking: could not load ' + src);
    });
    (document.body || document.head).appendChild(script);
    return script;
  }

  var nodes = document.querySelectorAll('.kross-container');
  if (!nodes.length) return;
  var config = configOf(nodes);
  if (!config) {
    console.warn('Kross Booking: set the hotel ID and widget ID in Settings → Kross Booking.');
    return;
  }
  window.cleitextKrossBooking = { config: config };

  var base = BASE + encodeURIComponent(config.hotel) + '/' + config.widget;
  var query = '?cache=' + config.version;

  var style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = base + '.css' + query;
  document.head.appendChild(style);

  function widget() {
    addScript(base + '.js' + query);
  }

  if (window.jQuery) {
    widget();
  } else {
    var url = jqueryUrl();
    if (url) addScript(url, widget);
    else console.error('Kross Booking: jQuery could not be found.');
  }
})();
