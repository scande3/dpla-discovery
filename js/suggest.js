/*
 * Copyright 2012, Google Inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author Dae Park (daepark@google.com)
 */

/*
 * Modified to search DPLA instead. Current contributers:
 * Steven Anderson (sanderson@bpl.org)
 * Tom Morris (http://tfmorris.blogspot.com)
 * Chris Strauber (Tufts University)
 */
(function($, undefined){

  if (!("console" in window)) {
    var c = window.console = {};
    c.log = c.warn = c.error = c.debug = function(){};
  }

  /**
   * jQuery UI provides a way to be notified when an element is removed from the DOM.
   * suggest would like to use this facility to properly teardown it's elements from the DOM (suggest list, flyout, etc.).
   * The following logic tries to determine if "remove" event is already present, else
   * tries to mimic what jQuery UI does (as of 1.8.5) by adding a hook to $.cleanData or $.fn.remove.
   */
  $(function() {
    var div = $("<div>");
    $(document.body).append(div);
    var t = setTimeout(function() {
      // copied from jquery-ui
      // for remove event
      if ( $.cleanData ) {
        var _cleanData = $.cleanData;
        $.cleanData = function( elems ) {
          for ( var i = 0, elem; (elem = elems[i]) != null; i++ ) {
            $( elem ).triggerHandler( "remove" );
          }
          _cleanData( elems );
        };
      }
      else {
        var _remove = $.fn.remove;
        $.fn.remove = function( selector, keepData ) {
          return this.each(function() {
            if ( !keepData ) {
              if ( !selector || $.filter( selector, [ this ] ).length ) {
                $( "*", this ).add( [ this ] ).each(function() {
                  $( this ).triggerHandler( "remove" );
                });
              }
            }
            return _remove.call( $(this), selector, keepData );
          });
        };
      }
    }, 1);
    div.bind("remove", function() {
      clearTimeout(t);
    });
    div.remove();
  });

  /**
   * These are the search parameters that are transparently passed
   * to the search service as specified by service_url + service_path
   */
  var SEARCH_PARAMS = {
      api_key:1, page_size:1, dataProvider:1, page:1 //  Add any other DPLA search params here
  };

  $.suggest = function(name, prototype) {

    $.fn[name] = function(options) {
      if (!this.length) {
        console.warn('Suggest: invoked on empty element set');
      }
      return this
        .each(function() {
          if (this.nodeName) {
            if (this.nodeName.toUpperCase() === 'INPUT') {
              if (this.type && this.type.toUpperCase() !== 'TEXT') {
                console.warn('Suggest: unsupported INPUT type: '+this.type);
              }
            }
            else {
              console.warn('Suggest: unsupported DOM element: '+this.nodeName);
            }
          }
          var instance = $.data(this, name);
          if (instance) {
            instance._destroy();
          }
          $.data(this, name, new $.suggest[name](this, options))._init();
        });
    };

    $.suggest[name] = function(input, options) {
      var self = this,
          o = this.options = $.extend(true, {},
                                      $.suggest.defaults,
                                      $.suggest[name].defaults,
                                      options),
          pfx = o.css_prefix = o.css_prefix || "",
          css = o.css;
      this.name = name;
      $.each(css, function(k, v) {
        css[k] = pfx + css[k];
      });

      // suggest parameters
      o.ac_param = {};
      $.each(SEARCH_PARAMS, function(k) {
        var v = o[k];
        if (v === null || v === "") {
          return;
        }
        o.ac_param[k] = v;
      });

      // flyout service lang is the first specified lang
      o.flyout_lang = null;
      if (o.ac_param.lang) {
        var lang = o.ac_param.lang;
        if ($.isArray(lang) && lang.length) {
          lang = lang.join(',');
        }
        if (lang) {
          o.flyout_lang = lang;
        }
      }

      // status texts
      this._status = {
        START: "",
        LOADING: "",
        SELECT: "",
        ERROR: ""
      };
      if (o.status && o.status instanceof Array && o.status.length >= 3) {
        this._status.START = o.status[0] || "";
        this._status.LOADING = o.status[1] || "";
        this._status.SELECT = o.status[2] || "";
        if (o.status.length === 4) {
          this._status.ERROR = o.status[3] || "";
        }
      }

      // create the container for the drop down list
      var s = this.status = $('<div style="display:none;">').addClass(css.status),
          l = this.list = $("<ul>").addClass(css.list),
          p = this.pane = $('<div style="display:none;" class="fbs-reset">').addClass(css.pane);

      p.append(s).append(l);

      if (o.parent) {
        $(o.parent).append(p);
      }
      else {
        p.css("position","absolute");
        if (o.zIndex) {
          p.css("z-index", o.zIndex);
        }
        $(document.body).append(p);
      }
      p.bind("mousedown", function(e) {
        //console.log("pane mousedown");
        self.input.data("dont_hide", true);
        e.stopPropagation();
      })
      .bind("mouseup", function(e) {
        //console.log("pane mouseup");
        if (self.input.data("dont_hide")) {
          self.input.focus();
        }
        self.input.removeData("dont_hide");
        e.stopPropagation();
      })
      .bind("click", function(e) {
        //console.log("pane click");
        e.stopPropagation();
        var s = self.get_selected();
        if (s) {
          self.onselect(s, true);
          self.hide_all();
        }
      });
      var hoverover = function(e) {
        self.hoverover_list(e);
      };
      var hoverout = function(e) {
        self.hoverout_list(e);
      };
      l.hover(hoverover, hoverout);
      //console.log(this.pane, this.list);

      this.input = $(input)
        .attr("autocomplete", "off")
        .unbind(".suggest")
        .bind("remove.suggest", function(e) {
          self._destroy();
        })
        .bind("keydown.suggest", function(e) {
          self.keydown(e);
        })
        .bind("keypress.suggest", function(e) {
          self.keypress(e);
        })
        .bind("keyup.suggest", function(e) {
          self.keyup(e);
        })
        .bind("blur.suggest", function(e) {
          self.blur(e);
        })
        .bind("textchange.suggest", function(e) {
          self.textchange();
        })
        .bind("focus.suggest", function(e) {
          self.focus(e);
        })
        .bind("paste.suggest input.suggest", function(e) {
          clearTimeout(self.paste_timeout);
          self.paste_timeout = setTimeout(function() {
            self.textchange();
          }, 0);
        });

        // resize handler
        this.onresize = function(e) {
          self.invalidate_position();
          if (p.is(":visible")) {
            self.position();
            if (o.flyout && self.flyoutpane && self.flyoutpane.is(":visible")) {
              var s = self.get_selected();
              if (s) {
                self.flyout_position(s);
              }
            }
          }
        };

        $(window)
          .bind("resize.suggest", this.onresize)
          .bind("scroll.suggest", this.onresize);
    };

    $.suggest[name].prototype = $.extend({}, $.suggest.prototype, prototype);
  };

  // base suggest prototype
  $.suggest.prototype = {

    _init: function() {},

    _destroy: function() {
      this.pane.remove();
      this.list.remove();
      this.input.unbind(".suggest");
      $(window)
        .unbind("resize.suggest", this.onresize)
        .unbind("scroll.suggest", this.onresize);
      this.input.removeData("data.suggest");
    },

    invalidate_position: function() {
      self._position = null;
    },

    status_start: function() {
      this.hide_all();
      this.status.siblings().hide();
      if (this._status.START) {
        this.status.text(this._status.START).show();
        if (!this.pane.is(":visible")) {
          this.position();
          this.pane_show();
        }
      }
      if (this._status.LOADING) {
        this.status.removeClass("loading");
      }
    },

    status_loading: function() {
      this.status.siblings().show();

      if (this._status.LOADING) {
        this.status.addClass("loading").text(this._status.LOADING).show();
        if (!this.pane.is(":visible")) {
          this.position();
          this.pane_show();
        }
      }
      else {
        this.status.hide();
      }
    },

    status_select: function() {
      this.status.siblings().show();
      if (this._status.SELECT) {
        this.status.text(this._status.SELECT).show();
      }
      else {
        this.status.hide();
      }
      if (this._status.LOADING) {
        this.status.removeClass("loading");
      }
    },

    status_error: function() {
      this.status.siblings().show();
      if (this._status.ERROR) {
        this.status.text(this._status.ERROR).show();
      }
      else {
        this.status.hide();
      }
      if (this._status.LOADING) {
        this.status.removeClass("loading");
      }
    },

    focus: function(e) {
      //console.log("focus", this.input.val() === "");
      var o = this.options,
          v = this.input.val();
      if (v === "") {
        this.status_start();
      }
      else {
        this.focus_hook(e);
      }
    },

    // override to be notified on focus and input has a value
    focus_hook: function(e) {
      //console.log("focus_hook", this.input.data("data.suggest"));

      //REMOVED THIS CONDITION: !this.input.data("data.suggest") &&
      if (!this.pane.is(":visible") &&
          $("." + this.options.css.item, this.list).length) {
        this.position();
        this.pane_show();
      }
    },

    keydown: function(e) {
      var key = e.keyCode;
      if (key === 9) { // tab
        this.tab(e);
      }
      else if (key === 38 || key === 40) { // up/down
        if (!e.shiftKey) {
          // prevents cursor/caret from moving (in Safari)
          e.preventDefault();
        }
      }
    },

    keypress: function(e) {
      var key = e.keyCode;
      if (key === 38 || key === 40) { // up/down
        if (!e.shiftKey) {
          // prevents cursor/caret from moving
          e.preventDefault();
        }
      }
      else if (key === 13) { // enter
        this.enter(e);
      }
    },

    keyup: function(e) {
      var key = e.keyCode;
      //console.log("keyup", key);
      if (key === 38) { // up
        e.preventDefault();
        this.up(e);
      }
      else if (key === 40) { // down
        e.preventDefault();
        this.down(e);
      }
      else if (e.ctrlKey && key === 77) {
        $(".fbs-more-link", this.pane).click();
      }
      else if ($.suggest.is_char(e)) {
        //this.textchange();
        clearTimeout(this.keypress.timeout);
        var self = this;
        this.keypress.timeout = setTimeout(function() {
                                             self.textchange();
                                           }, 0);
      }
      else if (key === 27) {
        // escape - WebKit doesn't fire keypress for escape
        this.escape(e);
      }
      return true;
    },

    blur: function(e) {
      //console.log("blur", "dont_hide", this.input.data("dont_hide"),
      //            "data.suggest", this.input.data("data.suggest"));
      if (this.input.data("dont_hide")) {
        return;
      }
      //DATA input defined here
      var data = this.input.data("data.suggest");
      this.hide_all();
    },

    tab: function(e) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        return;
      }

      var o = this.options,
      visible = this.pane.is(":visible") &&
        $("." + o.css.item, this.list).length,
        s = this.get_selected();

      //console.log("tab", visible, s);

      if (visible && s) {
        this.onselect(s);
        this.hide_all();
      }
    },

    enter: function(e) {
      var o = this.options,
          visible = this.pane.is(":visible");

      //console.log("enter", visible);

      if (visible) {
        if (e.shiftKey) {
          this.shift_enter(e);
          e.preventDefault();
          return;
        }
        else if ($("." + o.css.item, this.list).length) {
          var s = this.get_selected();
          if (s) {
            this.onselect(s);
            this.hide_all();
            e.preventDefault();
            return;
          }
          else if (!o.soft) {
            var data = this.input.data("data.suggest");
            if ($("."+this.options.css.item + ":visible", this.list).length) {
              this.updown(false);
              e.preventDefault();
              return;
            }
          }
        }
      }
      if (o.soft) {
        // submit form
        this.soft_enter();
      }
      else {
        e.preventDefault();
      }
    },

    soft_enter: function(e) {},

    shift_enter: function(e) {},

    escape: function(e) {
      this.hide_all();
    },

    up: function(e) {
      //console.log("up");
      this.updown(true, e.ctrlKey || e.shiftKey);
    },

    down: function(e) {
      //console.log("up");
      this.updown(false, null, e.ctrlKey || e.shiftKey);
    },

    updown: function(goup, gofirst, golast) {
      //console.log("updown", goup, gofirst, golast);
      var o = this.options,
          css = o.css,
          p = this.pane,
          l = this.list;

      if (!p.is(":visible")) {
        if (!goup) {
          this.textchange();
        }
        return;
      }
      var li = $("."+css.item + ":visible", l);

      if (!li.length) {
        return;
      }

      var first = $(li[0]),
          last = $(li[li.length-1]),
          cur = this.get_selected() || [];

      clearTimeout(this.ignore_mouseover.timeout);
      this._ignore_mouseover = false;

      if (goup) {//up
        if (gofirst) {
          this._goto(first);
        }
        else if (!cur.length) {
          this._goto(last);
        }
        else if (cur[0] == first[0]) {
          first.removeClass(css.selected);
          this.input.val(this.input.data("original.suggest"));
          this.hoverout_list();
        }
        else {
          var prev = cur.prevAll("."+css.item + ":visible:first");
          this._goto(prev);
        }
      }
      else {//down
        if (golast) {
          this._goto(last);
        }
        else if (!cur.length) {
          this._goto(first);
        }
        else if (cur[0] == last[0]) {
          last.removeClass(css.selected);
          this.input.val(this.input.data("original.suggest"));
          this.hoverout_list();
        }
        else {
          var next = cur.nextAll("."+css.item + ":visible:first");
          this._goto(next);
        }
      }
    },

    _goto: function(li) {
      li.trigger("mouseover.suggest");
      var d = li.data("data.suggest");
      this.input.val(d ? d.name : this.input.data("original.suggest"));
      this.scroll_to(li);
    },

    scroll_to: function(item) {
      var l = this.list,
          scrollTop = l.scrollTop(),
          scrollBottom = scrollTop + l.innerHeight(),
          item_height = item.outerHeight(),
          offsetTop = item.prevAll().length * item_height,
          offsetBottom = offsetTop + item_height;
      if (offsetTop < scrollTop) {
        this.ignore_mouseover();
        l.scrollTop(offsetTop);
      }
      else if (offsetBottom > scrollBottom) {
        this.ignore_mouseover();
        l.scrollTop(scrollTop + offsetBottom - scrollBottom);
      }
    },

    textchange: function() {
      this.input.removeData("data.suggest");
      this.input.trigger("fb-textchange", this);
      var v = this.input.val();
      if (v === "") {
        this.status_start();
        return;
      }
      else {
        this.status_loading();
      }
      this.request(v);
    },

    request: function() {},

    response: function(data) {
      if (!data) {
        return;
      }
      if ("cost" in data) {
        this.trackEvent(this.name, "response", "cost", data.cost);
      }

      if (!this.check_response(data)) {
        return;
      }
      var result = [];
      
      if ($.isArray(data)) {
        result = data;
      }
      else if ("docs" in data) {
        result = data.docs;
      }

      var args = $.map(arguments, function(a) {
        return a;
      });

      this.response_hook.apply(this, args);

      var first = null,
          self = this,
          o = this.options;
//name
//dataProvider
      $.each(result, function(i,n) {
        if (!n.id && n.mid) {
            // For compatitibility reasons, store the mid as id
            n.id = n.mid;
        }
        var li = self.create_item(n, data)
          .bind("mouseover.suggest", function(e) {
            self.mouseover_item(e);
          });
          li.data("data.suggest", n);
          self.list.append(li);
          if (i === 0) {
            first = li;
          }
        });

      this.input.data("original.suggest", this.input.val());

      if ($("."+o.css.item, this.list).length === 0 && o.nomatch) {
        var $nomatch = $('<li class="fbs-nomatch">');
        if (typeof o.nomatch === "string") {
          $nomatch.text(o.nomatch);
        }
        else {
          if (o.nomatch.title) {
            $nomatch.append($('<em class="fbs-nomatch-text">').text(o.nomatch.title));
          }
          if (o.nomatch.heading) {
            $nomatch.append($('<h3>').text(o.nomatch.heading));
          }
          var tips = o.nomatch.tips;
          if (tips && tips.length) {
            var $tips = $('<ul class="fbs-search-tips">');
            $.each(tips, function(i,tip) {
              $tips.append($("<li>").text(tip));
            });
            $nomatch.append($tips);
          }
        }
        $nomatch.bind("click.suggest", function(e) {
          e.stopPropagation();
        });
        this.list.append($nomatch);
      }

      args.push(first);
      this.show_hook.apply(this, args);
      this.position();
      this.pane_show();
    },

    pane_show: function() {
      var show = false;
      if ($("> li", this.list).length) {
        show = true;
      }
      if (!show) {
        this.pane.children(":not(." + this.options.css.list + ")")
          .each(function() {
            if ($(this).css("display") != "none") {
              show = true;
              return false;
            }
          });
      }
      if (show) {
        if (this.options.animate) {
          var self = this;
          this.pane.slideDown("fast", function() {
            self.input.trigger("fb-pane-show", self);
          });
        }
        else {
          this.pane.show();
          this.input.trigger("fb-pane-show", this);
        }
      }
      else {
        this.pane.hide();
        this.input.trigger("fb-pane-hide", this);
      }
    },

    create_item: function(data, response_data) {
      var css = this.options.css;
      var li = $("<li>").addClass(css.item);
      var label = $("<label>").text(data.name);
      li.append($("<div>").addClass(css.item_name).append(label));
      return li;
    },

    mouseover_item: function(e) {
      if (this._ignore_mouseover) {
        return;
      }
      var target = e.target;
      if (target.nodeName.toLowerCase() !== "li") {
        target = $(target).parents("li:first");
      }
      var li = $(target),
          css = this.options.css,
          l = this.list;
      $("."+css.item, l)
        .each(function() {
          if (this !== li[0]) {
            $(this).removeClass(css.selected);
          }
        });
      if (!li.hasClass(css.selected)) {
        li.addClass(css.selected);
        this.mouseover_item_hook(li);
      }
    },

    mouseover_item_hook: function($li) {},

    hoverover_list: function(e) {},

    hoverout_list: function(e) {},

    check_response: function(response_data) {
      return true;
    },

    response_hook: function(response_data) {
      //this.pane.hide();
      this.list.empty();
    },

    show_hook: function(response_data) {
      // remove anything next to list - added by other suggest plugins
      this.status_select();
    },

    position: function() {
      var p  = this.pane,
          o = this.options;

      if (o.parent) {
        return;
      }

      if (!self._position) {
        var inp = this.input,
            pos = inp.offset(),
            input_width = inp.outerWidth(true),
            input_height = inp.outerHeight(true);
        pos.top += input_height;

        // show to calc dimensions
        var pane_width = p.outerWidth(),
            pane_height = p.outerHeight(),
            pane_right = pos.left + pane_width,
            pane_bottom = pos.top + pane_height,
            pane_half = pos.top + pane_height / 2,
            scroll_left =  $(window).scrollLeft(),
            scroll_top =  $(window).scrollTop(),
            window_width = $(window).width(),
            window_height = $(window).height(),
            window_right = window_width + scroll_left,
            window_bottom = window_height + scroll_top;

        // is input left or right side of window?
        var left = true;
        if ('left' == o.align ) {
          left = true;
        }
        else if ('right' == o.align ) {
          left = false;
        }
        else if (pos.left > (scroll_left + window_width/2)) {
          left = false;
        }
        if (!left) {
          left = pos.left - (pane_width - input_width);
          if (left > scroll_left) {
            pos.left = left;
          }
        }

        if (pane_half > window_bottom) {
          // can we see at least half of the list?
          var top = pos.top - input_height - pane_height;
          if (top > scroll_top) {
            pos.top = top;
          }
        }
        this._position = pos;
      }
      p.css({top:this._position.top, left:this._position.left});
    },

    ignore_mouseover: function(e) {
      this._ignore_mouseover = true;
      var self = this;
      this.ignore_mouseover.timeout =
        setTimeout(function() {
          self.ignore_mouseover_reset();
        }, 1000);
    },

    ignore_mouseover_reset: function() {
      this._ignore_mouseover = false;
    },

    get_selected: function() {
      var selected = null,
      select_class = this.options.css.selected;
      $("li", this.list)
        .each(function() {
          var $this = $(this);
          if ($this.hasClass(select_class) &&
              $this.is(":visible")) {
            selected = $this;
            return false;
          }
        });
      return selected;
    },

    onselect: function($selected, focus) {
      var data = $selected.data("data.suggest");
      if (data) {
          //NOTE: Used to put selected value in box. Now doesn't.
          this.input.data("data.suggest", data)
              .trigger("fb-select", data);
        /*this.input.val(data.sourceResource.title.toString())
          .data("data.suggest", data)
          .trigger("fb-select", data);*/

        this.trackEvent(this.name, "fb-select", "index",
        $selected.prevAll().length);
      }
    },

    trackEvent: function(category, action, label, value) {
      this.input.trigger("fb-track-event", {
        category: category,
        action:action,
        label: label,
        value: value
      });
      //console.log("trackEvent", category, action, label, value);
    },

    hide_all: function(e) {
      this.pane.hide();
      this.input.trigger("fb-pane-hide", this);
    }

  };


  $.extend($.suggest, {

    defaults: {

      status: [
        'Start typing to get suggestions...',
        'Searching...',
        'Select an item from the list:',
        'Sorry, something went wrong. Please try again later'
      ],

      soft: false,

      nomatch: "no matches",

      // CSS default class names
      css: {
        pane: "fbs-pane",
        list: "fbs-list",
        item: "fbs-item",
        item_name: "fbs-item-name",
        selected: "fbs-selected",
        status: "fbs-status"
      },

      css_prefix: null,

      parent: null,

      // option to animate suggest list when shown
      animate: false,

      zIndex: null
    },

    strongify: function(str, substr) {
      // safely markup substr within str with <strong>
      var strong;
      var index = str.toLowerCase().indexOf(substr.toLowerCase());
      if (index >= 0) {
        var substr_len = substr.length;
        var pre = document.createTextNode(str.substring(0, index));
        var em = $("<strong>").text(str.substring(index, index + substr_len));
        var post = document.createTextNode(str.substring(index + substr_len));
        strong = $("<div>")
                   .append(pre).append(em).append(post);
      }
      else {
        strong = $("<div>").text(str);
      }
      return strong;
    },

    keyCode: {
      //BACKSPACE: 8,
      CAPS_LOCK: 20,
      //COMMA: 188,
      CONTROL: 17,
      //DELETE: 46,
      DOWN: 40,
      END: 35,
      ENTER: 13,
      ESCAPE: 27,
      HOME: 36,
      INSERT: 45,
      LEFT: 37,
      //NUMPAD_ADD: 107,
      //NUMPAD_DECIMAL: 110,
      //NUMPAD_DIVIDE: 111,
      NUMPAD_ENTER: 108,
      //NUMPAD_MULTIPLY: 106,
      //NUMPAD_SUBTRACT: 109,
      PAGE_DOWN: 34,
      PAGE_UP: 33,
      //PERIOD: 190,
      RIGHT: 39,
      SHIFT: 16,
      SPACE: 32,
      TAB: 9,
      UP: 38,
      OPTION: 18,
      APPLE: 224
    },

    is_char: function(e) {
      if (e.type === "keypress") {
        if ((e.metaKey || e.ctrlKey) && e.charCode === 118) {
          // ctrl+v
          return true;
        }
        else if ("isChar" in e) {
          return e.isChar;
        }
      }
      else {
        var not_char = $.suggest.keyCode.not_char;
        if (!not_char) {
          not_char = {};
          $.each($.suggest.keyCode, function(k,v) {
            not_char[''+v] = 1;
          });
          $.suggest.keyCode.not_char = not_char;
        }
        return !(('' + e.keyCode) in not_char);
      }
    },

    /**
     * Parse input string into actual query string and structured name:value list
     *
     * "bob dylan type:artist" -> ["bob dylan", ["type:artist"]]
     * "Dear... type:film name{full}:Dear..." -> ["Dear...", ["type:film", "name{full}:Dear..."]]
     */
    parse_input: function(str) {
        // only pick out valid name:value pairs
        // a name:value is valid
        // 1. if there are no spaces before/after ":"
        // 2. name does not have any spaces
        // 3. value does not have any spaces OR value is double quoted
        var regex = /(\S+)\:(?:\"([^\"]+)\"|(\S+))/g;
        var qstr = str;
        var filters = [];
        var overrides = {};
        var m = regex.exec(str);
        while (m) {
            if (m[1] in SEARCH_PARAMS) {
                overrides[m[1]] = $.isEmptyObject(m[2]) ? m[3] : m[2];
            }
            else {
                filters.push(m[0]);
            }
            qstr = qstr.replace(m[0], "");
            m = regex.exec(str);
        }
        qstr = $.trim(qstr.replace(/\s+/g, " "));
        return [qstr, filters, overrides];
    },

    is_system_type: function(type_id) {
      if (type_id == null) {
        return false;
      }
      return (type_id.indexOf("/type/") === 0);
    }
  });


  // some base implementation that we overwrite but want to call
  var base = {
    _destroy: $.suggest.prototype._destroy,
    show_hook: $.suggest.prototype.show_hook
  };


    // *THE* Freebase suggest implementation
    $.suggest("suggest", {
        _init: function() {
            var self = this,
                o = this.options;
            if (o.flyout_service_url == null) {
                o.flyout_service_url = o.service_url;
            }
            this.flyout_url = o.flyout_service_url;
            if (o.flyout_service_path) {
                this.flyout_url += o.flyout_service_path;
            }
            // set api key for flyout service (search)

            this.flyout_url = this.flyout_url.replace(/\$\{key\}/g, o.api_key);
            if (o.flyout_image_service_url == null) {
                o.flyout_image_service_url = o.service_url;
            }
            this.flyout_image_url = o.flyout_image_service_url;
            if (o.flyout_image_service_path) {
                this.flyout_image_url += o.flyout_image_service_path;
            }
            // set api key for image api
            this.flyout_image_url = this.flyout_image_url.replace(/\$\{key\}/g, o.api_key);

            if (!$.suggest.cache) {
                $.suggest.cache = {};
            }

            if (o.flyout) {
                this.flyoutpane = $('<div style="display:none;" class="fbs-reset">')
                    .addClass(o.css.flyoutpane);

                if (o.flyout_parent) {
                    $(o.flyout_parent).append(this.flyoutpane);
                }
                else {
                    this.flyoutpane.css("position","absolute");
                    if (o.zIndex) {
                        this.flyoutpane.css("z-index", o.zIndex);
                    }
                    $(document.body).append(this.flyoutpane);
                }
                var hoverover = function(e) {
                    self.hoverover_list(e);
                };
                var hoverout = function(e) {
                    self.hoverout_list(e);
                };
                this.flyoutpane.hover(hoverover, hoverout)
                    .bind("mousedown.suggest", function(e) {
                        e.stopPropagation();
                        self.pane.click();
                    });

                if (!$.suggest.flyout) {
                    $.suggest.flyout = {};
                }
                if (!$.suggest.flyout.cache) {
                    $.suggest.flyout.cache = {};
                }
            }
        },

    _destroy: function() {
      base._destroy.call(this);
      if (this.flyoutpane) {
        this.flyoutpane.remove();
      }
      this.input.removeData("request.count.suggest");
      this.input.removeData("flyout.request.count.suggest");
    },

    shift_enter: function(e) {
      if (this.options.suggest_new) {
        this.suggest_new();
        this.hide_all();
      }
    },

    hide_all: function(e) {
      this.pane.hide();
      if (this.flyoutpane) {
        this.flyoutpane.hide();
      }
      this.input.trigger("fb-pane-hide", this);
      this.input.trigger("fb-flyoutpane-hide", this);
    },

    request: function(val, page) {
      var self = this,
          o = this.options;

      var query = val;

      var filter = o.ac_param.filter || [];

      // SEARCH_PARAMS can be overridden inline
      var extend_ac_param = null;

      // TODO rip out all filter S-expression stuff (replace with simple type?
      if ($.type(filter) === "string") {
          // the original filter may be a single filter param (string)
          filter = [filter];
      }
      // clone original filters so that we don't modify it
      filter = filter.slice();
      if (o.advanced) {
          // parse out additional filters in input value
          var structured = $.suggest.parse_input(query);
          query = structured[0];
          if (structured[1].length) {
              // all advance filters are ANDs
              filter.push("(all " + structured[1].join(" ") + ")");
          }
          extend_ac_param = structured[2];
      }

      var data = {};
      data[o.query_param_name] = query;

      if (page) {
        data.page = page;
      }
      $.extend(data, o.ac_param, extend_ac_param);
      if (filter.length) {
          data.filter = filter;
      }
      $.param(data, true)
      var url = o.service_url + o.service_path + "?" + $.param(data, true);
      var cached = $.suggest.cache[url];
      if (cached) {
        this.response(cached, page ? page : 1, true);
        return;
      }

      var api_key = o.ac_param.api_key;
      if (api_key == null)
      {
          alert('Please set your API Key.');
          return false;
      }
      data.api_key = api_key;

      clearTimeout(this.request.timeout);
      
      var ajax_options = {
        url: o.service_url + o.service_path,
        data: data,
        traditional: true,
        beforeSend: function(xhr) {
          var calls = self.input.data("request.count.suggest") || 0;
          if (!calls) {
            self.trackEvent(self.name, "start_session");
          }
          calls += 1;
          self.trackEvent(self.name, "request", "count", calls);
          self.input.data("request.count.suggest", calls);
        },
        success: function(data) {

          $.suggest.cache[url] = data;
          data.prefix = val;  // keep track of prefix to match up response with input value
          self.response(data, page ? page : 1);
          
        },
        error: function(xhr) {
          self.status_error();
          self.trackEvent(self.name, "request", "error", {
            url: this.url,
            response: xhr ? xhr.responseText : ''
          });
          self.input.trigger("fb-error", Array.prototype.slice.call(arguments));
        },
        complete: function(xhr) {
          if (xhr) {
          }
        },
        dataType: "jsonp",
        cache: true
      };

      this.request.timeout = setTimeout(function() {
        $.ajax(ajax_options);
      }, o.xhr_delay);
    },

    create_item: function(data, response_data) {
        var css = this.options.css;
        var li =  $("<li>").addClass(css.item);
        var label = $("<label>")
            .append($.suggest.strongify(data.sourceResource.title.toString() || data._id, response_data.prefix));

        var name = $("<div>").addClass(css.item_name)
            .append(label);

        //Debating if to add
        if (data.sourceResource.subject) {
            for (var i = 0; i < data.sourceResource.subject.length; i++) {
                // $(":first", label).append($("<small>").text(" ("+data.sourceResource.subject[i].name+")"));
            }
        }

        //Not implemented yet
        var nt = data.notable;
        if ((nt != null && $.suggest.is_system_type(nt.id)) ||
            (this.options.scoring != null  &&
                this.options.scoring.toUpperCase() === 'SCHEMA')) {
            $(":first", label).append($("<small>").text(" ("+data._id+")"));
        }

        var types = data.type;
        li.append(name);
        var type = $("<div>").addClass(css.item_type);
        if (nt && nt.name) {
            type.text(nt.name);
        }
        else if (this.options.show_id && data._id) {
            // display human readable id if no notable type
            //type.text(data._id);

            //type.text(data.dataProvider.toString());
        }

        if (data.sourceResource.specType) {

            type.text(data.sourceResource.specType);
        }
        else {
            type.text(data.sourceResource.type);
        }

        name.prepend(type);

        //console.log("create_item", li);
        return li;
    },


    mouseover_item_hook: function(li) {
      var data = li.data("data.suggest");
      if (this.options.flyout) {
        if (data) {
          this.flyout_request(data);
        }
        else {
          //this.flyoutpane.hide();
        }
      }
    },

    check_response: function(response_data) {
      return response_data.prefix === this.input.val();
    },

    response_hook: function(response_data, page) {
      if (this.flyoutpane) {
        this.flyoutpane.hide();
      }
      if (page > 1) {
        $(".fbs-more", this.pane).remove();
      }
      else {
        //this.pane.hide();
        this.list.empty();
      }
    },

    show_hook: function(response_data, page, first) {
      base.show_hook.apply(this, [response_data]);

      var o = this.options,
          self = this,
          p = this.pane,
          l = this.list,
          result = response_data.docs,
          more = $(".fbs-more", p),
          suggestnew = $(".fbs-suggestnew", p),
          status = $(".fbs-status", p);

      // spell/correction
      var correction = response_data.correction;
      if (correction && correction.length) {
        var spell_link = $('<a class="fbs-spell-link" href="#">').text(correction[0])
          .bind("click.suggest", function(e) {
            e.preventDefault();
            e.stopPropagation();
            self.input.val(correction[0]).trigger("textchange");
          });
        self.status
          .empty()
          .append("Search instead for ")
          .append(spell_link)
          .show();
      }

      // more
        //o.page_size
       //alert(page);
      if (result && result.length && "count" in response_data && (o.page_size*page < response_data.count)) {

        if (!more.length) {
          var more_link = $('<a class="fbs-more-link" href="#" title="(Ctrl+m)">view more</a>');
          more = $('<div class="fbs-more">').append(more_link);
          more_link.bind("click.suggest", function(e) {
            e.preventDefault();
            e.stopPropagation();
            var m = $(this).parent(".fbs-more");
            self.more(m.data("page.suggest"));
          });
          l.after(more);
        }
          //response_data.cursor
        more.data("page.suggest", page+1);
        more.show();
      }
      else {
        more.remove();
      }

      // suggest_new
      /*if (o.suggest_new) {
        if (!suggestnew.length) {
          // create suggestnew option
          var button = $('<button class="fbs-suggestnew-button">');
          button.text(o.suggest_new);
          suggestnew = $('<div class="fbs-suggestnew">')
            .append('<div class="fbs-suggestnew-description">Your item not in the list?</div>')
            .append(button)
            .append('<span class="fbs-suggestnew-shortcut">(Shift+Enter)</span>')
            .bind("click.suggest", function(e) {
              e.stopPropagation();
              self.suggest_new(e);
            });
          p.append(suggestnew);
        }
        suggestnew.show();
      }
      else {
        suggestnew.remove();
      }*/

      // scroll to first if clicked on "more"
      if (first && first.length && page > 1) {
        var top = first.prevAll().length * first.outerHeight();
        var scrollTop = l.scrollTop();
        l.animate({scrollTop: top}, "slow", function() {
          first.trigger("mouseover.suggest");
        });
      }
    },

    suggest_new: function(e) {
      var v = this.input.val();
      if (v === "") {
        return;
      }
      //console.log("suggest_new", v);
      this.input
        .data("data.suggest", v)
        .trigger("fb-select-new", v);
      this.trackEvent(this.name, "fb-select-new", "index", "new");
      this.hide_all();
    },

    more: function(page) {
      if (page && page > 1) {
        var orig = this.input.data("original.suggest");
        if (orig !== null) {
          this.input.val(orig);
        }
        this.request(this.input.val(), page);
        this.trackEvent(this.name, "more", "page", page);
      }
      return false;
    },

    //FLYOUT DONE HERE
    flyout_request: function(data) {
        var self = this;
        var o = this.options;
        var sug_data = this.flyoutpane.data("data.suggest");

        if (sug_data && data.id === sug_data.id) {
            if (!this.flyoutpane.is(":visible")) {
                var s = this.get_selected();
                this.flyout_position(s);
                this.flyoutpane.show();
                this.input.trigger("fb-flyoutpane-show", this);
            }
            return;
        }

        // check $.suggest.flyout.cache
        var cached = $.suggest.flyout.cache[data.id];
        if (cached && cached.id && cached.html) {
            // CLI-10009: use cached item only if id and html present
            this.flyout_response(cached);
            return;
        }

        //this.flyoutpane.hide();
        var flyout_id = data.id;
        var url = this.flyout_url.replace(/\$\{id\}/g, data.id);


        var ajax_options = {
            url: url,
            traditional: true,
            beforeSend: function(xhr) {

                var calls = self.input.data("flyout.request.count.suggest") || 0;
                calls += 1;
                self.trackEvent(self.name, "flyout.request", "count", calls);
                self.input.data("flyout.request.count.suggest", calls);
            },
            success: function(data) {
                data["req:id"] = flyout_id;
                if (data['docs'] && data['docs'].length) {
                    data.html =
                        $.suggest.suggest.create_flyout(data['docs'][0],
                            self.flyout_image_url);
                }
                $.suggest.flyout.cache[flyout_id] = data;
                self.flyout_response(data);
            },
            error: function(xhr) {
                self.trackEvent(self.name, "flyout", "error", {
                    url:this.url,
                    response: xhr ? xhr.responseText : ''
                });
            },
            complete: function(xhr) {
                if (xhr) {
                    self.trackEvent(self.name, "flyout", "tid",
                        xhr.getResponseHeader("X-Metaweb-TID"));
                }
            },
            dataType: "jsonp",
            cache: true
        };
        if (o.flyout_lang) {
            ajax_options.data = {lang:o.flyout_lang};
        }

        clearTimeout(this.flyout_request.timeout);
        this.flyout_request.timeout =
            setTimeout(function() {
                $.ajax(ajax_options);
            }, o.xhr_delay);

        this.input.trigger("fb-request-flyout", ajax_options);
    },

    flyout_response: function(data) {
      var o = this.options,
          p = this.pane,
          s = this.get_selected() || [];
      if (p.is(":visible") && s.length) {
        var sug_data = s.data("data.suggest");
        if (sug_data && data["req:id"] === sug_data.id && data.html) {
          this.flyoutpane.html(data.html);
          this.flyout_position(s);
          this.flyoutpane.show()
            .data("data.suggest", sug_data);
          this.input.trigger("fb-flyoutpane-show", this);
        }
      }
    },

    flyout_position: function($item) {
      if (this.options.flyout_parent) {
        return;
      }

      var p = this.pane,
          fp = this.flyoutpane,
          css = this.options.css,
          pos = undefined,
          old_pos = {
            top: parseInt(fp.css("top"), 10),
            left: parseInt(fp.css("left"), 10)
          },
          pane_pos = p.offset(),
          pane_width = p.outerWidth(),
          flyout_height = fp.outerHeight(),
          flyout_width = fp.outerWidth();

      if (this.options.flyout === "bottom") {
        // flyout position on top/bottom
        pos = pane_pos;
        var input_pos = this.input.offset();
        if (pane_pos.top < input_pos.top) {
          pos.top -= flyout_height;
        }
        else {
          pos.top += p.outerHeight();
        }
        fp.addClass(css.flyoutpane + "-bottom");
      }
      else {
        pos = $item.offset();
        var item_height = $item.outerHeight();

        pos.left += pane_width;
        var flyout_right = pos.left + flyout_width,
            scroll_left =  $(document.body).scrollLeft(),
            window_right = $(window).width() + scroll_left;

        pos.top = pos.top + item_height - flyout_height;
        if (pos.top < pane_pos.top) {
          pos.top = pane_pos.top;
        }

        if (flyout_right > window_right) {
          var left = pos.left - (pane_width + flyout_width);
          if (left > scroll_left) {
            pos.left = left;
          }
        }
        fp.removeClass(css.flyoutpane + "-bottom");
      }

      if (!(pos.top === old_pos.top &&
            pos.left === old_pos.left)) {
        fp.css({top:pos.top, left:pos.left});
      }
    },

    hoverout_list: function(e) {
      if (this.flyoutpane && !this.get_selected()) {
        this.flyoutpane.hide();
      }
    }
  });

  // DPLA  suggest settings
  $.extend($.suggest.suggest, {

    defaults: {
      /**
       * filter, spell, lang, exact, scoring, key, prefixed, stemmed, format
       *
       * TODO: These represent the defaults for the Freebase search API.  
       * They need to be updated for the DPLA API.
       */

      // search filters 
      // TODO: Switch back to old style type parameter instead of filter S-expressions
      filter: null,

      // spelling corrections
      spell: null, // "always",

      exact: false,

      scoring: null,

      // language to search (default to en)
      lang: null, // NULL defaults to "en",

      // API key: required for DPLA
      api_key: null,

      prefixed: true,

      stemmed: null,

      format: null,

      // Enable structured input name:value pairs that get appended to the search filters
      // For example:
      //
      //   "bob dylan type:artist"
      //
      // Would get translated to the following request:
      //
      //    /freebase/v1/search?query=bob+dylan&filter=<original filter>&filter=(all type:artist)
      //
      advanced: true,

      // If an item does not have a "notable" field, display the id or mid of the item
      show_id: true,

      // query param name for the search service.
      // If query name was "foo": search?foo=...
      query_param_name: "q",

      // base url for autocomplete service
      service_url: "http://api.dp.la/v2",

      // service_url + service_path = url to autocomplete service
      // FIXME: items and collections have different service paths for search
      service_path: "/items",

      // 'left', 'right' or null
      // where list will be aligned left or right with the input
      align: null,

      // whether or not to show flyout on mouseover
      flyout: true,

      // default is service_url if NULL
      flyout_service_url: null,

      // flyout_service_url + flyout_service_path =
      // url to search with
      // output=(notable:/client/summary (description citation) type).
      // TODO: Need new template here (unless we've got everything in the search results already)
      flyout_service_path: "/items?id=${id}" + "&api_key=${key}",

      // default is service_url if NULL
      flyout_image_service_url: null,

      //TODO: Remove this unused parameter
      flyout_image_service_path:
          "/image${id}?maxwidth=75&key=${key}&errorid=/freebase/no_image_png",

      // jQuery selector to specify where the flyout
      // will be appended to (defaults to document.body).
      flyout_parent: null,

      // text snippet you want to show for the suggest
      // new option
      // clicking will trigger an fb-select-new event
      // along with the input value
      suggest_new: null,

      nomatch: {
        title: "No suggested matches",
        heading: "Tips on getting better suggestions:",
        tips: [
          "Enter more or fewer characters",
          "Add words related to your original search",
          "Try alternate spellings",
          "Check your spelling"
        ]
      },

      // CSS default class names
      css: {
        item_type: "fbs-item-type",
        flyoutpane: "fbs-flyout-pane"
      },

      // the delay before sending off the ajax request to the
      // suggest and flyout service
      xhr_delay: 200,

      //Number of results to return
      page_size: 35,

      dataProvider: null
    },

    /**
     * Get a value from an object multiple levels deep.
     */
     get_value_by_keys: function(obj, var_args) {
       var keys = $.isArray(var_args) ? var_args :
           Array.prototype.slice.call(arguments, 1);
       for (var i = 0; i < keys.length; i++) {
         obj = obj[keys[i]];
         if (obj == null) {
           break;
         }
       }
       return obj;
     },

    /**
     * Utility method to get values of an object specified by one or more
     * (nested) keys. For example:
     * <code>
     *   get_value(my_dict, ['foo', 'bar'])
     *   // Would resolve to my_dict['foo']['bar'];
     * </code>
     * The method will return null, if any of the path specified refers to
     * a null or undefined value in the object.
     *
     * If resolved_search_values is TRUE, this will flatten search api
     * values that are arrays of entities ({mid, name})
     * to an array of their names and ALWAYS return an array of strings
     * of length >= 0.
     */
    get_value: function(obj, path, resolve_search_values) {
      if (obj == null || path == null || path.length == 0) {
        return null;
      }
      if (!$.isArray(path)) {
        path = [path];
      }
      var v =  $.suggest.suggest.get_value_by_keys(obj, path);
      if (resolve_search_values) {
        if (v == null) {
          return [];
        }
        if (!$.isArray(v)) {
          v = [v];
        }
        var values = [];
        $.each(v, function(i, value) {
          if ($.type(value) === 'object') {
            if (value['name'] != null) {
              value = value['name'];
            }
            else if (value['id'] || value['mid']) {
              value = value['id'] || value['mid'];
            }
            else if (value['value'] != null) {
              // For cvts, value may contain other useful info (like date, etc.)
              var cvts = [];
              $.each(value, function(k, v) {
                if (k !== 'value') {
                  cvts.push(v);
                }
              });
              value = value['value'];
              if (cvts.length) {
                value += ' (' + cvts.join(', ') + ')';
              }
            }
          }
          if ($.isArray(value) && value.length) {
            value = value[0].value;
          }
          if (value != null) {
            values.push(value);
          }
        });
        return values;
      }
      // Cast undefined to null.
      return v == null ? null : v;
    },

    is_commons_id: function(id) {
      if (/^\/base\//.test(id) || /^\/user\//.test(id)) {
        return false;
      }
      return true;
    },

    /**
     * Create the flyout html content given the search result
     * containing output=(notable:/client/summary \
     * (description citation provenance) type).
     * The resulting html will be cached for optimization.
     *
     * @param data:Object - The search result with
     *   output=(notable:/client/summary \
     *   (description citation provenance) type)
     * @param flyout_image_url:String - The url template for the image url.
     *   The substring, "${id}", will be replaced by data.id. It is assumed all
     *   parameters to the flyout image service (api key, dimensions, etc.) is
     *   already encoded into the url template.
     */
    create_flyout: function(data, flyout_image_url) {

        var get_value_by_keys = $.suggest.suggest.get_value_by_keys;
        var get_value = $.suggest.suggest.get_value;
        var is_system_type = $.suggest.is_system_type;
        var is_commons_id = $.suggest.suggest.is_commons_id;

        //toString as sometimes array, sometimes just string...
        var name = data['sourceResource']['title'].toString();
        var id = null;
        var image = null;
        var notable_props = [];
        var notable_types = [];
        var notable_seen = {}; // Notable types already added
        var notable = get_value(data, 'notable');
        if (notable && notable['name']) {
            notable_types.push(notable['name']);
            notable_seen[notable['name']] = true;
        }
        if (notable && is_system_type(notable['id'])) {
            id = data['id'];
        }
        else {
            id = data['mid'];
            image = flyout_image_url.replace(/\$\{id\}/g, id);

        }

        id = data['sourceResource']['type']

        if(data['sourceResource']['specType'])
        {
            id = id + ' (' + data['sourceResource']['specType'] + ')';
        }

        if(data['object'])  {
            image = data['object'].toString();
        }
        else {
            /*if (data['sourceResource']['type'] == 'text') {
             image = 'http://dp.la/assets/icon-text-b2bb9d2fd006d8e87b24613a4d4f362e.gif';
             }
             else {
             image = 'http://dp.la/assets/icon-image-5353cdabb05a15a81b51f4ac0f1bfe7e.gif';
             }*/
            image = null;

        }



        if (data['sourceResource']['date']) {
            notable_props.push(['Date', data['sourceResource']['date']['displayDate']]);
        }

        if (data['sourceResource']['subject']) {
            if(jQuery.type(data['sourceResource']['subject']) != 'array') {
                notable_props.push(['Subject', data['sourceResource']['subject']]);
            }
            else {
                for (var i = 0; i < data['sourceResource']['subject'].length; i++) {
                    notable_props.push(['Subject', data['sourceResource']['subject'][i]['name']]);
                }
            }


        }

        if (data['sourceResource']['publisher']) {
            if(jQuery.type(data['sourceResource']['publisher']) != 'array') {
                notable_props.push(['Publisher', data['sourceResource']['publisher']]);
            }
            else {
                notable_props.push(['Publisher', data['sourceResource']['publisher'][0]]);
            }

        }

        if (data['sourceResource']['creator']) {
            if(jQuery.type(data['sourceResource']['creator']) != 'array') {
                notable_props.push(['Creator', data['sourceResource']['creator']]);
            }
            else {
                notable_props.push(['Creator', data['sourceResource']['creator'][0]]);
            }

        }

        //data['_id']



        descriptions = data['sourceResource']['description'];

        //notable_types.push(['Provider', data['dataProvider'][0]]);
        //notable_types.push(['URL', data['isShownAt']]);
        notable_types.push([data['dataProvider'].toString()]);


        var content = $('<div class="fbs-flyout-content">');
        if (name) {
            content.append($('<h1 id="fbs-flyout-title">').text(name));
        }
        content
            .append($('<h3 class="fbs-topic-properties fbs-flyout-id">')
                .text(id));
        notable_props = notable_props.slice(0, 3);
        $.each(notable_props, function(i, prop) {
            content.append($('<h3 class="fbs-topic-properties">')
                .append($('<strong>').text(prop[0] + ': '))
                .append(document.createTextNode(prop[1])));
        });
        if (descriptions) {
            content.append($('<h3 class="fbs-topic-properties">')
                .append($('<strong>').text('Description' + ': ')));
            if(jQuery.type(descriptions) != 'array') {
                desc_text = data['sourceResource']['description'];
                var article = $('<p class="fbs-topic-article">');

                article.append(document.createTextNode(' ' + desc_text));
                content.append(article);
            }
            else {
                for (var i = 0; i < descriptions.length; i++) {
                    desc_text = data['sourceResource']['description'][i];
                    var article = $('<p class="fbs-topic-article">');

                    article.append(document.createTextNode(' ' + desc_text));
                    content.append(article);
                }
            }

        }
        if (image) {
            content.children().addClass('fbs-flyout-image-true');
            content.prepend(
                $('<img id="fbs-topic-image" class="fbs-flyout-image-true" style="max-width:75px;" src="' +
                    image + '">'));
        }

        /*var flyout_types = $('<div class="fbs-attribution">');
         notable_types = notable_types.slice(0, 3);
         $.each(notable_types, function(i, prop) {
         flyout_types = flyout_types.append($('<h3 class="fbs-flyout-types">')
         .append($('<strong>').text(prop[0] + ': '))
         .append(document.createTextNode(prop[1])));
         });


         var footer = flyout_types;*/

        var flyout_types = $('<span class="fbs-flyout-types">')
            .text(notable_types.slice(0, 3).join(', '));
        var footer = $('<div class="fbs-attribution">').append(flyout_types);


        return $('<div>')
            .append(content)
            .append(footer)
            .html();
    }
  });


  var f = document.createElement("input");

})(jQuery);
