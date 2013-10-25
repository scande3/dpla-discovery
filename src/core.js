/**
 * 
 * Version @VERSION
 */


/**
 * Apply the specified input control behavior to an input with the specified options
 * 
 * @param control:InputControl - @see InputControl 
 * @param options:Object - dictionary of options that overwrite control.default_options
 */
$.fn._freebaseInput = function(control, options) {
    if (!options) options = {};
    return this
        .attr("autocomplete", "off")
        .each(function() {
            control.release(this);
            var owner = this;
            $.each(["focus", "click"], function(i,n) {
               $(owner).unbind(n, control.delegate(n)).bind(n, control.delegate(n));
            });
            
            // we might be just resetting the options
            if (typeof this['fb_id'] == 'undefined')
                this.fb_id = control.counter++;
            // flush cache
            control.cache[this.fb_id] = null;
            // store options in hash
            var o = {};
            $.extend(o, control.default_options, options);
            control.option_hash[this.fb_id] = o;
            
            // If initialize option is true then start off control as managed.
            if (options.initialize) {
                control.manage(this);
            }
        });
};

/**
 * use firebug's console if it exists
 */
fb.log = fb.error = fb.debug = function() {};
if (typeof console != "undefined" && console.log && console.error) {
    fb.log = console.log;
    fb.error = console.error;
    fb.debug = console.debug;
};


/**
 * a function wrapper to be invoked within a context object (thisArg) with
 * additional parameters (argArray).
 * 
 * @param fn:Function - Function to run.
 * @param thisArg:Object - Context in which to run the function (thisArg)
 * @param argArray:Array - extra arguments to be appended to func's own arguments.
 *          So if a callback invokes func with an eventObject, func will be called
 *          with: func(arg1, arg2,..., argN, eventObject)
 */
fb.delegate = function(fn, thisArg, argArray)  {
    if (typeof argArray == "undefined") 
        argArray = [];
    var dg = function(){
        // 'arguments' isn't technically an array, so we can't just use concat
        var f_args = [];
        for(var i=0, len=arguments.length; i<len; i++)
            f_args.push(arguments[i]);
        if (arguments.callee && arguments.callee.fn)
          return (arguments.callee.fn.apply(arguments.callee.thisArg, arguments.callee.argArray.concat(f_args)));
        return undefined;
    };

    dg.thisArg = thisArg;
    dg.fn = fn;
    dg.argArray = argArray;

    return (dg);
};

fb.quote_id = function(id) {
    if (id.charAt(0) == '/')
        return id;
    else
        return ('/' + encodeURIComponent(id));
};


/**
 * simple state object
 */
fb.state = function() {};
fb.state.prototype = {
    enter: function(data) {},
    exit: function(data) {},
    handle: function(data) {}
};

/**
 * simple state machine
 */
fb.state_machine = function(states) {
    // states: [["STATE_NAME_1", state_1],...,["STATE_NAME_n", state_n]]
    this.current_state = null;
    this.states = {};
    var owner = this;
    $.each(states, function(i,n) {
        n[1].sm = owner;
        owner.states[n[0]] = n[1];
        if (i==0) 
            owner.current_state = n[0];
    });
    if (!this.current_state)
        throw "StateMachine must be initialized with at least one state";
    this.states[this.current_state].enter();
};
fb.state_machine.prototype = {    
    transition: function(to_state, exit_data, enter_data, data) { //fb.log("state_machine.transition current_state: ", this.current_state, "to_state: ", to_state);
        // to_state: the target destination state
        // exit_data: the exit data for current state
        // enter_data: the enter data for to_state
        // data: the data for to_state.handle
        var target = this.states[to_state];
        if (!target) 
            throw("Unrecongized state:" + to_state);
        
        var source = this.states[this.current_state];
        
        // exit current state
        source.exit(exit_data);
        
        // enter target state
        target.enter(enter_data);
        
        this.current_state = to_state;
        
        // handle data
        this.handle(data);
    },
    handle: function(data) {
        if (data) 
            this.states[this.current_state].handle(data);
    }
};


/**
 * InputControl class
 */
fb.InputControl = function() {
    this.default_options = {};
    this.counter = 0;
    this.cache = {};
    this.option_hash = {};
    this.sm = null;
    this.delegates = {};
    this.dropdown_delay = 30;
    this.manage_delay = 20;
    this.release_delay = 10;
};

