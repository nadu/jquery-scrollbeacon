(
function ($, window) {

  "use strict";

  var scrollers = [];
  var jquery_scrolling = $.scrolling = {
    every: 34 // 30 fps
  };

  var DEFAULT_OPTIONS = {
    parent: window,
    offset_t: 0,
    offset_b: 0,
    scroll: null,
    appear: null,
    disappear: null,
    positionchange: null
  };

  window.scrollers = scrollers;

  var EV_POSTIONCHANGE = 'positionchange.scrolling';
  var EV_APPEAR = 'appear.scrolling';
  var EV_DISAPPEAR = 'disappear.scrolling';

  /**
   * jQuery.scrolling
   * (c) 2012, Takashi Mizohata
   * MIT
   */
  $.fn.scrolling = function () {
    var method;
    var opts;
    var args;

    if (typeof arguments[0] === 'string') {
      method = arguments[0];
      opts = $.extend({}, DEFAULT_OPTIONS, arguments[1]|| {});
      args = Array.prototype.slice.call(arguments, 2);
    }
    else {
      method = 'init';
      opts = $.extend({}, DEFAULT_OPTIONS, arguments[0]|| {});
      args = Array.prototype.slice.call(arguments, 1);
    }

    var $parent = $(opts.parent);
    if ($parent.length === 0 || $parent.length > 1) {
      throw new Error('parent has to be unique.');
    }
    var scroller_index = $parent.data('scroller');
    var scroller;
    if (scroller_index === undefined) {
      scroller_index = scrollers.length;
      scroller = new Scroller($parent[0]);
      scrollers[scroller_index] = scroller;
      $parent.data('scroller', scroller_index);
    }
    else {
      scroller = scrollers[scroller_index];
    }
    if (typeof opts.scroll === 'function') {
      scroller.scroll = opts.scroll;
    }

    var methods = {
      init: function (i, elm) {
        var $elm = $(elm);
        console.log('scrolling::init ', i);
        scroller.add(elm, opts.offset_t, opts.offset_b);
        if (typeof opts.positionchange === 'function') {
          $elm.on(EV_POSTIONCHANGE, opts.positionchange);
        }
        if (typeof opts.appear === 'function') {
          $elm.on(EV_APPEAR, opts.appear);
        }
        if (typeof opts.disappear === 'function') {
          $elm.on(EV_DISAPPEAR, opts.disappear);
        }
        return this;
      },
      refresh: function (i, elm) {
        console.log('scrolling::refresh');
      }
    };

    return this.each(methods[method]);
  };

  // =========================

  var VIEW_OUT = 0;
  var VIEW_CLIP_TOP = 4;
  var VIEW_INTERSECT = 2;
  var VIEW_CLIP_BOTTOM = 1;
  var VIEW_OVERLAP = 7;

  var getNow = function () {
    return (new Date()).valueOf();
  };

  var findPosition = function (parent, t_top, t_bottom) {
    var result = VIEW_OUT;
    var $p = $(parent);
    var p_top = $p.scrollTop();
    var p_bottom = p_top + $p.height();
    if (t_bottom <= p_top) {
      // target is above viewport
    }
    else if (p_bottom <= t_top) {
      // target is below viewport
    } 
    else {
      if (t_top <= p_top) {
        if (p_bottom <= t_bottom) {
          // target is larger than viewport
          result = VIEW_OVERLAP;
        }
        else if (t_bottom <= p_bottom) {
          result = VIEW_CLIP_TOP;
        }
      }
      else if (p_top <= t_top) {
        if (t_bottom <= p_bottom) {
          // target is inside
          result = VIEW_INTERSECT;
        }
        else if (t_bottom <= t_bottom) {
          result = VIEW_CLIP_BOTTOM;
        }
      }
    }
    return result;
  };

  // =========================

  var Scroller = function (parent) {
    var $p = $(parent);
    this.parent = parent;
    this.children = [];
    this.scroll = null;

    this.last_scroll = getNow();
    this.last_top = $p.scrollTop();
    this.handler_tailing = false;
    this.tailing_function = $.proxy(this.tail, this);
    this.tailing_event = null;

    this.proxy_findChanged = $.proxy(this.findChanged, this);

    $p.on('scroll', $.proxy(this.onscroll, this));
    // for iOS
    $p.bind('touchmove', $.proxy(this.onscroll, this));
  };

  Scroller.prototype.add = function (elm, offset_t, offset_b) {
    var index = this.children.length;
    var $elm = $(elm);
    var top = Math.round($elm.offset().top) + offset_t;
    var bottom = top + Math.round($elm.outerHeight(true)) + offset_b;
    var pos = findPosition(this.parent, top, bottom);
    this.children[index] = {
      elm: elm,
      position: pos,
      in_view: (pos > VIEW_OUT),
      top: top,
      bottom: bottom,
      offset_t: offset_t,
      offset_b: offset_b
    }
  };

  Scroller.prototype.tail = function () {
    var tailev = this.tailing_event;
    this.handler_tailing = false;
    this.tailing_event = null;
    this.scrollimpl(tailev);
  };

  Scroller.prototype.onscroll = function (ev) {
    var now = getNow();
    if (now - this.last_scroll > jquery_scrolling.every) {
      this.last_scroll = now;
      this.scrollimpl(ev);
      return;
    }

    if (this.handler_tailing) {
      clearTimeout(this.handler_tailing);
    }
    this.handler_tailing = setTimeout(this.tailing_function, jquery_scrolling.every / 2 );
    this.tailing_event = ev;
  };

  Scroller.prototype.scrollimpl = function (ev) {
    var $p = $(this.parent);
    var top = $p.scrollTop();
    var delta = top - this.last_top;
    var direction = (delta >= 0);
    var scrolling = ev.scrolling = {
      direction: direction,
      delta: delta
    };
    this.last_top = top;
    if (this.scroll) {
      this.scroll(ev);
    }

    // FIXME 
    var re = $.map(this.children, this.proxy_findChanged);
    console.log('mapped: ', re);
    $.each(re, dispatchEvent(scrolling));
  };

  var dispatchEvent = function (scrolling) {
    return function (i, mapped) {
      var e_appear_disappear;
      var e_change = jQuery.Event(EV_POSTIONCHANGE);
      console.log('dispatching!: ', mapped);
      var child = mapped.child;
      var $elm = $(child.elm);
      var s = $.extend({}, scrolling);

      s.position = child.position;
      e_change.scrolling = s;

      $elm.triggerHandler(e_change);

      if (mapped.event_ad) {
        if (child.in_view) {
          e_appear_disappear = jQuery.Event(EV_APPEAR);
        }
        else {
          e_appear_disappear = jQuery.Event(EV_DISAPPEAR);
        }
        e_appear_disappear.scrolling = s;
        $elm.triggerHandler(e_appear_disappear);
      }
    }
  };

  // I wish js can take multiple value return... but it may be the same?
  Scroller.prototype.findChanged = function (child, i) {
    var result = undefined;
    var pos = findPosition(this.parent, child.top, child.bottom);
    if (child.position !== pos) {
      result = {child: child};
      child.position = pos;
      if (pos > VIEW_OUT) {
        if (!child.in_view) {
          child.in_view = true;
          result.event_ad = true;
        }
      }
      else {
        if (child.in_view) {
          child.in_view = false;
          result.event_ad = true;
        }
      }
    }
    return result;
  };

  Scroller.prototype.refresh = function () {
    // refresh all elements position
    console.log('implement me!');
  };

/***************************************************

	// as easy as
	$('.scrolling').scrolling(
		{
			appear: function (ev) {
				// do something when it comes into viewport
			},
			disappear: function (ev) {
				// do something when it gets out of viewport
			}
		}
	);

	// if you pass parent, it will attached to the parent
	$('.scrolling').scrolling(
		{
			parent: '#scroll_parent',
			appear: function (ev) {
				// this event will be fired on scroll of the parent
			}
		}
	);

	// you can pass ontick
	// note you can only assign one on scroll per parent.
  // for performance reason
	$('.scrolling').scrolling(
		{
			scroll: function (ev) {
				// do something for every time, scroll gets fired,
				// as throttled
			}
		}
	);

	// you can get a parent by
	var parent = $('.scrolling').data('scroller');
	parent.refresh();

	// or call the event
	$('.scroll').triggerHandler('refresh.scrolling');

*****************************************************/

})(jQuery, window);