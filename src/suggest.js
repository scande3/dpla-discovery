/**
 * freebaseSuggest() provides a way to attach Freebase suggestion behavior to a
 * text input using the Freebase.com autocomplete service.
 * 
 * freebaseSuggest accepts a single argument which is an options Object with
 * the following attributes:
 *
 * width:       This is the width of the suggestion list and the flyout in
 *              pixels. Default is 275.
 * 
 * soft:        Soft suggestion. If true, DO NOT auto-select first item
 *              in the suggestion list. Otherwise, select first item. 
 *              Default is false.
 * 
 * suggest_new:  To enable a suggest new option, set text to a non-null string.
 *              This is the string displayed for the suggest new option
 *              (eg, "Create new topic"). Default is null.
 * 
 * flyout:      To enable flyout to show additional information for the 
 *              currently highlighted item including a thumbnail and blurb.
 *              Default is true.
 * 
 * service_url: This the base url to all the api services like autocomplete,
 *              blurbs and thumbnails. Default is "http://www.freebase.com".
 * 
 * freebase_url:  This is the base url to the freebase site. If set, the control will
 *                create absolute urls with freebase_url as the base; otherwise relative urls
 *                are used.
 * 
 * ac_path:     The path to the autcomplete service. Default is "/api/service/search".
 * 
 * ac_param:    A dicionary of query parameters to the autocomplete service. 
 *              Currently, the supported parameters are 
 *              query (required) - the string to do an auto-complete on. See ac_qstr
 *              type  (optional) - type of items to match for (ie, "/film/film")
 *              limit (optional) - the maximum number of results to return, default is 20
 *              start (optional) - offset from which to start returning results, default is 0
 * 
 * ac_qstr:     This is the parameter name to be passed to the autocomplete
 *              service for the string to autocomplete on. The value will
 *              be what the user typed in the input. Default is "prefix".
 * 
 * blurb_path:  The path to the blurb service for the description to be shown
 *              in the flyout. Default is "/api/trans/blurb".
 * 
 * blurb_param: The query parameters to the blurb service.
 *              Default is { maxlength: 300 }.
 * 
 * thumbnail_path:  The path to the thumbnail service to be shown in the flyout. 
 *                  Default is "/api/trans/image_thumb".
 * 
 * thumbnail_param: The query paramters to the thumbnail service.
 *                  Default is {maxwidth:70, maxheight: 70}.
 * 
 * filter:      Specify a filter function if you want to filter any of the items
 *              returned by ac_path service. The function is called with one
 *              arugment representing an item from the ac_path result. The function
 *              should return TRUE to include the item or FALSE to exclude. 
 *              Default is a function that returns TRUE.
 * 
 * transform:   Specify a transform function if you want to transform the default
 *              display of the suggest list item.
 * 
 * initialize:  Set to true for control to be managed from the start. Use when you know
 *              that the control started with the focus. (Default: false)
 * 
 * In addition, freebaseSuggest will trigger the following events on behalf of
 * the input it's attached to. They include:
 * 
 * fb-select:       Triggered when something is selected from the suggestion
 *                  list. The data object will contain id and name fields:
 *                  { id: aString, name: aString }.
 * 
 * fb-select-new:   Triggered when the suggest_new option is selected. 
 *                  The data object will only contain a name field: { name: aString }.
 *
 * fb-noselect:   Triggered when the user performs a select action without highlighting an entry.
 * 
 * timeout-content: HTML to show when a timeout status is received
 *
 * @example
 * $('#myInput')
 *      .freebaseSuggest()
 *      .bind('fb-select', function(e, data) { console.log('suggest: ', data.id); })
 * 
 * @desc Attach Freebase suggestion behavior to #myInput with default options and on
 *          'suggest', output the selected id the console.
 *
 *
 * @example
 * var options = {
 *      soft: true,
 *      suggest_new: 'Create new Film',
 *      ac_param: {
 *          type: '/film/film',
 *          category: 'instance',
 *          disamb: '1', 
 *          limit: '10'
 *      }
 * };
 * $('#myInput')
 *      .freebaseSuggest(options)
 *      .bind('fb-select', function(e, data) { console.log('suggest: ', data.id); })
 *      .bind('fb-select-new', function(e, data) { console.log('suggest new: ', data.name); });
 * 
 * @desc Soft suggestion on instances of '/film/film' with a suggest new option and
 *          output the various events to the console.
 *
 * @name   freebaseSuggest
 * @param  options  object literal containing options which control the suggestion behavior
 * @return jQuery
 * @cat    Plugins/Freebase
 * @type   jQuery
 */
