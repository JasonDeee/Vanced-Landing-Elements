/**
 * Vanced Customer Support - WebSocket WebRTC Client
 * Uses Cloudflare Workers + Durable Objects for real-time signaling
 */

// ====== DEBUG CONFIGURATION ======
const WS_WEBRTC_DEBUG_ACTIVE = true;

/**
 * Debug logging function for WebSocket WebRTC
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function wsWebrtcDebugLog(message, data = null) {
  if (!WS_WEBRTC_DEBUG_ACTIVE) return;

  const timestamp = new Date().toISOString();
  const logMessage = `[WS-WEBRTC-DEBUG ${timestamp}] ${message}`;

  if (data !== null) {
    console.log(`${logMessage}`, data);
  } else {
    console.log(logMessage);
  }
}

// ====== WEBSOCKET WEBRTC CLIENT CLASS ======
class WebSocketWebRTCClient {
  constructor(peerID, signalingServerUrl, roomID) {
    this.peerID = peerID;
    this.signalingServerUrl = signalingServerUrl;
    this.roomID = roomID;
    this.webSocket = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.isConnected = false;
    this.isInitiator = false;
    this.pendingIceCandidates = [];
    this.remoteDescriptionSet = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Event handlers
    this.onOpen = null;
    this.onConnection = null;
    this.onData = null;
    this.onError = null;
    this.onClose = null;

    wsWebrtcDebugLog("WebSocket WebRTC Client initialized", {
      peerID,
      signalingServerUrl,
      roomID,
    });
  }

  /**
   * Initialize WebSocket connection and WebRTC
   */
  async initialize() {
    try {
      wsWebrtcDebugLog("Initializing WebSocket WebRTC client");

      await this.connectWebSocket();
    } catch (error) {
      wsWebrtcDebugLog("Error initializing WebSocket WebRTC client", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Connect to WebSocket signaling server
   */
  async connectWebSocket() {
    try {
      // Build WebSocket URL
      const wsUrl = new URL(this.signalingServerUrl);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      wsUrl.pathname = `/p2p/room/${this.roomID}`;
      wsUrl.searchParams.set("peerID", this.peerID);
      wsUrl.searchParams.set("roomID", this.roomID);

      wsWebrtcDebugLog("Connecting to WebSocket", { url: wsUrl.toString() });

      this.webSocket = new WebSocket(wsUrl.toString());

      this.webSocket.onopen = () => {
        wsWebrtcDebugLog("WebSocket connected successfully");
        this.reconnectAttempts = 0;

        if (this.onOpen) {
          this.onOpen(this.peerID);
        }
      };

      this.webSocket.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.webSocket.onclose = (event) => {
        wsWebrtcDebugLog("WebSocket closed", {
          code: event.code,
          reason: event.reason,
        });
        this.handleWebSocketClose();
      };

      this.webSocket.onerror = (error) => {
        wsWebrtcDebugLog("WebSocket error", error);
        if (this.onError) {
          this.onError(error);
        }
      };
    } catch (error) {
      wsWebrtcDebugLog("Error connecting WebSocket", error);
      throw error;
    }
  }

  /**
   * Handle incoming signaling messages
   */
  async handleSignalingMessage(message) {
    wsWebrtcDebugLog("Received signaling message", {
      type: message.type,
      from: message.fromPeerID,
    });

    try {
      switch (message.type) {
        case "connected":
          wsWebrtcDebugLog("Connected to signaling server", message);
          // Check if there are other peers to connect to
          if (message.peersInRoom && message.peersInRoom.length > 0) {
            // We are not the first peer, wait for offer or initiate if we're admin
            const isAdmin = this.peerID.startsWith("admin_");
            if (isAdmin) {
              // Admin initiates connection
              this.isInitiator = true;
              const clientPeerID = message.peersInRoom.find(
                (id) => !id.startsWith("admin_")
              );
              if (clientPeerID) {
                await this.initiateConnection(clientPeerID);
              }
            }
          }
          break;

        case "peer-joined":
          wsWebrtcDebugLog("Peer joined room", message);
          // If we're admin and a client joined, initiate connection
          if (
            this.peerID.startsWith("admin_") &&
            !message.peerID.startsWith("admin_")
          ) {
            this.isInitiator = true;
            await this.initiateConnection(message.peerID);
          }
          break;

        case "peer-left":
          wsWebrtcDebugLog("Peer left room", message);
          if (this.onClose) {
            this.onClose();
          }
          break;

        case "offer":
          wsWebrtcDebugLog("🎯 RECEIVED OFFER from peer!", {
            from: message.fromPeerID,
          });
          await this.handleOffer(message.data, message.fromPeerID);
          break;

        case "answer":
          wsWebrtcDebugLog("Received answer from peer", {
            from: message.fromPeerID,
          });
          await this.handleAnswer(message.data);
          break;

        case "ice-candidate":
          wsWebrtcDebugLog("Received ICE candidate", {
            from: message.fromPeerID,
          });
          await this.handleIceCandidate(message.data);
          break;

        case "error":
          wsWebrtcDebugLog("Signaling error", message);
          if (this.onError) {
            this.onError(new Error(message.message));
          }
          break;

        default:
          wsWebrtcDebugLog("Unknown signaling message type", message.type);
      }
    } catch (error) {
      wsWebrtcDebugLog("Error handling signaling message", error);
    }
  }

  /**
   * Send signaling message via WebSocket
   */
  sendSignalingMessage(toPeerID, type, data) {
    if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
      wsWebrtcDebugLog("Cannot send signaling message - WebSocket not ready");
      return false;
    }

    const message = {
      type: type,
      toPeerID: toPeerID,
      data: data,
    };

    this.webSocket.send(JSON.stringify(message));
    wsWebrtcDebugLog("Sent signaling message", { type, toPeerID });

    return true;
  }

  /**
   * Initiate WebRTC connection (create offer)
   */
  async initiateConnection(targetPeerID) {
    try {
      wsWebrtcDebugLog("🚀 Initiating WebRTC connection to", targetPeerID);

      // Create peer connection
      this.createPeerConnection();

      // Create data channel
      this.dataChannel = this.peerConnection.createDataChannel("chat", {
        ordered: true,
      });

      this.setupDataChannel(this.dataChannel);

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Send offer via WebSocket signaling
      this.sendSignalingMessage(targetPeerID, "offer", {
        sdp: offer.sdp,
        type: offer.type,
      });

      wsWebrtcDebugLog("Sent offer to", targetPeerID);
    } catch (error) {
      wsWebrtcDebugLog("Error initiating connection", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  } /**
  
 * Handle incoming offer
   */
  async handleOffer(offerData, fromPeerID) {
    try {
      wsWebrtcDebugLog("Handling offer from", fromPeerID);

      // Create peer connection
      this.createPeerConnection();

      // Set remote description
      await this.peerConnection.setRemoteDescription({
        type: offerData.type,
        sdp: offerData.sdp,
      });

      this.remoteDescriptionSet = true;
      wsWebrtcDebugLog("Remote description set from offer");

      // Process any pending ICE candidates
      await this.processPendingIceCandidates();

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Send answer via WebSocket signaling
      this.sendSignalingMessage(fromPeerID, "answer", {
        sdp: answer.sdp,
        type: answer.type,
      });

      wsWebrtcDebugLog("Sent answer to", fromPeerID);
    } catch (error) {
      wsWebrtcDebugLog("Error handling offer", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(answerData) {
    try {
      wsWebrtcDebugLog("Handling answer", answerData);

      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription({
          type: answerData.type,
          sdp: answerData.sdp,
        });

        this.remoteDescriptionSet = true;
        wsWebrtcDebugLog("Set remote description from answer");

        // Process any pending ICE candidates
        await this.processPendingIceCandidates();
      }
    } catch (error) {
      wsWebrtcDebugLog("Error handling answer", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(candidateData) {
    try {
      wsWebrtcDebugLog("Handling ICE candidate", candidateData);

      if (!this.peerConnection) {
        wsWebrtcDebugLog("No peer connection, ignoring ICE candidate");
        return;
      }

      if (!candidateData.candidate) {
        wsWebrtcDebugLog("Empty ICE candidate, ignoring");
        return;
      }

      // If remote description is not set yet, queue the ICE candidate
      if (!this.remoteDescriptionSet) {
        wsWebrtcDebugLog("Remote description not set, queuing ICE candidate");
        this.pendingIceCandidates.push(candidateData);
        return;
      }

      // Add ICE candidate immediately
      await this.addIceCandidate(candidateData);
    } catch (error) {
      wsWebrtcDebugLog("Error handling ICE candidate", error);
    }
  }

  /**
   * Add ICE candidate to peer connection
   */
  async addIceCandidate(candidateData) {
    try {
      await this.peerConnection.addIceCandidate({
        candidate: candidateData.candidate,
        sdpMLineIndex: candidateData.sdpMLineIndex,
        sdpMid: candidateData.sdpMid,
      });

      wsWebrtcDebugLog("Added ICE candidate successfully");
    } catch (error) {
      wsWebrtcDebugLog("Error adding ICE candidate", error);
      // Don't throw error, just log it
    }
  }

  /**
   * Process pending ICE candidates after remote description is set
   */
  async processPendingIceCandidates() {
    if (this.pendingIceCandidates.length > 0) {
      wsWebrtcDebugLog("Processing pending ICE candidates", {
        count: this.pendingIceCandidates.length,
      });

      for (const candidateData of this.pendingIceCandidates) {
        await this.addIceCandidate(candidateData);
      }

      this.pendingIceCandidates = [];
      wsWebrtcDebugLog("Finished processing pending ICE candidates");
    }
  }

  /**
   * Create RTCPeerConnection
   */
  createPeerConnection() {
    const config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        wsWebrtcDebugLog("Generated ICE candidate", event.candidate);

        // Send ICE candidate via WebSocket signaling
        this.sendSignalingMessage("ROOM_BROADCAST", "ice-candidate", {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      wsWebrtcDebugLog("Connection state changed", {
        connectionState: this.peerConnection.connectionState,
        iceConnectionState: this.peerConnection.iceConnectionState,
        iceGatheringState: this.peerConnection.iceGatheringState,
      });

      if (this.peerConnection.connectionState === "connected") {
        this.isConnected = true;
        wsWebrtcDebugLog("✅ WebRTC connection established successfully");
      } else if (
        this.peerConnection.connectionState === "disconnected" ||
        this.peerConnection.connectionState === "failed"
      ) {
        this.isConnected = false;
        wsWebrtcDebugLog("❌ WebRTC connection lost");
        if (this.onClose) {
          this.onClose();
        }
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      wsWebrtcDebugLog(
        "ICE connection state changed",
        this.peerConnection.iceConnectionState
      );
    };

    // Handle incoming data channel
    this.peerConnection.ondatachannel = (event) => {
      wsWebrtcDebugLog("Received data channel", event.channel.label);
      this.setupDataChannel(event.channel);
    };

    wsWebrtcDebugLog("Created RTCPeerConnection", config);
  }

  /**
   * Setup data channel event handlers
   */
  setupDataChannel(dataChannel) {
    this.dataChannel = dataChannel;

    dataChannel.onopen = () => {
      wsWebrtcDebugLog("✅ Data channel opened");
      this.isConnected = true;

      if (this.onConnection) {
        this.onConnection({
          peer: "remote-peer",
          send: (data) => this.send(data),
        });
      }
    };

    dataChannel.onmessage = (event) => {
      wsWebrtcDebugLog("Received data channel message", event.data);

      try {
        const data = JSON.parse(event.data);
        if (this.onData) {
          this.onData(data);
        }
      } catch (error) {
        wsWebrtcDebugLog("Error parsing data channel message", error);
      }
    };

    dataChannel.onclose = () => {
      wsWebrtcDebugLog("Data channel closed");
      this.isConnected = false;

      if (this.onClose) {
        this.onClose();
      }
    };

    dataChannel.onerror = (error) => {
      wsWebrtcDebugLog("Data channel error", error);

      if (this.onError) {
        this.onError(error);
      }
    };
  }

  /**
   * Send data via data channel
   */
  send(data) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      const message = JSON.stringify(data);
      this.dataChannel.send(message);
      wsWebrtcDebugLog("Sent data via data channel", data);
      return true;
    } else {
      wsWebrtcDebugLog("Cannot send data - data channel not ready", {
        hasDataChannel: !!this.dataChannel,
        readyState: this.dataChannel?.readyState,
      });
      return false;
    }
  }

  /**
   * Handle WebSocket close and attempt reconnection
   */
  handleWebSocketClose() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

      wsWebrtcDebugLog(
        `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`
      );

      setTimeout(() => {
        this.connectWebSocket();
      }, delay);
    } else {
      wsWebrtcDebugLog("Max reconnection attempts reached");
      if (this.onError) {
        this.onError(new Error("WebSocket connection lost"));
      }
    }
  }

  /**
   * Close connection
   */
  close() {
    wsWebrtcDebugLog("Closing WebSocket WebRTC connection");

    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isConnected = false;
    this.remoteDescriptionSet = false;
    this.pendingIceCandidates = [];
  }

  /**
   * Destroy connection (alias for close)
   */
  destroy() {
    this.close();
  }

  // ====== EVENT HANDLER SETTERS (PeerJS compatibility) ======

  on(event, handler) {
    switch (event) {
      case "open":
        this.onOpen = handler;
        break;
      case "connection":
        this.onConnection = handler;
        break;
      case "data":
        this.onData = handler;
        break;
      case "error":
        this.onError = handler;
        break;
      case "close":
        this.onClose = handler;
        break;
      default:
        wsWebrtcDebugLog("Unknown event type", event);
    }
  }

  /**
   * Connect to another peer (for admin side)
   */
  async connect(targetPeerID) {
    wsWebrtcDebugLog("🚀 ADMIN CONNECTING to client peer", {
      adminPeerID: this.peerID,
      targetClientPeerID: targetPeerID,
      roomID: this.roomID,
    });

    // Set as initiator and start connection
    this.isInitiator = true;
    await this.initiateConnection(targetPeerID);

    // Return connection object for compatibility
    return {
      peer: targetPeerID,
      send: (data) => this.send(data),
      on: (event, handler) => {
        if (event === "open") {
          // Connection will be established via WebRTC events
          setTimeout(() => {
            if (this.isConnected) {
              handler();
            }
          }, 1000);
        } else if (event === "data") {
          this.onData = handler;
        } else if (event === "close") {
          this.onClose = handler;
        } else if (event === "error") {
          this.onError = handler;
        }
      },
      close: () => this.close(),
    };
  }
}

// ====== FACTORY FUNCTION (PeerJS compatibility) ======

/**
 * Create new WebSocketWebRTCClient (replaces new Peer())
 * @param {string} peerID - Peer ID
 * @param {Object} config - Configuration (contains signalingServerUrl and roomID)
 * @returns {WebSocketWebRTCClient} - WebRTC client instance
 */
function createWebSocketPeer(peerID, config = {}) {
  const signalingServerUrl =
    config.signalingServerUrl ||
    "https://vanced-chatbot.caocv-work.workers.dev";
  const roomID = config.roomID || "default-room";

  const client = new WebSocketWebRTCClient(peerID, signalingServerUrl, roomID);

  // Auto-initialize
  setTimeout(() => {
    client.initialize();
  }, 100);

  return client;
}

// Export for module usage
if (typeof window !== "undefined") {
  window.WebSocketWebRTCClient = WebSocketWebRTCClient;
  window.createWebSocketPeer = createWebSocketPeer;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { WebSocketWebRTCClient, createWebSocketPeer };
}
