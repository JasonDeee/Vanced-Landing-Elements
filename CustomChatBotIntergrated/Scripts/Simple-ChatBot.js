/**
 * Simple Customer Support Chatbot Frontend
 * Kết nối với Cloudflare Workers backend
 */

// Cấu hình
const WORKERS_ENDPOINT = "https://vanced-chatbot.caocv-work.workers.dev/"; // Cập nhật URL này
let chatHistory = [];

// DOM elements
const chatContainer = document.getElementById("Vx_chatMessages");
const messageInput = document.getElementById("Vx_messageInput");
const sendButton = document.getElementById("Vx_sendButton");

// Khởi tạo khi DOM loaded
document.addEventListener("DOMContentLoaded", () => {
  initializeChat();
  setupEventListeners();
});

/**
 * Khởi tạo chat với tin nhắn chào mừng
 */
function initializeChat() {
  const welcomeMessage = {
    role: "assistant",
    content:
      "Xin chào! Tôi là trợ lý ảo của Vanced Agency. Tôi có thể giúp gì cho bạn hôm nay?",
  };

  displayMessage(welcomeMessage);
  chatHistory.push(welcomeMessage);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Send button click
  sendButton.addEventListener("click", handleSendMessage);

  // Enter key press
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Recommendation questions click
  const recommendationQuestions = document.querySelectorAll(
    ".Vx_Recommendation_Question p"
  );
  recommendationQuestions.forEach((question) => {
    question.addEventListener("click", () => {
      messageInput.value = question.textContent;
      handleSendMessage();
    });
  });

  // Human support buttons (sẽ được thêm dynamically)
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("Opus_RequestForRealAssist_Button")) {
      handleHumanSupportRequest();
    } else if (e.target.classList.contains("Opus_StayWithOpus_Button")) {
      hideHumanSupportUI();
    }
  });
}

/**
 * Xử lý gửi tin nhắn
 */
async function handleSendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // Disable input và button
  setInputState(false);

  // Hiển thị tin nhắn user
  const userMessage = { role: "user", content: message };
  displayMessage(userMessage);
  chatHistory.push(userMessage);

  // Clear input
  messageInput.value = "";

  // Hiển thị loading state
  chatContainer.classList.add("AwaitingResponse");

  try {
    // Gửi request đến Workers
    const response = await fetch(WORKERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        chatHistory: chatHistory.slice(-10), // Chỉ gửi 10 tin nhắn gần nhất
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Hiển thị response từ bot
    const botMessage = { role: "assistant", content: data.response };
    displayMessage(botMessage);
    chatHistory.push(botMessage);

    // Kiểm tra xem có cần human support không
    if (data.needsHumanSupport) {
      showHumanSupportUI();
    }
  } catch (error) {
    console.error("Error sending message:", error);

    // Hiển thị error message
    const errorMessage = {
      role: "assistant",
      content:
        "Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau hoặc liên hệ trực tiếp với chúng tôi.",
    };
    displayMessage(errorMessage);
  } finally {
    // Remove loading state và enable input
    chatContainer.classList.remove("AwaitingResponse");
    setInputState(true);
  }
}

/**
 * Hiển thị tin nhắn trong chat
 */
function displayMessage(message) {
  const messageElement = document.createElement("div");
  messageElement.className = `Vx_message ${
    message.role === "user" ? "Vx_user-message" : "Vx_bot-message"
  }`;

  // Xử lý markdown cơ bản
  const formattedContent = formatMessageContent(message.content);
  messageElement.innerHTML = formattedContent;

  chatContainer.appendChild(messageElement);

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Format nội dung tin nhắn (markdown cơ bản)
 */
function formatMessageContent(content) {
  return content
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

/**
 * Hiển thị Human Support UI
 */
function showHumanSupportUI() {
  const template = document.querySelector(
    ".OpusPC_RequestForRealAssist_Message"
  );
  if (template) {
    const humanSupportUI = template.cloneNode(true);
    humanSupportUI.style.display = "block";
    humanSupportUI.style.animation = "fadeIn 0.3s ease-in-out";

    chatContainer.appendChild(humanSupportUI);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

/**
 * Ẩn Human Support UI
 */
function hideHumanSupportUI() {
  const humanSupportElements = document.querySelectorAll(
    '.OpusPC_RequestForRealAssist_Message[style*="block"]'
  );
  humanSupportElements.forEach((element) => {
    element.style.animation = "fadeOut 0.3s ease-in-out";
    setTimeout(() => element.remove(), 300);
  });

  // Thêm tin nhắn xác nhận
  const continueMessage = {
    role: "assistant",
    content: "Tôi sẽ tiếp tục hỗ trợ bạn. Bạn có câu hỏi gì khác không?",
  };
  displayMessage(continueMessage);
  chatHistory.push(continueMessage);
}

/**
 * Xử lý yêu cầu human support
 */
function handleHumanSupportRequest() {
  // Tạm thời hiển thị alert (sẽ implement redirect thật sau)
  alert(
    "Tính năng đang được phát triển. Bạn có thể liên hệ trực tiếp qua email: contact@vanced.agency"
  );

  // Ẩn human support UI
  hideHumanSupportUI();

  // Log analytics (nếu cần)
  console.log("Human support requested at:", new Date().toISOString());
}

/**
 * Set trạng thái input (enable/disable)
 */
function setInputState(enabled) {
  messageInput.disabled = !enabled;
  sendButton.disabled = !enabled;

  if (enabled) {
    messageInput.focus();
  }
}

/**
 * Utility: Thêm CSS animations
 */
const style = document.createElement("style");
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-10px); }
  }
`;
document.head.appendChild(style);

/**
 * Error handling cho uncaught errors
 */
window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});