fb.InputControl.prototype = {
    /**
     * facility to reuse delegate functions with different arguments
     */
    delegate: function(fname, argArray) {
        if (!this.delegates[fname])
            this.delegates[fname] = fb.delegate(this[fname], this);
        this.delegates[fname].argArray = argArray ? argArray : [];
        return this.delegates[fname];
    },
    
    options: function(input) {//fb.log("this.options", input);
        var o = this.option_hash[input.fb_id];
        if (!o) 
            throw "Unknown input";
        return o;
    },
    
    transition: function(state) {
        if (this.sm)
            this.sm.transition(state);
    },
    
    handle: function(data) {
        if (this.sm)
            this.sm.handle(data);  
    },
    
    /**
     * get input value, if null, return empty string ("")
     */
    val: function(input) {
        var v = $(input).val();
        if (v == null) 
            return "";
        return $.trim(v);
    },
    
    /**
     * get "name" or "text" field of an object. if none return "unknown"
     */
    name: function(obj) {
        // backwards compatibility with data.text and data.name
        if (obj.text != null)
            return obj.text;
        if (obj.name != null)
            return obj.name;
        return "unknown";
    },
    
    /**
     * text change delay variable to length of string
     */
    delay: function(l) {
        var t = .3;
        if (l > 0)
            t = 1/(6 * (l-0.7)) + .3;
        return (t * 1000)/2;
    },   
    
    manage: function(input) {
        this.release(input);
        var owner = this;
        $.each(["blur", "keydown", "keypress", "keyup", "input", "paste"], function(i,n) {
           $(input).bind(n, owner.delegate(n));
        });
        this.transition("start");
        //this.handle({id:"TEXTCHANGE", input:input});
        this.manage_hook(input);
    },
    
    // over-ride to handle manage
    manage_hook: function(input) {},
    
    release: function(input) {//fb.log("release", input);
        var owner = this;
        try {
            // since we are leaving the autocomplete field, reset the "fired" 
            // flag
            delete this.options(input)["_fired"];
        } catch (e){
           // if release is called before options have been set, 
           // an (harmless) exception is thrown
        }
        $.each(["blur", "keydown", "keypress", "keyup", "input", "paste"], function(i,n) {
           $(input).unbind(n, owner.delegate(n)); 
        });
        
        this.transition("start");
        this.release_hook(input);
    },
    
    // over-ride to handle release
    release_hook: function(input) {},
    
    destroy: function(input) {
        //Clear all timeouts
        window.clearTimeout(this.manage_timeout);
        window.clearTimeout(this.release_timeout);
        window.clearTimeout(this.textchange_timeout);
        window.clearTimeout(this.loadmsg_timeout);
        
        //Clear all event binding
        var owner = this;
        $.each(["focus", "click"], function(i,n) {
           $(input).unbind(n, owner.delegate(n)); 
        });
        this.release(input);
    },
    
    focus: function(e) {//fb.log("on_focus", e);
        window.clearTimeout(this.manage_timeout);
        var input = e.target;
        try {
            this.options(input);
        }
        catch(e) {
            return;
        }
        this.manage_timeout = window.setTimeout(this.delegate("manage", [input]), this.manage_delay);     
    },

    blur: function(e) {//fb.log("on_blur", e.target, this, this.dont_release, this._input); 
        window.clearTimeout(this.release_timeout);
        var input = $(e.target)[0];
        if (this.dont_release) {
            // the current input we are losing focus on
            // because we've clicked on the list/listitem
            this._input = input;
            return;
        }
        this.release_timeout = window.setTimeout(this.delegate("release", [input]), this.release_delay);
    },

    keydown: function(e) {//fb.log("on_keydown", e.keyCode);
        switch(e.keyCode) {      
          case  9: // tab       
             this.tab(e);
             break;                
          case 38: // up
          case 40: // down
             // prevents cursor/caret from moving (in Safari)
             e.preventDefault();
             break;    
          default:
             break;
        }
    },

    keypress: function(e) {//fb.log("on_keypress", e.keyCode);
        switch(e.keyCode) {         
          case 38: // up
          case 40: // down
             // prevents cursor/caret from moving
             if (!e.shiftKey)
                 e.preventDefault();
             break;
          case 13: // return
                this.enterkey(e);
            break ;
            case 27: // escape
                this.escapekey(e);
                break;
          default:
             break;
        } 
    },

    keyup: function(e) {//fb.log("on_keyup", e.keyCode);
        switch(e.keyCode) {
            case 38: // up
                e.preventDefault();
                this.uparrow(e);
                break;
            case 40: // down
                e.preventDefault();
                this.downarrow(e);
                break;
            case  9: // tab       
            case 13: // enter
            case 16: // ctrl
            case 17: // shift
            case 18: // option/alt
            case 27: // escape
            case 37: // left
            case 39: // right
            case 224:// apple/command
                break;
            default:
                this.textchange(e);
                break;
        } 
    },
    
    click: function(e) {
        //Override this to handle mouseclicks
    },
    
    // Mozilla only, to detech paste
    input: function(e) {//fb.log("on_input", e);
        this.textchange(e);
    },
    
    // IE only, to detect paste
    paste: function(e) {//fb.log("on_paste", e);
        this.textchange(e);
    },
    
    uparrow: function(e) {
        this.handle({id:"UPARROW", input:e.target});    
    },
    
    downarrow: function(e) {
        this.handle({id:"DOWNARROW", input:e.target});
    },
    
    tab: function(e) {
        this.handle({id:"TAB", input:e.target, domEvent:e});
    },
    
    enterkey: function(e) {
        if(e.shiftKey) {
            this.handle({id:"ENTERKEY-SHIFT", input:e.target, domEvent:e});
        } else {
            this.handle({id:"ENTERKEY", input:e.target, domEvent:e});
        }
    },
    
    escapekey: function(e) {
        this.handle({id:"ESCAPEKEY", input:e.target});
    },
    
    textchange: function(e) {//fb.log("on_textchange", e.target);
        window.clearTimeout(this.textchange_timeout);
        // Save inputted text
        this.input_text = this.val(e.target);
        var delay = this.delay(this.input_text.length);
        this.textchange_timeout = window.setTimeout(this.delegate("textchange_delay", [e.target]), delay);
    },
    
    textchange_delay: function(input){//fb.log("on_textchange_delay", input);
        this.handle({id:"TEXTCHANGE", input:input});
    }
};

