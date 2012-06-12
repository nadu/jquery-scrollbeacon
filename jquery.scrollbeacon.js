(function ($, window) {
  "use strict";

  var VIEW_OUT = 0;
  var VIEW_CLIP_TOP = 4;
  var VIEW_INTERSECT = 2;
  var VIEW_CLIP_BOTTOM = 1;
  var VIEW_OVERLAP = 7;

  var NAMESPACE = 'scrollbeacon';
  var NAMESPACE_ELMID = NAMESPACE + '_elementid';
  var EV_APPEAR = 'appear.' + NAMESPACE;
  var EV_DISAPPEAR = 'disappear.' + NAMESPACE;
  var EV_POSTIONCHANGE = 'positionchange.' + NAMESPACE;
  var SCROLLBEACON_EVENTS = [EV_APPEAR, EV_DISAPPEAR, EV_POSTIONCHANGE];

  var DIRECTION_DOWN = 'down';
  var DIRECTION_UP = 'up';

  var scrollers = [];
  var jquery_scrollbeacon = $.scrollbeacon = {
    every: 34, // 30 fps
    VIEW_OUT: VIEW_OUT,
    VIEW_CLIP_BOTTOM: VIEW_CLIP_BOTTOM,
    VIEW_INTERSECT: VIEW_INTERSECT,
    VIEW_CLIP_TOP: VIEW_CLIP_TOP,
    VIEW_OVERLAP: VIEW_OVERLAP
  };

  var DEFAULT_OPTIONS = {
    parent: window,
    offset_t: 0,
    offset_b: 0,
    scrolltick: null,
    appear: null,
    disappear: null,
    positionchange: null
  };

  /**
   * jQuery.scrollbeacon
   * (c) 2012, Takashi Mizohata
   * MIT
   */
  $.fn.scrollbeacon = function () {
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
      throw new Error('parent has to be a single object.');
    }

    var scroller = $parent.data('scroller');
    if (scroller === undefined) {
      scroller = new Scroller($parent[0]);
    }
    scroller.setScrollTick(opts.scrolltick);

    var methods = {
      init: function (i, elm) {
        scroller.add(elm, opts);
        return this;
      },
      refresh: function (i, elm) {
        // console.log('scrollbeacon::refresh');
        var target = $(elm).data(NAMESPACE);
        if (target) {
          target.refresh();
        }
        else {
          scroller.add(elm, opts);
        }
        return this;
      }
    };

    return this.each(methods[method]);
  };

  // =========================

  var Scroller = function (elm) {
    var $elm = $(elm);
    this.elm = elm;
    this.targets = [];
    this.scrolltick = null;
    this.last_scroll = getNow();
    this.last_top = $elm.scrollTop();
    this.handler_tailing = false;
    this.tailing_function = $.proxy(this._tail, this);
    this.tailing_event = null;
    this.event_subscription = {};
    this.proxy_onscroll = $.proxy(this._onscroll, this);

    $elm.data('scroller', this);
  };

  Scroller.prototype._hookEventBinding = function (elm, event_type, direction, isScroller) {
    var $elm = $(elm);
    var elmid = getElementId($elm);
    var events = $elm.data('events');
    if (isScroller) {
      if (direction) {
        this.event_subscription[ [elmid, '/', event_type].join('') ] = true;
      }
      else {
        delete this.event_subscription[ [elmid, '/', event_type].join('') ];
      }
    }
    else {
      if (direction) {
        this.event_subscription[ [elmid, '/', event_type].join('') ] = true;
      }
      else if (events === undefined || !events[event_type]) {
        delete this.event_subscription[ [elmid, '/', event_type].join('') ];
      }
    }
    var isOn = $.map(this.event_subscription, function () {return 1;});
    if (isOn.length) {
      if (events === undefined || !events.scroll) {
        $(this.elm).on('scroll touchmove', this.proxy_onscroll);
      }
    }
    else {
      if (events && events.scroll) {
        $(this.elm).off('scroll touchmove', this.proxy_onscroll);
      }
    }
  };


  Scroller.prototype.setScrollTick = function (func) {
    if (typeof func === 'function') {
      this.scrolltick = func;
      this._hookEventBinding(this.elm, 'scrolltick', true, true);
    }
    return this;
  };

  Scroller.prototype.removeScrollTick = function () {
    this.scrolltick = null;
    this._hookEventBinding(this.elm, 'scrolltick', false, true);
    return this;
  };

  Scroller.prototype.add = function (elm, opts) {
    this.targets[this.targets.length] = new MovingTarget(this, elm, opts);
    return this;
  };

  Scroller.prototype.remove = function (target) {
    var result = false;
    var index = $.inArray(target, this.targets);
    if (index > -1) {
      result = true;
      this.targets.splice(index, 1);
    }
    return result;
  };

  Scroller.prototype.refresh = function () {
    // console.log('Scroller#refresh');
    $.each(
      this.targets,
      function (i, target) {
        target.refresh();
      }
    );
    return this;
  };

  Scroller.prototype._tail = function () {
    var tailev = this.tailing_event;
    this.handler_tailing = false;
    this.tailing_event = null;
    this._scrollimpl(tailev, true);
  };

  Scroller.prototype._onscroll = function (ev) {
    var now = getNow();
    if (now - this.last_scroll > jquery_scrollbeacon.every) {
      this.last_scroll = now;
      this._scrollimpl(ev);
      return;
    }

    if (this.handler_tailing) {
      clearTimeout(this.handler_tailing);
    }
    this.handler_tailing = setTimeout(this.tailing_function, jquery_scrollbeacon.every * 1.25 );
    this.tailing_event = ev;
  };

  Scroller.prototype._scrollimpl = function (ev, isTailing) {
    var scrollbeacon;
    var $elm = $(this.elm);
    var top = $elm.scrollTop();
    var delta = top - this.last_top;
    if (isTailing && delta === 0) {
      return;
    }
    scrollbeacon = ev.scrollbeacon = {
      direction: ((delta >= 0) ? DIRECTION_DOWN : DIRECTION_UP ),
      delta: delta
    };
    this.last_top = top;
    if (this.scrolltick) {
      this.scrolltick(ev);
    }

    $.each($.map(this.targets, findChanged(this.elm)), dispatchEvent(scrollbeacon));
  };

  // =============================================

  var MovingTarget = function (scroller, elm, opts) {
    var $elm = $(elm);
    var top_bottom = getTopBottom($elm, opts.offset_t, opts.offset_b);
    var pos = findPosition(scroller.elm, top_bottom.top, top_bottom.bottom);
    this.elm = elm;
    this.scroller = scroller;
    this.offset_t = opts.offset_t;
    this.offset_b = opts.offset_b;
    this.top = top_bottom.top;
    this.bottom = top_bottom.bottom;
    this.position = pos;
    this.in_view = (pos > VIEW_OUT);

    $elm.data(NAMESPACE, this);

    if (typeof opts.positionchange === 'function') {
      $elm.on(EV_POSTIONCHANGE, opts.positionchange);
    }
    if (typeof opts.appear === 'function') {
      $elm.on(EV_APPEAR, opts.appear);
    }
    if (typeof opts.disappear === 'function') {
      $elm.on(EV_DISAPPEAR, opts.disappear);
    }
  };

  MovingTarget.prototype.destroy = function () {
    var data = $(this.elm).data();
    this.stop();
    this.scroller.remove(this);
    this.elm = null;
    this.scroller = null;
    delete data[NAMESPACE];
    delete data[NAMESPACE_ELMID];
  };

  MovingTarget.prototype.stop = function () {
    var $elm = $(this.elm);
    $.each(
      SCROLLBEACON_EVENTS,
      function (i, str) {
        $elm.off(str);
      }
    );
    return this;
  };

  MovingTarget.prototype.refresh = function () {
    var tb = getTopBottom($(this.elm), this.offset_t, this.offset_b);
    var pos = findPosition(this.scroller.elm, tb.top, tb.bottom);
    this.top = tb.top;
    this.bottom = tb.bottom;
    this.position = pos;
    this.in_view = (pos > VIEW_OUT);
    return this;
  };

  // =========================

  /**
   * has side effects
   */
  var getElementId = function ($elm) {
    var id = $elm.data(NAMESPACE_ELMID);
    if (!id) {
      id = 'se_' + getNow();
      $elm.data(NAMESPACE_ELMID, id);
    }
    return id;
  };

  // =========================

  var getTopBottom = function ($elm, offset_t, offset_b) {
    var result = {top: Math.round($elm.offset().top + offset_t)};
    result.bottom = result.top + Math.round($elm.outerHeight(true) + offset_b);
    return result;
  };

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

  var dispatchEvent = function (scrollbeacon) {
    return function (i, mapped) {
      var e_ad; // Appear/Disappear
      var e_change = $.Event(EV_POSTIONCHANGE);
      var target = mapped.target;
      var $elm = $(target.elm);
      var s = $.extend({}, scrollbeacon);
      s.position = target.position;

      e_change.scrollbeacon = s;
      $elm.triggerHandler(e_change);

      if (mapped.event_ad) {
        if (target.in_view) {
          e_ad = $.Event(EV_APPEAR);
        }
        else {
          e_ad = $.Event(EV_DISAPPEAR);
        }
        e_ad.scrollbeacon = s;
        $elm.triggerHandler(e_ad);
      }
    };
  };

  var findChanged = function (parent) {
    return function (target, i) {
      var result;
      var pos = findPosition(parent, target.top, target.bottom);
      if (target.position !== pos) {
        result = {target: target};
        target.position = pos;
        if (pos > VIEW_OUT) {
          if (!target.in_view) {
            target.in_view = true;
            result.event_ad = true;
          }
        }
        else {
          if (target.in_view) {
            target.in_view = false;
            result.event_ad = true;
          }
        }
      }
      return result;
    };
  };

  // =============================================

  $.each(
    SCROLLBEACON_EVENTS,
    function (i, str) {
      var arr = str.split('.');
      var type = arr.shift();
      var ns = arr.join('.');
      $.event.special[type] = {
        add: function (handlerObj) {
          var target = $(this).data(ns);
          if (target) {
            target.scroller._hookEventBinding(target, type, true);
          }
        },
        remove: function (handlerObj) {
          var target = $(this).data(ns);
          if (target) {
            target.scroller._hookEventBinding(target, type, false);
          }
        }
      };
    }
  );

/***************************************************

	// as easy as
	$('.scrollbeacon').scrollbeacon(
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
	$('.scrollbeacon').scrollbeacon(
		{
			parent: '#scroll_parent',
			appear: function (ev) {
				// this event will be fired on scroll of the parent
			}
		}
	);

	// you can pass scrolltick
	// note you can only assign one on scroll per parent.
	// for performance reason
	$('.scrollbeacon').scrollbeacon(
		{
			scrolltick: function (ev) {
				// do something for every time, scroll gets fired,
				// as throttled
			}
		}
	);

	// you can get a parent by
	var parent = $('.scrollbeacon').data('scroller');
	parent.refresh();

	// or call the event
	$('.scroll').triggerHandler('refresh.scrollbeacon');

	// 

*****************************************************/

})(jQuery, window);