const widgets = require("widget");
const tabs = require("tabs");
const timer = require("timer");
const dsm = require("dsm");
const { Cc, Ci } = require("chrome");

const promptSvc = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

var t = new dsm.messageterminal("dsm-test");

t.setContentSink(function(msg) { 
    var data = msg.getData();
    data.hop++;
    console.log("hop: "+data.hop);
    msg.reply(data);
});

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
      timer.setTimeout(function() {
        sendMessage({msg:"Hello World!", hop:0}, port.value);
      }, 1000);
    }
  }
});