/**
 * InputSelectControl class
 * superClass: InputControl
 */
fb.InputSelectControl = function() {
    fb.InputControl.call(this);
    this.min_len = 1;
    this.should_filter = true;
    this.fudge = 8;
    this.loadmsg_delay = 50;
    
    /**
     * initialize the select state machine
     * 
     * states:
     *      start: 
     *      getting:
     *      selecting:
     */
    this.sm = new fb.state_machine([
        ["start", new state_start(this)],
        ["getting", new state_getting(this)],
        ["selecting", new state_selecting(this)]
    ]);
};
// inheritance: prototype/constructor chaining
fb.InputSelectControl.prototype = new fb.InputControl();
fb.InputSelectControl.prototype.constructor = fb.InputSelectControl;

// shorthand for fb.InputSelectControl.prototype
var p = fb.InputSelectControl.prototype;

p.get_list = function(){
    return $("#fbs_list > .fbs-bottomshadow > .fbs-ul")[0];
};

p.get_list_items = function(){
    return $(this.get_list()).children("li");
};

p.release_hook = function(input) {
    this.list_hide();
};

p.click_listitem = function(li) {//fb.log("click_listitem", li, this._input);
    this.handle({id:"LISTITEM_CLICK", item:li, input:this._input});
};

p.mousedown_list = function(e) {//fb.log("mousedown_list", e, this);
    // hack in IE/safari to keep suggestion list from disappearing when click/scrolling
    this.dont_release = true;    
};

p.mouseup_list = function(e) {//fb.log("mouseup_list", e, this, this._input);
    // hack in IE/safari to keep suggestion list from disappearing when click/scrolling
    if (this._input) {
        $(this._input).unbind("focus", this.delegate("focus")); 
        $(this._input).focus();
        window.setTimeout(this.delegate("reset_focus", [this._input]), 0);
        //$(this._input).focus(this.delegate("focus"));
    }
    this.dont_release = false;
};

p.reset_focus = function(input) {
    $(input).focus(this.delegate("focus"));
};

