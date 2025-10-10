const functions = require("@google-cloud/functions-framework");

functions.http("opusCloudFunction", (req, res) => {
  const { requestType } = req.body || {};
  switch (requestType) {
    case "PageLoadRequestData":
      // TODO: Xử lý PageLoadRequestData
      break;
    case "GetChatHistory":
      // TODO: Xử lý GetChatHistory
      break;
    case "SendMessage":
      // TODO: Xử lý SendMessage
      break;
    case "GetProductData":
      // TODO: Xử lý GetProductData
      break;
    default:
      // TODO: Xử lý các trường hợp không xác định
      break;
  }
  res.send({ status: "ok" });
});
