/**
 * freebaseSelect() allows one to select from an enumeration of freebase topics
 * of a certain freebase type under an input box.
 * 
 * freebaseSelect accepts a single argument which is an options Object with
 * the following attributes:
 *
 * width:       This is the width of the suggestion list and the flyout in
 *              pixels. Default is 275.
 * 
 * service_url: This the base url to all the api services like autocomplete,
 *              blurbs and thumbnails. Default is "http://www.freebase.com".
 * 
 * mqlread_path: The path to the mql service. Default is "/api/service/mqlread".
 * 
 * type:        The freebase type id to enumerate on. Default is "/location/us_state".
 * 
 * limit:       The max number of instances to show.
 * 
 * initialize:  Set to true for control to be managed from the start. Use when you know
 *              that the control started with the focus. (Default: false)
 *
 * In addition, freebaseSelect will trigger the following events on behalf of
 * the input it's attached to. They include:
 * 
 * fb-select:       Triggered when something is selected from the selection
 *                  list. The data object will contain id and name fields:
 *                  { id: aString, name: aString }.
 *
 * @example
 * $('#myInput')
 *      .freebaseSelect({type:"/location/us_state", limit: 50}) * 
 *      .bind('fb-select', function(e, data) { console.log('select: ', data.id); })
 * 
 * @desc Choose from an enumeration of all the 50 States.
 *
 * @name   freebaseSelect
 * @param  options  object literal containing options
 * @return jQuery
 * @cat    Plugins/Freebase
 * @type   jQuery
 */
$.fn.freebaseSelect = function(action, options) {
    if (typeof action == 'object' && options == null) {
        // Only passed options so assume activation
        options = action;
        action = "activate";
    }
    
    if (action == 'activate') {
        $(this).addClass("fbs-enumcontrol");
        $(this)._freebaseInput(fb.select.getInstance(), options);
    } else if (action == 'destroy') {
        $(this).removeClass("fbs-enumcontrol");
        fb.select.getInstance().destroy(this);
    }
    
    return $(this);
};

function SelectControl() { 
    fb.InputSelectControl.call(this);
    this.default_options = {
        width: 275,   // width of list and flyout
        service_url: "http://www.freebase.com",
        mqlread_path: "/api/service/mqlread",
        type: "/location/us_state",
        soft: true,
        limit: 100,
        filter: null,
        transform: null,
        initialize: false
    };
    this.min_len = 0;
};
// inheritance: prototype/constructor chaining
SelectControl.prototype = new fb.InputSelectControl();
SelectControl.prototype.constructor = SelectControl;

SelectControl.instance = null;
SelectControl.getInstance = function() {
    if (!SelectControl.instance)
        SelectControl.instance = new SelectControl();
    return SelectControl.instance;
};

// shorthand for SelectControl.prototype
var p = SelectControl.prototype;

p.list_load = function(input) {//fb.log("list_load", input);
    if (!input) 
        return;
    if (!"fb_id" in input) 
        return;
    var txt = this.val(input);
    if (this.cache[input.fb_id]) {
        //fb.log("load from cache: ", this.cache[input.fb_id]);
        window.clearTimeout(this.handle_timeout);
        this.handle_timeout = window.setTimeout(this.delegate("handle", [{id:"LIST_RESULT", input:input, result:this.cache[input.fb_id]}]), 0);
        return;
    }
    var options = this.options(input);    
    // mql read
    var param = {}
    if (options.mql_query)
        param.queries =
            '{' +
                '"query": {' +
                  '"query": ' + options.mql_query +
                '}' +
            '}';
            
    else {
        var q = '{' +
            '"query":{' +
                '"query":[{' +
                    '"name":null,' +
                    '"id":null,' +
                    '"sort":"name",' +
                    '"type":"'+options.type+'",'+
                    '"limit":'+options.limit +
                '}]' +
            '}' +
        '}';
        param.queries = q;
    }
    $.ajax({
        type: "GET",
    url: options.service_url + options.mqlread_path,
    data: param,
    success: this.delegate("list_receive", [input, txt]),
    dataType: use_jsonp(options) ? "jsonp" : "json",
    cache: true
  });
};

p.list_receive_hook = function(input, txt, result) {
    // update cache
    this.cache[input.fb_id] = result;
};

p.list_show_hook = function(list, input, options) {
    $(list).next(".fbs-selectnew").hide();
    
    var text = this.val(input);
    if(text && text.length > 0) {
        var li = $("li.fbs-li:contains("+text+"):first", list);
        if(li.length > 0)
            this.scroll_into_view(li[0]);
    }
};

p.transform = function(data, txt) {
    var div = document.createElement("div");
    $(div).append('<div class="fbs-li-name"></div>');
    var text = $(".fbs-li-name", div).append(document.createTextNode(data.name)).text();
    return div.innerHTML;    
};

p.filter = function(data, txt) {
    if (txt == "")
        return true;
    return data.name && data.name.toLowerCase().indexOf(txt.toLowerCase()) != -1;
};

p.filter_hook = function(filtered, result) {
    if (!filtered.length)
        return result;
    return filtered;
};

p.create_new = function(input){
    //Can't create new topics with select control
    return;
};

p.click = function(e) {
    var x = e.clientX - $(e.target).offset().left;
    var width = e.target.clientWidth - 10;
    if(x > width) {
        //Delay handling of dropdown so that it occurs after manage_delay
        window.setTimeout(this.delegate("handle", [{id:"DROPDOWN", input:e.target}]), this.dropdown_delay);
    }
};

fb.select = SelectControl;
