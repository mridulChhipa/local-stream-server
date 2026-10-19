// public/js/viewer.js
const socket = io();
const remoteVideo = document.getElementById('remoteVideo');
const loadingOverlay = document.getElementById('loadingOverlay');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// Extract Room ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

if (!roomId) {
  loadingOverlay.innerHTML = '<h2 class="text-xl text-red-500 font-bold">Error: No Room ID provided</h2><p class="text-gray-400 mt-2">Please ask the host for the valid link.</p>';
} else {
  // Join the room to notify the host
  socket.emit('join-room-as-viewer', roomId);
}

// WebRTC Setup
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
let pc;

socket.on('offer', async (data) => {
  console.log("Received Offer. Setting up connection...");

  pc = new RTCPeerConnection(iceServers);

  // When the host sends their video/audio track, attach it to our video element
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    // Hide loading overlay once stream starts
    remoteVideo.onloadedmetadata = () => {
      loadingOverlay.style.display = 'none';
    };
  };

  // Send ICE candidates back to the host
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        target: data.sender,
        candidate: event.candidate
      });
    }
  };

  // Accept Offer and Send Answer
  await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit('answer', {
    target: data.sender,
    sdp: pc.localDescription
  });
});

socket.on('ice-candidate', async (data) => {
  if (pc && data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// Fullscreen Control
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    remoteVideo.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
});

// Autoplay policy bypass helper (Browsers block audio if user hasn't interacted)
document.body.addEventListener('click', () => {
  if (remoteVideo.muted) {
    remoteVideo.muted = false;
  }
}, { once: true });