$.fn.freebaseSuggest = function(action, options) {
    if (typeof action == 'object' && options == null) {
        // Only passed options so assume activation
        options = action;
        action = "activate";
    }
    
    if (action == 'activate') {
        $(this)._freebaseInput(fb.suggest.getInstance(), options);
    } else if (action == 'destroy') {
        fb.suggest.getInstance().destroy(this);
    }
    
    return $(this);
};

/**
 * SuggestControl class
 * superClass: InputSelectControl
 */
function SuggestControl() { 
    fb.InputSelectControl.call(this);
    this.default_options = {
        width: 275,   // width of list and flyout
        soft: true,  // if true, DO NOT auto-select first item, otherwise select first item by default
        suggest_new: null, // to show suggest new option, set text to something (eg, "Create new topic")
        flyout: true,  // show flyout on the side of highlighted item
        service_url: "http://www.freebase.com",
        ac_path: "/api/service/search",
        ac_param: {
            type: "/common/topic",
            start: 0,
            limit: 20
        },
        ac_qstr: "prefix",  // this will be added to the ac_param ...&prefix=str
        blurb_path: "/api/trans/blurb",
        blurb_param: {
            maxlength: 300
        },
        thumbnail_path: "/api/trans/image_thumb",
        thumbnail_param: {maxwidth: 70, maxheight: 70},
        filter: null,
        transform: null,
        initialize: false,
        timeout_content:null
    }; 
};
// inheritance: prototype/constructor chaining
SuggestControl.prototype = new fb.InputSelectControl();
SuggestControl.prototype.constructor = SuggestControl;

SuggestControl.instance = null;
SuggestControl.getInstance = function() {
    if (!SuggestControl.instance)
        SuggestControl.instance = new SuggestControl();
    return SuggestControl.instance;
};

// shorthand for SuggestControl.prototype
var p = SuggestControl.prototype;

p.list_load = function(input) {//fb.log("list_load", input);
    if (!input) 
        return;
    if (!"fb_id" in input) 
        return;
    var txt = this.val(input);
    if (!txt.length) 
        return;  
    if (!this.cache[input.fb_id]) 
        this.cache[input.fb_id] = {};
    if (txt in this.cache[input.fb_id]) {
        //fb.log("load from cache: ", txt);
        window.clearTimeout(this.handle_timeout);
        this.handle_timeout = window.setTimeout(this.delegate("handle", [{id:"LIST_RESULT", input:input, result:this.cache[input.fb_id][txt]}]), 0);
        return;
    }
    var options = this.options(input);
    var txt = this.val(input);
    var param = options.ac_param;
    //TODO: remove star and change ac_qstr when search gets the same params as autocomplete
    param[options.ac_qstr] = txt; // + '*'; // the search api needs a '*' to perform auto-complete rather than search.
                                  // dae: no longer needed if you use the "prefix" parameter
    $.ajax({
        type: "GET",
    url: options.service_url + options.ac_path,
    data: param,
    success: this.delegate("list_receive", [input, txt]),
    dataType: use_jsonp(options) ? "jsonp": "json",
    cache: true
  });
};

p.list_receive_hook = function(input, txt, result) {
    // update cache
    if (!this.cache[input.fb_id])
        this.cache[input.fb_id] = {};
    this.cache[input.fb_id][txt] = result;
};

/**
 * add select new option below the select list
 * and attach mouseover, mouseout, and click handlers
 */
p.list_show_hook = function(list, input, options) {    
    if (!$(list).next(".fbs-selectnew").length)
        $(list).after('<div style="display: none;" class="fbs-selectnew"></div>');
    var suggest_new = $(list).next(".fbs-selectnew");
    if (options.suggest_new) {
        var owner = this;
        // Create description, button and shortcut text
        $(suggest_new)
            .unbind()
            .empty()
            .append('<div class="fbs-selectnew-description">Your item not in the list?</div><button type="submit" class="fbs-selectnew-button"></button><span class="fbs-selectnew-shortcut">(Shift+Enter)</span>')
            .mouseover(function(e) {
                owner.list_select(null);
                owner.flyout_hide();   
            });
        
        // Create and title create new button
        var suggest_new_button = suggest_new.find(".fbs-selectnew-button").eq(0);
        $(suggest_new_button)
            .unbind()
            .empty()
            .append(options.suggest_new)
            .click(function(e) {
                owner.create_new(input);
            });
        
        // Display create new box
        suggest_new.show();
    }
    else
        $(suggest_new).unbind().hide();
};

p.list_hide_hook = function() {
    this.flyout_hide();
};

