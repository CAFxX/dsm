const widgets = require("widget");
const tabs = require("tabs");
const dsm = require("dsm");
const { Cc, Ci } = require("chrome");

const promptSvc = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);


console.log("DSM/" + dsm.version);

var t = new dsm.messageterminal("dsm-test");
t.setContentSink(function(msg) { console.log(msg.getData()); });

const sendMessage = function(msg, to) {
    t.sendMessage(msg, to);
};

const connectTo = function(ip, port) {
    dsm.connection.open(ip, port);
};

widgets.Widget({
  label: "Add DSM connection",
  content: "Add DSM connection",
  onClick: function() {
    var port = { value: "" }, check = { value: false };
    if (promptSvc.prompt(null, "Add DSM connection", "Port number to connect to", port, null, check)) {
      connectTo("localhost", parseInt(port.value));
    }
  }
});

widgets.Widget({
  label: "Send DSM message",
  content: "Send DSM message",
  onClick: function() {
    var port = { value: "" }, check = { value: false };
    if (promptSvc.prompt(null, "Send DSM message", "Port number to connect to", port, null, check)) {
      sendMessage("Hello World!", port.value);
    }
  }
});