p.list_load = function(input) {//fb.log("list_load", input);
    throw "You must override InputSelectControl.prototype.list_load";
};

p.list_receive = function(input, txt, o) {//fb.log("list_receive", input, query, o);
    // handle errors
    if (o.status !== '200 OK') {
        fb.error("list_receive", o.code, o.messages, o);
        return;
    }
    
    // currently, list_receive recognizes results of the forms:
    // 1. { list: { listItems: [...] } }
    // 2. { results: [...] }
    // 3. { result: [...] }
    // 4. { query: { result: [...] } }
    var result = [];
    if (o.code == "/api/status/timedout"){
        this.handle({id:"TIMEOUT", input:input, result:result});
        return;
    }
    else if ("list" in o && "listItems" in o.list)
        result = o.list.listItems;
    else if ("result" in o)
        result = o.result;
    else if ("results" in o)
        result = o.results;
    else if ("query" in o && "result" in o.query) 
        result = o.query.result;
    else {
        fb.error("list_receive", o.code, "Unrecognized list result", o);
        return;
    }
    
    // hook to update cache
    this.list_receive_hook(input, txt, result);
    
    // handle result    
    this.handle({id:"LIST_RESULT", input:input, result:result});
};

p.list_receive_hook = function(input, txt, result) { 
    // overwrite to process search result
    // like updating the cache
};

p.position = function(element, input) {
    var options = this.options(input);
    var pos = $(input).offset({border: true, padding: true});
    var left = pos.left;
    var top = pos.top + input.clientHeight + this.fudge;
    
    var right = pos.left + options.width;
    var window_right = $(window).width() + document.body.scrollLeft;
    
    // If the right edge of the dropdown extends beyond the right
    //   of the screen then right-justify the dropdown to the input.
    if (right > window_right && options.width > $(input).outerWidth()) {
        left = left - (options.width - $(input).outerWidth()) + 4;
    }
    $(element)
        .css({top:top, left:left, width:options.width})
        .show();
}

p.list_show = function(input, result) {//fb.log("list_show", input, result);
    if (!input) 
        return;
    if (!result) 
        result = [];
    var options = this.options(input);  
    var txt = this.val(input);
    var list = null;
    if (!$("#fbs_list").length) {
        $(document.body)
            .append(
                '<div style="display:none;position:absolute" id="fbs_list" class="fbs-topshadow">' +
                    '<div class="fbs-bottomshadow">'+
                        '<ul class="fbs-ul"></ul>' +
                    '</div>' +
                '</div>');
        
        list = $("> .fbs-ul")[0];
    }
    if (!list) 
        list = this.get_list();    
    
    $("#fbs_list > .fbs-bottomshadow")
        .unbind()
        .mousedown(this.delegate("mousedown_list"))
        .mouseup(this.delegate("mouseup_list"))
        .scroll(this.delegate("mousedown_list"));
    
    
    // unbind all li events and empty list
    $("li", list)
        .each(function() {
            $(this).unbind();
            this.fb_data = null; // clean up expando variable "fb_data"
        });
    $(list).empty();
    
    var filter = this.filter;
    if (typeof options.filter == "function")
        filter = options.filter;
    
    if (!result.length)
        $(list).append(this.create_list_item({id:"NO_MATCHES", text:"no matches"}, null, options).addClass("fbs-li-nomatch"));
    
    var filtered = [];
    if(this.should_filter) {
        $.each(result, function(i, n) {
            if (filter.apply(null, [n, txt]))
                filtered.push(n);
        });
        filtered = this.filter_hook(filtered, result);
    } else {
        filtered = result;
    }
    var owner = this;    
    $.each(filtered, function(i, n) {
        $(list).append(owner.create_list_item(n, txt, options, i));
    });
    
    // hook to add additional html elemments and handlers
    // like "Create New" item under the list
    this.list_show_hook(list, input, options);
    
    this.position($("#fbs_list"), input);
};

p.list_show_hook = function(list, input, options) { };

p.filter_hook = function(filtered, result) {
    return filtered;
};

p.list_hide = function() {//fb.log("list_hide");
    $("#fbs_list").hide();
    this.list_hide_hook();
};

p.list_hide_hook = function() {};

