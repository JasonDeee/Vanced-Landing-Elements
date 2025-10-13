/**
 * Vanced Customer Support - Custom WebRTC Client
 * Replaces PeerJS with custom signaling via Apps Script
 */

// ====== DEBUG CONFIGURATION ======
const WEBRTC_DEBUG_ACTIVE = true;

/**
 * Debug logging function for WebRTC
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function webrtcDebugLog(message, data = null) {
  if (!WEBRTC_DEBUG_ACTIVE) return;

  const timestamp = new Date().toISOString();
  const logMessage = `[WEBRTC-DEBUG ${timestamp}] ${message}`;

  if (data !== null) {
    console.log(`${logMessage}`, data);
  } else {
    console.log(logMessage);
  }
}

// ====== CUSTOM WEBRTC CLIENT CLASS ======
class CustomWebRTCClient {
  constructor(peerID, signalingServerUrl, roomID) {
    this.peerID = peerID;
    this.signalingServerUrl = signalingServerUrl;
    this.roomID = roomID;
    this.peerConnection = null;
    this.dataChannel = null;
    this.isConnected = false;
    this.isInitiator = false;
    this.pollingInterval = null;
    this.lastMessageID = null;
    this.pendingIceCandidates = []; // Queue for ICE candidates received before remote description
    this.remoteDescriptionSet = false;

    // Event handlers
    this.onOpen = null;
    this.onConnection = null;
    this.onData = null;
    this.onError = null;
    this.onClose = null;

    webrtcDebugLog("Custom WebRTC Client initialized", {
      peerID,
      signalingServerUrl,
      roomID,
    });
  }

  /**
   * Initialize WebRTC connection
   */
  async initialize() {
    try {
      webrtcDebugLog("Initializing WebRTC client");

      // Register with signaling server
      await this.registerWithSignalingServer();

      // Start polling for signaling messages
      this.startPolling();

      // Check if there are other peers in room
      const peersInRoom = await this.getPeersInRoom();
      if (peersInRoom.length > 1) {
        // We are not the first peer, wait for offer
        this.isInitiator = false;
        webrtcDebugLog("Waiting for offer from other peer");
      } else {
        // We are the first peer, wait for others to join
        this.isInitiator = true;
        webrtcDebugLog("Waiting for other peers to join");
      }

      // Trigger onOpen event
      if (this.onOpen) {
        this.onOpen(this.peerID);
      }
    } catch (error) {
      webrtcDebugLog("Error initializing WebRTC client", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Register with signaling server
   */
  async registerWithSignalingServer() {
    try {
      const url = new URL(this.signalingServerUrl);
      url.searchParams.append("action", "signaling");
      url.searchParams.append("signalingAction", "register");
      url.searchParams.append("peerID", this.peerID);
      url.searchParams.append("roomID", this.roomID);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== "success") {
        throw new Error(
          data.message || "Failed to register with signaling server"
        );
      }

      webrtcDebugLog("Registered with signaling server", data);
    } catch (error) {
      webrtcDebugLog("Error registering with signaling server", error);
      throw error;
    }
  }

  /**
   * Get peers in room
   */
  async getPeersInRoom() {
    try {
      const url = new URL(this.signalingServerUrl);
      url.searchParams.append("action", "signaling");
      url.searchParams.append("signalingAction", "getPeers");
      url.searchParams.append("roomID", this.roomID);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === "success") {
        return data.peers.filter((peer) => peer !== this.peerID);
      }

      return [];
    } catch (error) {
      webrtcDebugLog("Error getting peers in room", error);
      return [];
    }
  }

  /**
   * Start polling for signaling messages
   */
  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(() => {
      this.pollSignalingMessages();
    }, 8000); // 8 seconds polling rate

    webrtcDebugLog("Started polling for signaling messages", {
      interval: 8000,
    });
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      webrtcDebugLog("Stopped polling for signaling messages");
    }
  }

  /**
   * Poll for signaling messages
   */
  async pollSignalingMessages() {
    try {
      const url = new URL(this.signalingServerUrl);
      url.searchParams.append("action", "signaling");
      url.searchParams.append("signalingAction", "poll");
      url.searchParams.append("peerID", this.peerID);
      if (this.lastMessageID) {
        url.searchParams.append("lastMessageID", this.lastMessageID);
      }

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === "success" && data.messages.length > 0) {
        webrtcDebugLog("Received signaling messages", {
          count: data.messages.length,
          messages: data.messages,
        });

        // Process each message in order
        for (const message of data.messages) {
          webrtcDebugLog("Processing signaling message", {
            type: message.type,
            from: message.fromPeerID,
            id: message.id,
          });

          await this.handleSignalingMessage(message);
          this.lastMessageID = message.id;
        }
      }
    } catch (error) {
      webrtcDebugLog("Error polling signaling messages", error);
    }
  }

  /**
   * Handle incoming signaling message
   */
  async handleSignalingMessage(message) {
    webrtcDebugLog("Handling signaling message", {
      type: message.type,
      from: message.fromPeerID,
    });

    try {
      switch (message.type) {
        case "offer":
          webrtcDebugLog("🎯 RECEIVED OFFER from admin!", {
            from: message.fromPeerID,
            to: message.toPeerID,
            dataPreview: message.data ? message.data.type : "no data",
          });
          await this.handleOffer(message.data, message.fromPeerID);
          break;

        case "answer":
          await this.handleAnswer(message.data);
          break;

        case "ice-candidate":
          await this.handleIceCandidate(message.data);
          break;

        case "ping":
          // Another peer joined, initiate connection if we're the initiator
          if (this.isInitiator && !this.peerConnection) {
            await this.initiateConnection(message.fromPeerID);
          }
          break;

        default:
          webrtcDebugLog("Unknown signaling message type", message.type);
      }
    } catch (error) {
      webrtcDebugLog("Error handling signaling message", error);
    }
  } /**
   * 
Initiate WebRTC connection (create offer)
   */
  async initiateConnection(targetPeerID) {
    try {
      webrtcDebugLog("Initiating connection to", targetPeerID);

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

      // Send offer via signaling
      webrtcDebugLog("Sending offer to specific peer", {
        targetPeerID,
        offerType: offer.type,
        sdpPreview: offer.sdp.substring(0, 100) + "...",
      });

      await this.sendSignalingMessage(targetPeerID, "offer", {
        sdp: offer.sdp,
        type: offer.type,
      });

      webrtcDebugLog("Sent offer to", targetPeerID);
    } catch (error) {
      webrtcDebugLog("Error initiating connection", error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  /**
   * Handle incoming offer
   */
  async handleOffer(offerData, fromPeerID) {
    try {
      webrtcDebugLog("Handling offer from", fromPeerID);

      // Create peer connection
      this.createPeerConnection();

      // Set remote description
      await this.peerConnection.setRemoteDescription({
        type: offerData.type,
        sdp: offerData.sdp,
      });

      this.remoteDescriptionSet = true;
      webrtcDebugLog("Remote description set from offer");

      // Process any pending ICE candidates
      await this.processPendingIceCandidates();

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Send answer via signaling (with small delay to ensure proper order)
      setTimeout(async () => {
        await this.sendSignalingMessage(fromPeerID, "answer", {
          sdp: answer.sdp,
          type: answer.type,
        });

        webrtcDebugLog("Sent answer to", fromPeerID);
      }, 100);
    } catch (error) {
      webrtcDebugLog("Error handling offer", error);
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
      webrtcDebugLog("Handling answer", answerData);

      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription({
          type: answerData.type,
          sdp: answerData.sdp,
        });

        this.remoteDescriptionSet = true;
        webrtcDebugLog("Set remote description from answer");

        // Process any pending ICE candidates
        await this.processPendingIceCandidates();
      }
    } catch (error) {
      webrtcDebugLog("Error handling answer", error);
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
      webrtcDebugLog("Handling ICE candidate", candidateData);

      if (!this.peerConnection) {
        webrtcDebugLog("No peer connection, ignoring ICE candidate");
        return;
      }

      if (!candidateData.candidate) {
        webrtcDebugLog("Empty ICE candidate, ignoring");
        return;
      }

      // If remote description is not set yet, queue the ICE candidate
      if (!this.remoteDescriptionSet) {
        webrtcDebugLog("Remote description not set, queuing ICE candidate");
        this.pendingIceCandidates.push(candidateData);
        return;
      }

      // Add ICE candidate immediately
      await this.addIceCandidate(candidateData);
    } catch (error) {
      webrtcDebugLog("Error handling ICE candidate", error);
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

      webrtcDebugLog("Added ICE candidate successfully");
    } catch (error) {
      webrtcDebugLog("Error adding ICE candidate", error);
      // Don't throw error, just log it
    }
  }

  /**
   * Process pending ICE candidates after remote description is set
   */
  async processPendingIceCandidates() {
    if (this.pendingIceCandidates.length > 0) {
      webrtcDebugLog("Processing pending ICE candidates", {
        count: this.pendingIceCandidates.length,
      });

      for (const candidateData of this.pendingIceCandidates) {
        await this.addIceCandidate(candidateData);
      }

      this.pendingIceCandidates = [];
      webrtcDebugLog("Finished processing pending ICE candidates");
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
        webrtcDebugLog("Generated ICE candidate", event.candidate);

        // Send ICE candidate via signaling to room peers
        this.sendSignalingMessage("ROOM_BROADCAST", "ice-candidate", {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
        });
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      webrtcDebugLog("Connection state changed", {
        connectionState: this.peerConnection.connectionState,
        iceConnectionState: this.peerConnection.iceConnectionState,
        iceGatheringState: this.peerConnection.iceGatheringState,
      });

      if (this.peerConnection.connectionState === "connected") {
        this.isConnected = true;
        webrtcDebugLog("WebRTC connection established successfully");
      } else if (
        this.peerConnection.connectionState === "disconnected" ||
        this.peerConnection.connectionState === "failed"
      ) {
        this.isConnected = false;
        webrtcDebugLog("WebRTC connection lost");
        if (this.onClose) {
          this.onClose();
        }
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      webrtcDebugLog(
        "ICE connection state changed",
        this.peerConnection.iceConnectionState
      );
    };

    // Handle incoming data channel
    this.peerConnection.ondatachannel = (event) => {
      webrtcDebugLog("Received data channel", event.channel.label);
      this.setupDataChannel(event.channel);
    };

    webrtcDebugLog("Created RTCPeerConnection", config);
  }

  /**
   * Setup data channel event handlers
   */
  setupDataChannel(dataChannel) {
    this.dataChannel = dataChannel;

    dataChannel.onopen = () => {
      webrtcDebugLog("Data channel opened");
      this.isConnected = true;

      if (this.onConnection) {
        this.onConnection({
          peer: "remote-peer", // We don't have exact peer ID in WebRTC
          send: (data) => this.send(data),
        });
      }
    };

    dataChannel.onmessage = (event) => {
      webrtcDebugLog("Received data channel message", event.data);

      try {
        const data = JSON.parse(event.data);
        if (this.onData) {
          this.onData(data);
        }
      } catch (error) {
        webrtcDebugLog("Error parsing data channel message", error);
      }
    };

    dataChannel.onclose = () => {
      webrtcDebugLog("Data channel closed");
      this.isConnected = false;

      if (this.onClose) {
        this.onClose();
      }
    };

    dataChannel.onerror = (error) => {
      webrtcDebugLog("Data channel error", error);

      if (this.onError) {
        this.onError(error);
      }
    };
  }

  /**
   * Send signaling message
   */
  async sendSignalingMessage(toPeerID, type, data) {
    try {
      const url = new URL(this.signalingServerUrl);
      url.searchParams.append("action", "signaling");
      url.searchParams.append("signalingAction", "send");
      url.searchParams.append("fromPeerID", this.peerID);
      url.searchParams.append("toPeerID", toPeerID);
      url.searchParams.append("type", type);
      url.searchParams.append("data", JSON.stringify(data));
      url.searchParams.append("roomID", this.roomID);

      const response = await fetch(url.toString());
      const result = await response.json();

      if (result.status !== "success") {
        throw new Error(result.message || "Failed to send signaling message");
      }

      webrtcDebugLog("Sent signaling message", {
        type,
        toPeerID,
        messageID: result.messageID,
      });
    } catch (error) {
      webrtcDebugLog("Error sending signaling message", error);
      throw error;
    }
  }

  /**
   * Send data via data channel
   */
  send(data) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      const message = JSON.stringify(data);
      this.dataChannel.send(message);
      webrtcDebugLog("Sent data via data channel", data);
      return true;
    } else {
      webrtcDebugLog("Cannot send data - data channel not ready", {
        hasDataChannel: !!this.dataChannel,
        readyState: this.dataChannel?.readyState,
      });
      return false;
    }
  }

  /**
   * Close connection
   */
  close() {
    webrtcDebugLog("Closing WebRTC connection");

    this.stopPolling();

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
        webrtcDebugLog("Unknown event type", event);
    }
  }

  /**
   * Connect to another peer (for admin side)
   */
  async connect(targetPeerID) {
    webrtcDebugLog("🚀 ADMIN CONNECTING to client peer", {
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
 * Create new CustomWebRTCClient (replaces new Peer())
 * @param {string} peerID - Peer ID
 * @param {Object} config - Configuration (contains signalingServerUrl and roomID)
 * @returns {CustomWebRTCClient} - WebRTC client instance
 */
function createCustomPeer(peerID, config = {}) {
  const signalingServerUrl =
    config.signalingServerUrl ||
    "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";
  const roomID = config.roomID || "default-room";

  const client = new CustomWebRTCClient(peerID, signalingServerUrl, roomID);

  // Auto-initialize
  setTimeout(() => {
    client.initialize();
  }, 100);

  return client;
}

// Export for module usage
if (typeof window !== "undefined") {
  window.CustomWebRTCClient = CustomWebRTCClient;
  window.createCustomPeer = createCustomPeer;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CustomWebRTCClient, createCustomPeer };
}