p.list_select_hook = function(sli, options) {
    this.flyout_hide();
    if (sli && options && options.flyout && sli.fb_data && sli.fb_data.id != "NO_MATCHES")
        this.flyout(sli, options);  
};

p.create_new = function(input){
    $(input).trigger("fb-select-new", [{name:this.val(input)}])
        .trigger("suggest-new", [{name:this.val(input)}]); // legacy - for compatibility
    this.list_hide();
    this.transition("start");
}

p.transform = function(data, txt) {
    var owner = this;
    var types = [];
    if (data.type)
        $.each(data.type, function(i,n){
            if (n.id != '/common/topic')
                types.push(owner.name(n));
        });
    types = types.join(", ");
    
    var domains = [];
    if (data.domain)
        $.each(data.domain, function(i,n){
            domains.push(owner.name(n));
        });
    domains = domains.join(", ");
    
    var aliases = [];
    if (data.alias)
        $.each(data.alias, function(i,n){
            aliases.push(n);
        });
    aliases = aliases.join(", ");
    
    var props = [];
    if (data.properties)
        $.each(data.properties, function(i,n){
            props.push(n);
        });
    props = props.join(", ");
    
    var div = document.createElement("div");
    $(div).append(
            '<div class="fbs-li-aliases"></div>' +
            '<div class="fbs-li-name"></div>' +
            '<div class="fbs-li-types"></div>' +
            '<div class="fbs-li-domains"></div>' +
            '<div class="fbs-li-props"></div>');
    if (aliases.length) {
        var text = $(".fbs-li-aliases", div).append(document.createTextNode("("+aliases+")")).text();
        if (txt) 
            $(".fbs-li-aliases", div).empty().append(this.em_text(text, txt));
    }
    else
        $(".fbs-li-aliases", div).remove();
     
    var text = $(".fbs-li-name", div).append(document.createTextNode(this.name(data))).text();
    if (txt) 
        $(".fbs-li-name", div).empty().append(this.em_text(text, txt));
    
    if (types.length)
        $(".fbs-li-types", div).append(document.createTextNode(types));
    else
        $(".fbs-li-types", div).remove();
    
    if (domains.length)
        $(".fbs-li-domains", div).append(document.createTextNode(domains));
    else
        $(".fbs-li-domains", div).remove();        
          
    if (props.length)
        $(".fbs-li-props", div).append(document.createTextNode(props));
    else
        $(".fbs-li-props", div).remove();
    
    return div.innerHTML;    
};

p.flyout = function(li, options) { //fb.log("flyout", li);
    this.flyout_callback = this.flyout_resources(li, options);     
};

/**
 * load flyout resources (thumbnail, blurb), don't show until
 * both thumbnail and blurb have been loaded.
 */
p.flyout_resources = function(li, options) {//fb.log("flyout_resources", li);    
    window.clearTimeout(this.flyout_resources_timeout);
    //this.handle_timeout = window.setTimeout(this.delegate("handle", [{id:"LIST_RESULT", input:input, result:this.cache[input.fb_id][txt]}]), 0);    
    this.flyout_resources_timeout = window.setTimeout(this.delegate("flyout_resources_delay", [li, options]), 100);
}

p.flyout_resources_delay = function(li, options) {
    var data = li.fb_data;
    var data_types = ["article", "image"];
    var cb = new FlyoutResourcesHandler(this, li, options);
    return cb;
};

p.flyout_hide = function() {//fb.log("flyout_hide");
    if (this.flyout_callback)
        this.flyout_callback.destroy();
    $("#fbs_flyout").hide();
};