p.create_list_item = function(data, txt, options, index) {
    var li = $("<li class='fbs-li'></li>")[0];
    
    var trans = this.transform;
    if (typeof options.transform == "function")
        trans = options.transform;
    
    var html = trans.apply(this, [data, txt]);
   
    $(li).append(html);
    
    data.index = index;
    
    // sometimes data contains text and/or name
    if ("text" in data)
        data.name = data.text;
    
    li.fb_data = data;
    
    var owner = this;
    return $(li)
        .mouseover(function(e) { 
            owner.list_select(null, this, options); 
        })
        .click(function(e) { 
            owner.click_listitem(this);
        });
};

/**
 * The default filter
 * 
 * @param data - The individual item from the ac_path service.
 * @return TRUE to include in list or FALSE to exclude from list.
 */
p.filter = function(data, txt) {
    return true;
};

/**
 * The default transform
 * 
 * @param data - The individual item from the ac_path service
 * @param txt - The input string
 * @param options - Options used for the input
 * @return a DOM element or html that will be appended to an <li/>
 */
p.transform = function(data, txt) {
    return data;
};

/**
 * show loading message
 */
p.loading_show = function(input, content) {
    
    content = typeof(content) == "string" ? content : "loading...";
    this.list_hide();
    if (!$("#fbs_loading").length || (this._last_loading_content != content) ){
        $("#fbs_loading").remove();
        $(document.body)
            .append(
                '<div style="display:none;position:absolute" id="fbs_loading" class="fbs-topshadow">' +
                    '<div class="fbs-bottomshadow">'+
                        '<ul class="fbs-ul">' +
                            '<li class="fbs-li">'+ 
                                '<div class="fbs-li-name">'+ content + '</div>' +
                            '</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>');        
    }
    this._last_loading_content = content;
    this.position($("#fbs_loading"), input);
};

/**
 * hide loading message
 */
p.loading_hide = function() {
    $("#fbs_loading").hide();
};

p.list_select = function(index, li, options) {
    var sli = null;
    this.get_list_items().each(function(i,n) {
        if (i == index || li == n) {
            $(n).addClass("fbs-li-selected");
            sli = n;
        }
        else 
            $(n).removeClass("fbs-li-selected");
    });
    this.list_select_hook(sli, options);
    return sli;
};

/**
 * list select hook
 * @param sli - list item (li) html element
 */
p.list_select_hook = function(sli, options) { };

p.list_length = function() {
    return this.get_list_items().length;
};

p.list_selection = function(returnObj) {
    if (!returnObj) 
        returnObj = {};
    returnObj.index = -1;
    returnObj.item = null;
    this.get_list_items().each(function(i,n){
        if (n.className.indexOf("fbs-li-selected") != -1) {
            returnObj.index = i;
            returnObj.item = n;
            return false;
        }
    });
    return returnObj;
}

p.list_select_next = function(options, data) {
    var len = this.list_length();
    var obj = this.list_selection();
    var index = obj.index+1;
    if (index >=0 && index < len){
        var sel = this.list_select(index, null, options);
        // Change input value to reflect selected item
        var txt = $(".fbs-li-name", sel).text();
        $(data.input).val(txt);
        return sel
    } else if (options.soft) {
        // Since no item is currently selected,
        //   change input value to reflect previously inputted text
        $(data.input).val(this.input_text);
        return this.list_select(null, null, options);
    } else if (len > 0) {
        return this.list_select(0, null, options);
    }
    return null;
};

p.list_select_prev = function(options, data) {
    var len = this.list_length();
    var obj = this.list_selection();
    var index = obj.index-1;
    if (index >=0 && index < len) {
        var sel = this.list_select(index, null, options);
        // Change input value to reflect selected item
        var txt = $(".fbs-li-name", sel).text();
        $(data.input).val(txt);
        return sel
    } else if (options.soft) {
        if (index < -1 && len > 0) {
            return this.list_select(len - 1, null, options);
        } else {
            // Since no item is currently selected,
            //   change input value to reflect previously inputted text
            $(data.input).val(this.input_text);
            return this.list_select(null, null, options);
        }
    } else if (len > 0)
        return this.list_select(len - 1, null, options);
    return null;
};

