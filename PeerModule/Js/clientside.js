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
  createMyBox();
  colorPicker.style.display = "none";
  initializePeerConnection();
});

// Create my cursor box
function createMyBox() {
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
}

// Update box position
function updateBoxPosition(box, position) {
  box.style.transform = `translate(${position.x}px, ${position.y}px)`;
}

// Initialize PeerJS connection
function initializePeerConnection() {
  myPeer = new Peer();

  myPeer.on("open", (id) => {
    connectToCloudFlare();
  });

  myPeer.on("connection", handlePeerConnection);
}

// Handle new peer connection
function handlePeerConnection(conn) {
  if (connections.size >= 3) {
    conn.close();
    return;
  }

  connections.set(conn.peer, {
    connection: conn,
    box: createPeerBox(),
  });

  conn.on("data", (data) => {
    const peerData = connections.get(conn.peer);
    if (peerData) {
      updateBoxPosition(peerData.box, data);
    }
  });

  conn.on("close", () => {
    const peerData = connections.get(conn.peer);
    if (peerData) {
      peerData.box.style.opacity = "0";
      setTimeout(() => {
        peerData.box.remove();
        connections.delete(conn.peer);
      }, 1000);
    }
  });

  // Send initial color
  conn.send({
    x: -100, // Off screen initially
    y: -100,
    color: myColor,
  });
}

// Create a new box for peer
function createPeerBox() {
  const box = document.createElement("div");
  box.className = "cursor-box";
  cursorsContainer.appendChild(box);
  return box;
}

// Broadcast position to all peers
function broadcastPosition(position) {
  connections.forEach(({ connection }) => {
    connection.send(position);
  });
}

// Connect to CloudFlare for peer discovery
async function connectToCloudFlare() {
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
    peers.forEach((peerId) => {
      if (peerId !== myPeer.id && !connections.has(peerId)) {
        const conn = myPeer.connect(peerId);
        handlePeerConnection(conn);
      }
    });
  } catch (error) {
    console.error("Failed to connect to CloudFlare:", error);
  }
}
