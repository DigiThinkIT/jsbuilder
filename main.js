"use strict";
/* ex: set tabstop=2 expandtab: */

const fs = require('fs-extra');
const path = require('path');

let __tplCounter = 0;
class Template {

  constructor(src) {
    this.src = src;
  }

  render() {
    var parts = this.src.split(/(\{\{|\}\}|[ \t]*\{%\-|-%\}[ \t]*(?:\n|\r\n|\n\r)?|\{%|%\})/);
    var script = [];

    __tplCounter++;
    var fnName = "__tpl__" + __tplCounter;

    script.push("(function(__data__) { var __fn__ = (function() {\n");
//    script.push("\twith(__data__) {");
    script.push("\tvar tpl=[];\n");
    var open = false;
    var openMode = null;
    for (var p of parts) {
      if ( p == "" ) {
        continue;
      }

      var tabs_count = script[script.length - 1].split(/[^\t]/)[0].length + 1;
      if ( open && openMode == "code") {
        tabs_count++;
      }
      var tabs = Array(tabs_count).join("\t");

      if ( !open && p == "{{" ) {
        openMode = 'simple';
        open = true;
      } else if ( !open && (p == "{%" || p.match(/^\s*\{%\-$/)) ) {
        openMode = 'code';
        open = true;
      } else if ( open && openMode == "simple" && p == "}}" ) {
        openMode = null;
        open = false;
      } else if ( open && openMode == "code" && (p == "%}" || p.match(/^\-%\}\s*$/))) {
        openMode = null;
        open = false;
      } else if ( open && openMode == "simple" ) {
        var var_name = p.trim();
        script.push(tabs + "try {\n");
        script.push(tabs + "\ttpl.push("+var_name+");\n");
        script.push(tabs + "} catch (e) {\n");
        script.push(tabs + "\ttry {\n");
        script.push(tabs + "\t\ttpl.push(this."+var_name+");\n");
        script.push(tabs + "\t} catch (e) { \n");
        script.push(tabs + "\t\ttpl.push('');\n");
        script.push(tabs + "\t} \n");
        script.push(tabs + "}\n");
      } else if ( open && openMode == "code" ) {
        p = p.trim();
        if ( p == "}" || p == ")") {
          tabs_count--;
        }
        tabs = Array(tabs_count).join("\t");
        script.push(tabs + p.trim() + "\n");
      }else {
        script.push(tabs + "tpl.push(`"+p+"`);\n");
      }
    }
    script.push("\treturn tpl.join('');\n");
    script.push("}).bind(__data__);\n ");
    script.push("return __fn__();\n");
    script.push("})");

    return script.join("");
  }
}

var __build_handlers = {};
class Builder {

  static cli() {
    var src_path = null;
    var dst_path = null;

    if ( process.argv.length > 2 ) {
      src_path = path.resolve(process.argv[2]);
    } else {
      src_path = path.resolve(".");
    }

    if ( process.argv.length > 3 ) {
      dst_path = path.resolve(process.argv[3]);
    } else {
      dst_path = path.resolve(".");
    }

    return new Builder(src_path, dst_path);
  }

  static registerCommand(command, handler) {

  }

  static registerHandler(prefix, handler) {
    // binding handler object to its functions so they may reference properties
    if ( handler.process ) { handler.process = handler.process.bind(handler); }
    if ( handler.preProcess ) { handler.preProcess = handler.preProcess.bind(handler); }
    if ( handler.postProcess ) { handler.postProcess = handler.postProcess.bind(handler); }

    var handler_api;
    if ( !(prefix in __build_handlers) ) {
      // api functions wrap handler functions so they may
      // call all handlers with a single function call.

      handler_api = {
        handlers: [],
      };

      handler_api.preProcess = (function(key, builder) {
        for( var i in this.handlers ) {
          var handler = this.handlers[i];
          if ( 'preProcess' in handler ) {
            handler.preProcess(key, builder);
          }
        }
      }).bind(handler_api);

      handler_api.process = (function(data, item, vars, item_path, out_path, builder) {
        for( var i in this.handlers ) {
          var handler = this.handlers[i];
          if ( 'process' in handler ) {
            data = handler.process(data, item, vars, item_path, out_path, builder);
          }
        }
        return data;
      }).bind(handler_api);

      handler_api.postProcess = (function(key, data, builder) {
        for( var i in this.handlers ) {
          var handler = this.handlers[i];
          if ( 'postProcess' in handler ) {
            data = handler.postProcess(key, data, builder);
          }
        }
        return data;
      }).bind(handler_api);

      __build_handlers[prefix] = handler_api;

    }

    handler_api = __build_handlers[prefix];
    handler_api.handlers.push(handler);

  }