p.scroll_into_view = function(elt, p) {
    if (!elt)
        return;
    if (!p)
        p = elt.parentNode;
    if (!p) {
        elt.scrollIntoView(false);
        return;
    }

    if (elt.offsetTop < p.scrollTop) {
        p.scrollTop = elt.offsetTop;
        return;
    }
    
    var elt_h = $(elt).height();
    var p_h = $(p).height();
    if ((elt.offsetTop + elt_h) > (p.scrollTop + p_h)) {
        p.scrollTop = elt.offsetTop + elt_h - p_h;
    }
};

/**
 * emphasize part of the html text with <em/>
 */
p.em_text = function(text, em_str) {
    var em = text;
    var index = text.toLowerCase().indexOf(em_str.toLowerCase());
    if (index >= 0) {    
        em = text.substring(0, index) + 
        '<em class="fbs-em">' +
        text.substring(index, index+em_str.length) +
        '</em>' +
        text.substring(index + em_str.length);
    }
    return em;
};

p.caret_last = function(input) {
    var l = this.val(input).length;
    if (input.createTextRange) {
        // IE
        var range = input.createTextRange();;
        range.collapse(true);
        range.moveEnd("character", l);
        range.moveStart("character", l);
        range.select();
    }
    else if (input.setSelectionRange) {
        // mozilla
        input.setSelectionRange(l, l);
    }
};

/**
 * base class for all select states
 * @param c:InputSelectControl
 */
function select_state(c) {
    fb.state.call(this);
    this.c = c;
};
// inheritance: prototype/constructor chaining
select_state.prototype = new fb.state();
select_state.prototype.constructor = select_state;

/**
 * state: start
 */
function state_start(c) {
    select_state.call(this, c);
};
// inheritance: prototype/constructor chaining
state_start.prototype = new select_state();
state_start.prototype.constructor = state_start;

state_start.prototype.handle = function(data) {//fb.log("state_start.handle", data);
    if (!data || !data.input) 
        return;
    var options = this.c.options(data.input);
    switch (data.id) {
        case "TEXTCHANGE":
        case "DOWNARROW":
            var txt = this.c.val(data.input);
            if (txt.length >= this.c.min_len)
                this.sm.transition("getting", null, data);
            else 
                this.c.list_hide();
            break;
        case "DROPDOWN":
            this.sm.transition("getting", null, data);
            break;
        case "ENTERKEY":
            window.clearTimeout(this.c.textchange_timeout);
            break;
        default:
            break;
    };
};

/**
 * state: getting
 */
function state_getting(c) {
    select_state.call(this, c);
};
// inheritance: prototype/constructor chaining
state_getting.prototype = new select_state();
state_getting.prototype.constructor = state_getting;

state_getting.prototype.enter = function(data) {//fb.log("state_getting.enter", data);
    window.clearTimeout(this.c.loadmsg_timeout);
    if (!data || !data.input) 
        return;
    // show loading msg
    var loadmsg_func = null;
    var options = this.c.options(data.input);

    // if there is no "timeout_content" the don't show the "loading..." message
    // either. The rationale is that if nothing comes back because it times out
    // and there is no content to show, don't tell the user it is loading if it
    // might not ever they won't even be notified about it. But once content has 
    // come down, then show the loading message on subsequent fetches. We know 
    // if content has loaded before because "_fired" has been set
    if (!options["timeout_content"] && !options["_fired"]){
        loadmsg_func = function(){};
    } else {
        loadmsg_func = this.c.delegate("loading_show", [data.input]);
    }

    this.c.loadmsg_timeout = window.setTimeout(loadmsg_func, this.c.loadmsg_delay);

    // request autocomplete url
    this.c.list_load(data.input);
};
state_getting.prototype.exit = function(data) {//fb.log("state_getting.exit", data); 
    // hide loading msg
    window.clearTimeout(this.c.loadmsg_timeout);
    this.c.loading_hide();
};
state_getting.prototype.handle = function(data) {//fb.log("state_getting.handle", data);
    if (!data || !data.input) 
        return;
    var options = this.c.options(data.input);    
    switch (data.id) {
        case "TEXTCHANGE":
            this.sm.transition("start", null, null, data);
            break;
        case "TIMEOUT":
            if (options["timeout_content"]){
                this.c.loading_hide(data.input);
                this.c.loading_show(data.input,options["timeout_content"]);
            } else {
                this.sm.transition("start");
            }
            break;
        case "LIST_RESULT":
            this.sm.transition("selecting", null, data);
            break;
        case "ENTERKEY":
            $(data.input).trigger("fb-noselect", [data]);
            this.c.list_hide();
            this.sm.transition("start");
            window.clearTimeout(this.c.textchange_timeout);
            break;
        case "ENTERKEY-SHIFT":
            data.domEvent.preventDefault();       
            break;
        case "ESCAPEKEY":
            this.c.list_hide();
            this.sm.transition("start");
            break;            
        default:
            break;
    };
};

