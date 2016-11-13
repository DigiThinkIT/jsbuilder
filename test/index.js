const chai = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jsbuilder = require('../main');
chai.should();

var test_tpl_path = "test/test.json";
var test_tpl = fs.readFileSync(test_tpl_path).toString();
var src_path = __dirname;
var dst_path = os.tmpdir();

describe('Template', function() {
  describe('#render', function() {
    it('Test generating json and comparing with expected result.', function() {
      var loop_count = 10;
      var tpl = new jsbuilder.Template(test_tpl);
      var tpl_fn_str = tpl.render();
      var tpl_fn = eval(tpl_fn_str);
      var tpl_result = tpl_fn({ 'var1': 'value1', 'loop_count': loop_count });
      var tpl_json = JSON.parse(tpl_result);
      // recreate list values as in the template json file
      var list_values = [];
      list_values.push('first');
      for(var i=0; i < loop_count; i++ ) {
        list_values.push(i);
      }
      list_values.push('last');
      chai.expect(tpl_json).to.deep.equal({ 'var1': 'value1', 'list': list_values });
    });
  });
});

describe("Builder", function() {
  describe("#build", function() {
    var builder = new jsbuilder.Builder(src_path, dst_path);
    builder.build();
    var tmp_module_path = path.join(dst_path, 'test_app.js');
    it("Check build dst file exists", function() {
      chai.assert(fs.existsSync(tmp_module_path));
      //console.log(fs.readFileSync(tmp_module_path).toString());
    });
    var tmp_module = require(tmp_module_path);
    it('Test building js module with template inclusion', function() {
      var result = tmp_module.fn1({"test_value": "hi mom"});
      result.should.equal("hi mom\n");
    });
    it('Test process_template handler output', function() {
      var result = tmp_module.fn2('hi ');
      result.should.equal("hi value1");
    });
  });
});
