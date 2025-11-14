// webrtc.js

// 🔌 WebSocket verso il backend .NET (aggiorna se cambi URL ngrok)
const ws = new WebSocket("wss://unparadoxical-esteban-prediastolic.ngrok-free.dev/ws");

// 🎥 Riferimenti ai video
const localVideo  = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// 🌐 Stato WebRTC
let localStream     = null;
let peerConnection  = null;
let myId            = null;   // ID assegnato dal server
let targetId        = null;   // ID dell’altro peer
const pendingIce    = [];     // ICE ricevuti prima che la PC sia pronta

/* ===========================
   🔗 WebSocket
   =========================== */

ws.onopen = () => {
    console.log("✅ WebSocket connected");
};

ws.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    console.log("MSG RECEIVED:", msg);

    switch (msg.type) {

        case "welcome":
            myId = msg.id;
            console.log("🔑 MyYYY WebRTC ID:", myId);
            break;

        case "offer":
            await handleOffer(msg);
            break;

        case "answer":
            await handleAnswer(msg);
            break;

        case "ice-candidate":
            await handleIceCandidate(msg);
            break;

        default:
            console.warn("Unknown message type:", msg.type);
            break;
    }
};

/* ===========================
   🎥 Webcam locale
   =========================== */

async function startLocalVideo() {
    if (localStream) return; // già attiva

    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;
}

/* ===========================
   🔧 RTCPeerConnection helper
   =========================== */

async function ensurePeerConnection() {
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

    // Assicuro che la webcam sia attiva
    if (!localStream) {
        await startLocalVideo();
    }

    // Aggiungo le tracce locali
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Tracce remote (video dell’altro)
    peerConnection.ontrack = (event) => {
        console.log("🎬 Remote track received");
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // ICE locali da inviare
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

    peerConnection.onconnectionstatechange = () => {
        console.log("📡 connectionState:", peerConnection.connectionState);
    };

    console.log("🛠️ PeerConnection creata");
}

// Flush della queue ICE quando la remoteDescription è pronta
async function flushPendingIce() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    while (pendingIce.length > 0) {
        const cand = pendingIce.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            console.log("ICE (queued) aggiunto:", cand);
        } catch (err) {
            console.error("Errore ICE (queued):", err);
        }
    }
}

/* ===========================
   📞 CALL (chi chiama)
   =========================== */

document.getElementById("callBtn").onclick = async () => {
    if (!myId) {
        alert("Aspetta che il server ti assegni un ID…");
        return;
    }

    const dest = prompt("ID dell'altro utente:");
    if (!dest) return;

    targetId = dest;

    await startLocalVideo();
    await ensurePeerConnection();

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

    // preparo SOLO la webcam; la PC viene creata in handleOffer
    await startLocalVideo();
    peerConnection = null; // per sicurezza

    console.log("📞 Pronto a rispondere… in attesa della OFFER");
};

/* ===========================
   🔁 Gestione OFFER / ANSWER
   =========================== */

async function handleOffer(msg) {
    console.log("📥 OFFER ricevuta da", msg.from);
    targetId = msg.from;

    await startLocalVideo();       // sicurezza
    await ensurePeerConnection();  // crea la PC se non esiste

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

    // ora che la remoteDescription è pronta, applico eventuali ICE in coda
    await flushPendingIce();
}

async function handleAnswer(msg) {
    console.log("📥 ANSWER ricevuta da", msg.from);
    if (!peerConnection) {
        console.warn("⚠️ Answer ricevuta ma peerConnection è null");
        return;
    }

    const answer = msg.data;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingIce();
}

/* ===========================
   ❄️ Gestione ICE
   =========================== */

async function handleIceCandidate(msg) {
    const candidate = msg.data;

    // se la PC non è pronta o non ha ancora remoteDescription, accodo
    if (!peerConnection || !peerConnection.remoteDescription) {
        console.warn("⏳ PeerConnection non pronta, accodo ICE...");
        pendingIce.push(candidate);
        return;
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE aggiunto:", candidate);
    } catch (err) {
        console.error("Errore ICE:", err);
    }
}
