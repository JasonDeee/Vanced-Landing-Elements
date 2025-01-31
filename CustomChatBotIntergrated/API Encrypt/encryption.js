// Hàm mã hóa API key
function encryptApiKey() {
  const apiKey = document.getElementById("apiKey").value;
  const passKey = document.getElementById("passKey").value;

  // Kiểm tra passkey có đúng 6 số không
  if (!/^\d{6}$/.test(passKey)) {
    alert("Pass key phải là 6 chữ số!");
    return;
  }

  // Tạo salt từ passkey
  const salt = CryptoJS.enc.Utf8.parse(passKey);

  // Mã hóa API key
  const encrypted = CryptoJS.AES.encrypt(apiKey, salt.toString()).toString();

  // Hiển thị kết quả
  document.getElementById("encryptedResult").textContent = encrypted;
}

// Hàm giải mã (để sẵn để sử dụng sau này)
function decryptApiKey(encryptedText, passKey) {
  try {
    // Tạo salt từ passkey
    const salt = CryptoJS.enc.Utf8.parse(passKey);

    // Giải mã
    const decrypted = CryptoJS.AES.decrypt(encryptedText, salt.toString());

    // Chuyển đổi kết quả về string
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

// Ví dụ cách sử dụng hàm giải mã:
/*
const encryptedApi = "U2FsdGVkX1..."; // Chuỗi đã mã hóa
const passKey = "123456";             // Pass key 6 số
const decryptedApi = decryptApiKey(encryptedApi, passKey);
console.log(decryptedApi);            // API key gốc
*/
