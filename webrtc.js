// webrtc_fixed.js

// 🔌 WebSocket verso il backend .NET (aggiorna l'URL quando cambia ngrok)
const ws = new WebSocket("wss://unparadoxical-esteban-prediastolic.ngrok-free.dev/ws");

// 🎥 Riferimenti ai video
let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

// 🌐 Stato WebRTC
let localStream = null;
let peerConnection = null;
let myId = null;        // ID assegnato dal server
let targetId = null;    // ID dell'altro peer

// 🔗 WebSocket aperto
ws.onopen = () => {
    console.log("WebSocket connected");
};

// 📩 Messaggi dal server
ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    console.log("MSG RECEIVED:", msg);

    switch (msg.type) {
        case "welcome":
            myId = msg.id;
            console.log("🔑 My WebRTC ID:", myId);
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
            console.warn("Unknown message type:", msg.type);
            break;
    }
};

// 🎥 Avvia la webcam locale
async function startLocalVideo() {
    if (localStream) return; // già avviato

    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;
}

// 🔧 Crea la RTCPeerConnection e aggiunge i track locali
async function createPeerConnection() {
    if (peerConnection) return; // già esistente

    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // Aggiungo le tracce locali
    if (!localStream) {
        await startLocalVideo();
    }

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Quando arrivano tracce remote
    peerConnection.ontrack = (event) => {
        console.log("🎬 Remote track received");
        remoteVideo.srcObject = event.streams[0];
    };

    // ICE locali da mandare all'altro peer
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
}

/* ===========================
   📞 CALL (chi chiama)
   =========================== */

document.getElementById("callBtn").onclick = async () => {
    if (!myId) {
        alert("Aspetta che il server ti assegni un ID…");
        return;
    }

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

    console.log("📤 OFFER SENT →", targetId);
};

/* ===========================
   📲 ANSWER (chi risponde)
   =========================== */

document.getElementById("answerBtn").onclick = async () => {
    if (!myId) {
        alert("Aspetta che il server ti assegni un ID…");
        return;
    }

    // Avvio solo la webcam; la peerConnection nascerà su handleOffer
    await startLocalVideo();
    peerConnection = null; // reset per sicurezza

    console.log("📞 Pronto a rispondere… in attesa della OFFER");
};

/* ===========================
   🔁 Gestione OFFER / ANSWER
   =========================== */

async function handleOffer(msg) {
    console.log("📥 OFFER ricevuta da", msg.from);
    targetId = msg.from;

    if (!localStream) {
        await startLocalVideo();
    }

    await createPeerConnection();

    const offer = msg.data;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: "answer",
        from: myId,
        to: msg.from,
        data: answer
    }));

    console.log("📤 ANSWER SENT →", msg.from);
}

async function handleAnswer(msg) {
    console.log("📥 ANSWER ricevuta da", msg.from);
    if (!peerConnection) {
        console.warn("⚠️ Answer ricevuta ma peerConnection è null");
        return;
    }

    const answer = msg.data;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

/* ===========================
   ❄️ Gestione ICE
   =========================== */

async function handleIceCandidate(msg) {
    const candidate = msg.data;

    // Se la peerConnection non è ancora pronta, aspetta e riprova
    if (!peerConnection || !peerConnection.remoteDescription) {
        console.warn("⏳ PeerConnection non pronta, ritento ICE tra 100ms...");
        setTimeout(() => handleIceCandidate(msg), 100);
        return;
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE aggiunto:", candidate);
    } catch (err) {
        console.error("Errore ICE:", err);
    }
}
