// Code để ở phía khách hàng (html)
const cloudFlareWorkerUrl = "https://roblox-and-peer.caocv-work.workers.dev/";

let myPeer;
let connections = new Map();
let myColor = null;
let myBox = null;

const colorPicker = document.getElementById("colorPicker");
const cursorsContainer = document.getElementById("cursors-container");

// Handle color selection
colorPicker.addEventListener("change", (e) => {
  myColor = e.target.value;
  console.log("🎨 Color selected:", myColor);
  createMyBox();
  colorPicker.style.display = "none";
  initializePeerConnection();
  console.log("🔄 Initializing PeerJS connection");
});

// Create my cursor box
function createMyBox() {
  console.log("📦 Creating my cursor box");
  myBox = document.createElement("div");
  myBox.className = "cursor-box";
  myBox.style.backgroundColor = myColor;
  cursorsContainer.appendChild(myBox);

  // Update box position on mouse move
  document.addEventListener("mousemove", (e) => {
    const position = {
      x: e.clientX - 16, // Center the box on cursor
      y: e.clientY - 16,
      color: myColor,
    };
    updateBoxPosition(myBox, position);
    broadcastPosition(position);
  });
  console.log("✅ My cursor box created and mouse tracking enabled");
}

// Update box position and color
function updateBoxPosition(box, position) {
  box.style.transform = `translate(${position.x}px, ${position.y}px)`;
  if (position.color && box.style.backgroundColor !== position.color) {
    console.log("🎨 Updating box color to:", position.color);
    box.style.backgroundColor = position.color;
  }
}

// Initialize PeerJS connection
function initializePeerConnection() {
  console.log("🔄 Initializing PeerJS connection");
  myPeer = new Peer();

  myPeer.on("open", (id) => {
    console.log("🆔 My peer ID:", id);
    connectToCloudFlare();
  });

  myPeer.on("connection", handlePeerConnection);

  myPeer.on("error", (error) => {
    console.error("❌ PeerJS error:", error);
  });
}

// Handle new peer connection
function handlePeerConnection(conn) {
  console.log("🤝 New peer connection:", conn.peer);
  console.log("📊 Current connections:", connections.size);

  const peerBox = createPeerBox();
  connections.set(conn.peer, {
    connection: conn,
    box: peerBox,
  });

  conn.on("data", (data) => {
    const peerData = connections.get(conn.peer);
    if (peerData) {
      updateBoxPosition(peerData.box, data);
    }
  });

  conn.on("close", () => {
    console.log("👋 Peer disconnected:", conn.peer);
    const peerData = connections.get(conn.peer);
    if (peerData) {
      peerData.box.style.opacity = "0";
      setTimeout(() => {
        peerData.box.remove();
        connections.delete(conn.peer);
        console.log(
          "🗑️ Peer cleanup complete. Remaining connections:",
          connections.size
        );
      }, 1000);
    }
  });

  conn.on("error", (error) => {
    console.error("❌ Connection error with peer", conn.peer, ":", error);
  });

  // Send initial position and color
  const initialData = {
    x: -100, // Off screen initially
    y: -100,
    color: myColor,
  };
  conn.send(initialData);
  console.log("📤 Sent initial data to peer:", initialData);
}

// Create a new box for peer
function createPeerBox() {
  console.log("📦 Creating new peer box");
  const box = document.createElement("div");
  box.className = "cursor-box";
  box.style.opacity = "0"; // Start invisible
  cursorsContainer.appendChild(box);
  // Fade in after a short delay
  setTimeout(() => {
    box.style.opacity = "1";
  }, 100);
  return box;
}

// Broadcast position to all peers
function broadcastPosition(position) {
  connections.forEach(({ connection }, peerId) => {
    try {
      connection.send(position);
    } catch (error) {
      console.error("❌ Failed to send position to peer", peerId, ":", error);
    }
  });
}

// Connect to CloudFlare for peer discovery
async function connectToCloudFlare() {
  console.log("🌐 Connecting to CloudFlare");
  try {
    const response = await fetch(cloudFlareWorkerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        peerId: myPeer.id,
      }),
    });

    const peers = await response.json();
    console.log("📜 Received peer list:", peers);

    peers.forEach((peerId) => {
      if (peerId !== myPeer.id && !connections.has(peerId)) {
        console.log("🔄 Initiating connection to peer:", peerId);
        const conn = myPeer.connect(peerId);
        handlePeerConnection(conn);
      }
    });
  } catch (error) {
    console.error("❌ Failed to connect to CloudFlare:", error);
  }
}