p.flyout_show = function(li, options, img_src, blurb) {//fb.log("flyout_show", li, img_src, blurb);
    if ("none" == $("#fbs_list").css("display")) 
        return;
    var s = this.list_selection().item;
    if (!(li == s && li.fb_data.id == s.fb_data.id))
        return;
    
    if (!$("#fbs_flyout").length) {
        $(document.body)
            .append(
                '<div style="display:none;position:absolute" id="fbs_flyout" class="fbs-topshadow">' +
                    '<div class="fbs-bottomshadow">'+
                        '<div class="fbs-flyout-container">' +
                            // label
                            '<div class="fbs-flyout-name"></div>' +
                            // image
                            '<div class="fbs-flyout-image"></div>' +
                            // types
                            '<div class="fbs-flyout-types"></div>' +
                            // domains
                            '<div class="fbs-flyout-domains"></div>' +
                            // blurb
                            '<div class="fbs-flyout-blurb"></div>' +
                        '</div>' +                                              
                    '</div>' +
                '</div>');   
    }
    
    $a = $('<a href="' + this.freebase_url(li.fb_data.id, options) + '"/>');
    $a.text($(".fbs-li-name", li).text());
    $("#fbs_flyout .fbs-flyout-name").empty().append($a);
    $("#fbs_flyout .fbs-flyout-image").empty();
    if (img_src != "#")
        $("#fbs_flyout .fbs-flyout-image").append('<img src="' + img_src + '"/>');
    $("#fbs_flyout .fbs-flyout-types").text($(".fbs-li-types", li).text());
    $("#fbs_flyout .fbs-flyout-domains").text($(".fbs-li-domains", li).text());
    $("#fbs_flyout .fbs-flyout-blurb").empty().append(blurb);
    
    var pos = $(this.get_list()).offset();
    var left = pos.left + options.width;
    var sl = document.body.scrollLeft;
    var ww = $(window).width();
    if ((left+options.width) > (sl+ww))
        left = pos.left - options.width;
    //var pos = $(li).offset();
    $("#fbs_flyout")
        .css({top:pos.top, left:left, width:options.width})
        .show();
};

p.freebase_url = function(id, options) {
    var url = options.service_url + "/view" + fb.quote_id(id);
    return url;
};

p.release_hook = function(input){
    $(this.get_list()).next(".fbs-selectnew").remove();
    fb.InputSelectControl.prototype.release_hook.call(this, input);
};

/**
 * We don't want to show the flyout until both the article (blurb)
 * and the image have been loaded. This object is an attempt to
 * encapsulate the loading of these two flyout resources, waits for both
 * resources to load and then finally calls SuggestControl.flyout_show.
 * 
 * @param owner - SuggestControl
 * @param li - the selected list item that we are showing the flyout for
 * @param options - SuggestControl settings
 */
function FlyoutResourcesHandler(owner, li, options) {
    this.owner = owner;  
    this.li = li;
    this.options = options;
    var me = this;
    $.each(["article", "image"], function(i,n) {
        var item = li.fb_data[n];
        //If item is an object then extract data from it,
        //   else treat the item as an id string.
        if (item && typeof item == 'object') {
              if ('value' in item) {
                  // If we have a value then use this
                  //   as the data
                  me.receive(n, item.value);
              } else {
                  // Otherwise load the data from the id
                  me["load_" + n](item.id);
              }
        } else {
            me["load_" + n](item);
        }
    });
    
};
FlyoutResourcesHandler.prototype = {
    load_article: function(id) {
        if (id) {
            $.ajax({
                type: "GET",
                url: this.blurb_url(id),
                data: this.options.blurb_param,
                success: fb.delegate(this.receive_article, this),
                error: fb.delegate(this.receive_article_error, this),                
                dataType: use_jsonp(this.options) ? "jsonp" : null,
                cache: true
            });
        }
        else {
            this.receive("article", "&nbsp;");
        }
    },
    receive_article: function(o) {
        if (typeof o == "object") {
            // handle errors
            if (o.status !== '200 OK') {
                fb.error("SuggestControl.blurb_receive", o.code, o.messages, o);
                return;
            }
            
            // now get the string value
            o = o.result.body;
        }
        this.receive("article", o);
    },
    receive_article_error: function() {
        this.receive("article", "Description could not be displayed");
    },    
    load_image: function(id) {
        if (id) {
            var i = new Image();
            var src = this.thumbnail_url(id);
            i.onload = fb.delegate(this.receive_image, this, [src, i]);
            i.onerror = fb.delegate(this.receive_image, this, ["#", i]);
            i.src = src;
        }
        else {
            this.receive("image", "#");   
        }
    },
    receive_image: function(src, i) {
        this.receive("image", src);
        // clean up Image.onload and onerror handlers
        i.onload = i.onerror = null;
    },
    blurb_url: function(id) {
        return this.options.service_url + this.options.blurb_path + fb.quote_id(id);
    },
    thumbnail_url: function(id) {
        var url = this.options.service_url + this.options.thumbnail_path +
            fb.quote_id(id);
        var qs = $.param(this.options.thumbnail_param);
        if (qs)
             url += "?" + qs;
        return url;
    },
    receive: function(data_type, data) {    
        if (!this.owner) return;
        this[data_type] = {data: data};
        if (this.image && this.article)
            this.owner.flyout_show(this.li, this.options, this.image.data, this.article.data);
    },
    destroy: function() {
        this.owner = this.li = this.options = this.image = this.article = null;
    }
};

fb.suggest = SuggestControl;