"use strict";

module.exports = {
  fn1: function(data) {
    return templates['test_app.tpl'](data);
  },
  fn2: function(a) {
    return internal_fn(a);
  }
}