  constructor(src_path, dst_path, config) {
    if ( config == undefined ) {
      config = {};
    }

    this.src_path = src_path
    this.dst_path = dst_path
    this.config = config
  }

  _beforeBuildItem(key) {
    for( var name in __build_handlers) {
      var handler_api = __build_handlers[name];
      handler_api.preProcess(key, this);
    }
  }

  _afterBuildItem(key, data) {
    for( var name in __build_handlers) {
      var handler_api = __build_handlers[name];
      data = handler_api.postProcess(key, data, this);
    }
    return data;
  }

  build() {
    var build_json_path = path.join(this.src_path, "build.json");
    var build = require(build_json_path);
    var vars = build.vars;
    var use_strict = false;
    if ( "build" in build ) {
      for(var key in build.build ) {
        var out_path = path.resolve(path.join(this.dst_path, key));
	var item = {};
	if ( typeof build.build[key] == "string" ) {
		item.files = [ build.build[key] ];
	} else if ( typeof build.build[key].constructor == 'array ) {
		item.files = build.build[key];
	} else {
		item = build.build[key]
	}

        this._beforeBuildItem(key);
        var out = "";
        for(var file of item.files) {
          var prefix = null;
          var parts = file.split(":");
          if ( parts.length > 1 ) {
            prefix = parts[0];
            file = parts[1];
          }

          var handler = null;
          var all_handler = null;

          if ( prefix in __build_handlers ) {
            handler = __build_handlers[prefix];
          }
          if ( "*" in __build_handlers ) {
            all_handler = __build_handlers["*"];
          }

          var item_path = path.resolve(this.src_path, item);
          var data = fs.readFileSync(item_path).toString();

          // let the * catch all process first
          if ( all_handler && all_handler.process ) {
            data = all_handler.process(data, file, vars, item_path, out_path, this);
          }

          // then all other handlers
          if ( handler && handler.process ) {
            data = handler.process(data, file, vars, item_path, out_path, this);
          }

          out += data + "\n";
        }

        out = this._afterBuildItem(key, out);
	var base_path = path.dirname(out_path);
	fs.ensureDirSync(base_path);
        fs.writeFileSync(out_path, out);
	
      }
    }
  }
}

Builder.registerCommand("chmod", (path, args) => {
	fs.chmodSync(path, args[0]);
});

Builder.registerHandler("include_template", {
  count: 0,
  preProcess: function(key, builder) {
    this.count = 0;
  },
  process: function(data, name, vars, src_path, dst_path, builder) {
    var out = "";
    if ( this.count == 0 ) {
      out = "var templates = {};\n\n";
    }

    var tpl = new Template(data);
    out += "templates[\"" + name + "\"] = " + tpl.render() + ";\n";
    this.count++;
    return out;
  }
});

Builder.registerHandler("process_template", {
  process: function(data, name, vars, src_path, dst_path, builder) {
    var tpl = new Template(data);
    var tpl_render = tpl.render();
    var tpl_fn = eval(tpl_render);
    var tpl_result = tpl_fn(vars);
    return tpl_result;
  }
});

// handles preserving "use strict" on javascripts
Builder.registerHandler("*", {
  uses_strict: false,
  preProcess: function(key, builder) {
    // resets tracking "use strict";
    this.uses_strict = false;
  },
  process: function(data, name, vars, src_path, dst_path, builder) {
    if ( data.match(/\s*"use\sstrict";?[ \t]*(?:\n|\r\n|\n\r)?/i) ) {
      this.uses_strict = true;
      data = data.replace(/\s*"use strict";?[ \t]*(?:\n|\r\n|\n\r)?/i, '');
    }
    return data;
  },
  postProcess: function(key, data, builder) {
    if ( this.uses_strict ) {
      data = '"use strict";\n' + data;
    }
    return data;
  }
});

module.exports = {
  Template: Template,
  Builder: Builder
}
