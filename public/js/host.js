// public/js/host.js
const socket = io();

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resolutionSelect = document.getElementById('resolutionSelect');
const localVideo = document.getElementById('localVideo');
const placeholder = document.getElementById('placeholder');
const statusBadge = document.getElementById('statusBadge');
const inviteSection = document.getElementById('inviteSection');
const viewerLinkInput = document.getElementById('viewerLink');
const copyBtn = document.getElementById('copyBtn');
const viewerCountEl = document.getElementById('viewerCount');

// State
let localStream = null;
let roomId = 'room-' + Math.random().toString(36).substr(2, 9);
const peerConnections = {}; // Map: viewerSocketId -> RTCPeerConnection

// Standard STUN servers for WebRTC NAT traversal
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// 1. Join room on load
socket.emit('join-room-as-host', roomId);

// Generate Viewer Link
const viewerUrl = `${window.location.origin}/viewer.html?room=${roomId}`;
viewerLinkInput.value = viewerUrl;

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(viewerUrl);
  copyBtn.innerText = 'Copied!';
  setTimeout(() => copyBtn.innerText = 'Copy', 2000);
});

// 2. Start Screen Sharing
startBtn.addEventListener('click', async () => {
  try {
    // Capture Video + System Audio
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always"
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    // Setup local preview
    localVideo.srcObject = localStream;
    placeholder.style.display = 'none';

    // UI toggles
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    inviteSection.classList.remove('hidden');
    inviteSection.classList.add('flex');

    statusBadge.innerText = 'Streaming LIVE';
    statusBadge.classList.replace('bg-gray-200', 'bg-red-100');
    statusBadge.classList.replace('text-gray-700', 'text-red-700');

    // Apply initial resolution
    await applyResolution();

    // Listen for user stopping stream via browser UI native button
    localStream.getVideoTracks()[0].onended = stopStream;

  } catch (err) {
    console.error("Error capturing screen:", err);
    alert("Failed to capture screen. Please ensure permissions are granted.");
  }
});

// 3. Stop Stream
stopBtn.addEventListener('click', stopStream);

function stopStream() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  localVideo.srcObject = null;
  placeholder.style.display = 'flex';

  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  inviteSection.classList.add('hidden');
  inviteSection.classList.remove('flex');

  statusBadge.innerText = 'Idle';
  statusBadge.classList.replace('bg-red-100', 'bg-gray-200');
  statusBadge.classList.replace('text-red-700', 'text-gray-700');

  // Close all peer connections
  for (let id in peerConnections) {
    peerConnections[id].close();
    delete peerConnections[id];
  }
  updateViewerCount();
}

// 4. Handle Live Resolution Changes
resolutionSelect.addEventListener('change', applyResolution);

async function applyResolution() {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  const val = resolutionSelect.value;
  let constraints = {};

  if (val === '720') constraints = { width: 1280, height: 720 };
  if (val === '1080') constraints = { width: 1920, height: 1080 };
  if (val === '1440') constraints = { width: 2560, height: 1440 };
  if (val === '2160') constraints = { width: 3840, height: 2160 };

  try {
    if (val === 'default') {
      // Reset to defaults
      await videoTrack.applyConstraints({ width: { ideal: 1920 } });
    } else {
      await videoTrack.applyConstraints(constraints);
    }
    console.log(`Resolution changed to ${val}`);
  } catch (err) {
    console.warn("Could not apply resolution constraints exactly. Screen might not support it.", err);
  }
}

// ==========================================
// WebRTC Signaling Logic (Handling Viewers)
// ==========================================

socket.on('viewer-joined', async (viewerId) => {
  if (!localStream) return; // If we aren't streaming yet, ignore.

  console.log(`Viewer ${viewerId} joined. Creating connection...`);

  // Create new RTCPeerConnection for this viewer
  const pc = new RTCPeerConnection(iceServers);
  peerConnections[viewerId] = pc;
  updateViewerCount();

  // Send ICE candidates to viewer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: viewerId,
        candidate: event.candidate
      });
    }
  };

  // Add local stream tracks to the connection
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // Create Offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Send Offer to specific viewer
  socket.emit('offer', {
    target: viewerId,
    sdp: pc.localDescription
  });
});

socket.on('answer', async (data) => {
  const pc = peerConnections[data.sender];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  }
});

socket.on('ice-candidate', async (data) => {
  const pc = peerConnections[data.sender];
  if (pc && data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

socket.on('viewer-disconnected', (viewerId) => {
  if (peerConnections[viewerId]) {
    peerConnections[viewerId].close();
    delete peerConnections[viewerId];
    updateViewerCount();
  }
});

function updateViewerCount() {
  viewerCountEl.innerText = Object.keys(peerConnections).length;
}