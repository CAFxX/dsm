const dsm = require("dsm");
const gdsm = dsm.global;

exports.test_id = function(test) {
  test.assert(require("self").id.length > 0);
};

exports.test_NodeId = function(test) {
  test.assert(gdsm.controller.getNodeId().length > 0);
};

exports.test_sendMessageStringToSelf = function(test) {
  var ep = gdsm.listen("test");
  test.assert(ep != null);
  test.assert(ep.getMessage() == false);
  const msg = "test message";
  ep.sendMessage(msg, gdsm.controller.getNodeId());
  test.assert(ep.getMessage().getData() == msg);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageObjectToSelf = function(test) {
  var ep = gdsm.listen("test");
  test.assert(ep != null);
  const msg = Date.now();
  ep.sendMessage(msg, gdsm.controller.getNodeId());
  test.assert(ep.getMessage().getData() == msg);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageStringToSelfAndReply = function(test) {
  var ep = gdsm.listen("test");
  test.assert(ep != null);
  const msg = "test message";
  ep.sendMessage(msg, gdsm.controller.getNodeId());
  const msg2 = "test reply";
  ep.getMessage().reply(msg2);
  test.assert(ep.getMessage().getData() == msg2);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageStringToSelfMulti = function(test) {
  var ep = gdsm.listen("test");
  var ep2 = gdsm.listen("test");
  test.assert(ep != null);
  const msg = "test message";
  ep.sendMessage(msg, gdsm.controller.getNodeId());
  test.assert(ep.getMessage().getData() == msg);
  test.assert(ep2.getMessage().getData() == msg);
  test.assert(ep.getMessage() == false);
  test.assert(ep2.getMessage() == false);
  ep.close();
};

