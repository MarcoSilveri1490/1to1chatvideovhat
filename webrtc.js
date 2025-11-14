const ws = new WebSocket("wss://unparadoxical-esteban-prediastolic.ngrok-free.dev/ws");

let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

let localStream;
let peerConnection;
let myId = null;
let targetId = null;

ws.onopen = () => {
    console.log("WebSocket connected");
};

ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    console.log("MSG RECEIVED:", msg);

    switch (msg.type) {

        case "welcome":
            myId = msg.id;
            console.log("🔑 My WebRTC ID:", myId);
            break;

        case "offer":
            targetId = msg.from;
            handleOffer(msg);
            break;

        case "answer":
            handleAnswer(msg);
            break;

        case "ice-candidate":
            handleIceCandidate(msg);
            break;
    }
};

async function startLocalVideo() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
}

async function createPeerConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "ice-candidate",
                from: myId,
                to: targetId,
                data: event.candidate
            }));
        }
    };
}


// CALL
document.getElementById("callBtn").onclick = async () => {

    if (!myId) {
        alert("Aspetta che il server ti assegni un ID…");
        return;
    }

    targetId = prompt("ID dell'altro utente:");

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
};


// ANSWER
document.getElementById("answerBtn").onclick = async () => {

    if (!myId) {
        alert("Aspetta che il server ti assegni un ID…");
        return;
    }

    // PREPARO la call, ma NON creo offer né answer qui
    await startLocalVideo();
    await createPeerConnection();

    console.log("📞 Pronto a rispondere… in attesa della OFFER");
};


async function handleOffer(msg) {

    // assegna targetId correttamente
    targetId = msg.from;

    if (!peerConnection) {
        await startLocalVideo();
        await createPeerConnection();
    }

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
}


async function handleAnswer(msg) {
    if (!peerConnection) return;
    const answer = msg.data;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate(msg) {
    const candidate = msg.data;

    // Se la connessione non è ancora pronta, attendi e riprova
    if (!peerConnection) {
        console.warn("⏳ PeerConnection non pronta, ritento ICE tra 100ms...");
        setTimeout(() => handleIceCandidate(msg), 100);
        return;
    }

    if (!targetId) {
    console.warn("⏳ targetId non ancora noto, ritento ICE...");
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
