// webrtc.js

// 🔌 WebSocket verso backend .NET
const ws = new WebSocket("wss://unparadoxical-esteban-prediastolic.ngrok-free.dev/ws");

// 🎥 Video elements
let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

// 📝 UI labels
let wsStatus = document.getElementById("wsStatus");
let myIdLabel = document.getElementById("myIdLabel");
let iceStateLabel = document.getElementById("iceState");
let pcStateLabel = document.getElementById("pcState");

// 🌐 WebRTC state
let localStream = null;
let peerConnection = null;
let myId = null;
let targetId = null;

// =======================================================
// 🔌 WEBSOCKET HANDLERS
// =======================================================

ws.onopen = () => {
    wsStatus.textContent = "Connected ✔";
    console.log("WebSocket connected");
};

ws.onclose = () => {
    wsStatus.textContent = "Disconnected ✖";
};

ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    console.log("MSG RECEIVED:", msg);

    switch (msg.type) {
        case "welcome":
            myId = msg.id;
            myIdLabel.textContent = myId;
            console.log("🔑 My ID:", myId);
            break;

        case "offer":
            handleOffer(msg);
            break;

        case "answer":
            handleAnswer(msg);
            break;

        case "ice-candidate":
            handleIceCandidate(msg);
            break;

        default:
            console.warn("Unknown message:", msg);
            break;
    }
};

// =======================================================
// 🎥 VIDEO LOCAL
// =======================================================

async function startLocalVideo() {
    if (localStream) return;

    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;
}

// =======================================================
// 🔧 CREATE PEER CONNECTION
// =======================================================

async function createPeerConnection() {
    if (peerConnection) return;

    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:relay.metered.ca:443",
                username: "baf9777d7b5cceb4cd9ed75c",
                credential: "ad8c1204b768b6f5"
            }
        ],
        iceTransportPolicy: "relay"
    });

    // 🔎 Log ICE status
    peerConnection.oniceconnectionstatechange = () => {
        iceStateLabel.textContent = peerConnection.iceConnectionState;
        console.log("ICE state:", peerConnection.iceConnectionState);
    };

    // 🔎 Log PeerConnection status
    peerConnection.onconnectionstatechange = () => {
        pcStateLabel.textContent = peerConnection.connectionState;
        console.log("PC state:", peerConnection.connectionState);
    };

    if (!localStream) await startLocalVideo();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        console.log("🎬 Remote track received");
        const [stream] = event.streams;

        remoteVideo.srcObject = stream;

        // 🔥 forza la riproduzione
        const p = remoteVideo.play();
        if (p) {
            p.catch(err => console.warn("Autoplay blocked:", err));
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && targetId) {
            ws.send(JSON.stringify({
                type: "ice-candidate",
                from: myId,
                to: targetId,
                data: event.candidate
            }));
        }
    };

    console.log("🛠️ PeerConnection created!");
}

// =======================================================
// 📞 CALLER
// =======================================================

document.getElementById("callBtn").onclick = async () => {
    if (!myId) return alert("Aspetta ID dal server!");

    targetId = prompt("ID dell'altro utente:");
    if (!targetId) return;

    await startLocalVideo();
    await createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
        type: "offer",
        from: myId,
        to: targetId,
        data: offer
    }));

    console.log("📤 OFFER SENT");
};

// =======================================================
// 📲 ANSWER (chi risponde)
// =======================================================

document.getElementById("answerBtn").onclick = async () => {
    await startLocalVideo();
    peerConnection = null;
    console.log("📞 Waiting for offer…");
};

// =======================================================
// 🔁 HANDLE OFFER / ANSWER
// =======================================================

async function handleOffer(msg) {
    console.log("📥 OFFER from", msg.from);
    targetId = msg.from;

    await startLocalVideo();
    await createPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.data));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: "answer",
        from: myId,
        to: msg.from,
        data: answer
    }));

    console.log("📤 ANSWER SENT");
}

async function handleAnswer(msg) {
    console.log("📥 ANSWER from", msg.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.data));
}

// =======================================================
// ❄️ ICE CANDIDATES
// =======================================================

async function handleIceCandidate(msg) {
    const candidate = msg.data;

    if (!peerConnection || !peerConnection.remoteDescription) {
        console.warn("⏳ Waiting for remoteDescription...");
        return setTimeout(() => handleIceCandidate(msg), 100);
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE added:", candidate);
    } catch (err) {
        console.error("ICE Error:", err);
    }
}