/**
 * state: selecting
 */
function state_selecting(c) {
    select_state.call(this, c);
};
// inheritance: prototype/constructor chaining
state_selecting.prototype = new select_state();
state_selecting.prototype.constructor = state_selecting;

state_selecting.prototype.enter = function(data) {//fb.log("state_selecting.enter", data);    
    if (!data || !data.input || !data.result) 
        return;
    this.c.list_show(data.input, data.result);
    var options = this.c.options(data.input);
    options['_fired'] = true;

    if (!options.soft)
        this.c.list_select(0, null, options);
};
state_selecting.prototype.exit = function(data) {//fb.log("state_selecting.exit", data);    
    this.c.list_select(null);
};
state_selecting.prototype.handle = function(data) {//fb.log("state_selecting.handle", data);
    if (!data || !data.input) 
        return;    
    var options = this.c.options(data.input);
    switch (data.id) {
        case "TEXTCHANGE":
            this.c.should_filter = true;
            this.sm.transition("start", null, null, data);
            break;
        case "DOWNARROW":
            $("#fbs_list").show();
            var li = this.c.list_select_next(options, data);
            this.c.scroll_into_view(li);
            break;
        case "UPARROW":
            $("#fbs_list").show();
            var li = this.c.list_select_prev(options, data);
            this.c.scroll_into_view(li);
            break;
        case "DROPDOWN":
            if(this.c.val(data.input) == "") {
                this.sm.transition("start");
                this.c.list_hide();
            } else {
                this.sm.transition("getting", null, data);
                this.c.should_filter = !this.c.should_filter;
            }
            break;
        case "TAB":
            var s = this.c.list_selection();
            if (s.index == -1 || !s.item) {
                $(data.input).trigger("fb-noselect", [data]);
                return;
            }               
            this.listitem_select(data.input, s.item);
            break;
        case "ENTERKEY-SHIFT":
            // Create new topic if user is holding shift while hitting enter
            this.c.create_new(data.input);
            this.sm.transition("start");
            data.domEvent.preventDefault();
            break;
        case "ENTERKEY":
            var s = this.c.list_selection();
            if (s.index == -1 || !s.item) {
                $(data.input).trigger("fb-noselect", [data]);
                return;
            }
            if ($("#fbs_list").css("display") != "none"){
                data.domEvent.preventDefault();
            } else {
                $(data.input).trigger("fb-submit", [s.item.fb_data]);
                return;   
            }          
            this.listitem_select(data.input, s.item);            
            break;
        case "LISTITEM_CLICK":
            this.listitem_select(data.input, data.item);
            break;
        case "ESCAPEKEY":
            this.c.list_hide();
            this.sm.transition("start");
            break;
        default:
            break;
    };
};

state_selecting.prototype.listitem_select = function(input, item) {
    if (!item) 
        return;
    switch(item.fb_data.id) {
        case "NO_MATCHES":
            break;
        default:
            var txt = $(".fbs-li-name", item).text();
            $(input).val(txt);
            this.c.caret_last(input);
            $(input).trigger("fb-select", [item.fb_data])
                .trigger("suggest", [item.fb_data]); // legacy - for compatibility
            this.c.list_hide();
            this.sm.transition("start");
            break;
    }
};


function use_jsonp(options) {
    // if we're on the same host, then we don't need to use jsonp. This
    // greatly increases our cachability
    if (!options.service_url)
        return false;             // no host == same host == no jsonp
    var pathname_len = window.location.pathname.length;
    var hostname = window.location.href;
    var hostname = hostname.substr(0, hostname.length - pathname_len);
    //console.log("Hostname = ", hostname);
    if (hostname == options.service_url)
        return false;
    
    return true;
}
