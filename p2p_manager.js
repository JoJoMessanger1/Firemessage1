// p2p_manager.js

// --- 1. KONFIGURATION & GLOBALE VARIABLEN ---
const configuration = {
    // Öffentliche STUN-Server sind erforderlich, um die Geräte im Internet zu finden.
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
    ]
};

let peerConnections = {}; 
let dataChannels = {};
let localID = null;

// --- 2. INITIALISIERUNG ---

/**
 * Generiert eine eindeutige ID und stellt sicher, dass sie persistent ist.
 */
export function generateLocalID() {
    let storedID = localStorage.getItem('localP2PID');
    if (!storedID) {
        storedID = 'P2P-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        localStorage.setItem('localP2PID', storedID);
    }
    localID = storedID;
    return localID;
}

/**
 * Erstellt die PeerConnection zum Partner.
 */
function createConnection(partnerID, onMessageCallback) {
    if (peerConnections[partnerID]) return peerConnections[partnerID];

    const pc = new RTCPeerConnection(configuration);
    peerConnections[partnerID] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // Zeige Kandidaten für den manuellen Austausch
            console.log(`📡 Kandidat für ${partnerID}: KANDIDAT:${localID}:${JSON.stringify(event.candidate)}`);
        }
    };

    pc.ondatachannel = (event) => {
        dataChannels[partnerID] = event.channel;
        setupDataChannelEvents(partnerID, onMessageCallback);
        console.log(`✅ DataChannel von ${partnerID} empfangen und verbunden.`);
    };
    
    return pc;
}

/**
 * Erstellt die Verbindung und das "Angebot" (Offer).
 */
export async function createOffer(partnerID, onOfferGenerated, onMessageCallback) {
    const pc = createConnection(partnerID, onMessageCallback);
    dataChannels[partnerID] = pc.createDataChannel("chat");
    setupDataChannelEvents(partnerID, onMessageCallback);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    alert(`P2P-Offer generiert. Sende diesen Code manuell an ${partnerID}:\n\nOFFER:${localID}:${JSON.stringify(offer)}`);
    onOfferGenerated(offer);
}

/**
 * Akzeptiert ein Offer und erstellt die "Antwort" (Answer).
 */
export async function createAnswer(partnerID, sdpOffer) {
    const pc = createConnection(partnerID, () => {}); // Callback wird später in script.js gesetzt
    
    const offer = JSON.parse(sdpOffer);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    alert(`P2P-Answer generiert. Sende diesen Code manuell an den Initiator (${partnerID}):\n\nANSWER:${localID}:${JSON.stringify(answer)}`);
}

/**
 * Setzt die Antwort des Partners (Answer).
 */
export async function setRemoteAnswer(partnerID, sdpAnswer) {
    const pc = peerConnections[partnerID];
    if (!pc) return;
    
    const answer = JSON.parse(sdpAnswer);
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("✅ Remote Answer gesetzt. Verbindung sollte bald stehen.");
}

/**
 * Fügt einen empfangenen ICE-Kandidaten hinzu.
 */
export async function addIceCandidate(partnerID, sdpCandidate) {
    const pc = peerConnections[partnerID];
    if (!pc) return;
    
    const candidate = JSON.parse(sdpCandidate);
    try {
        await pc.addIceCandidate(candidate);
    } catch (e) {
        console.error("Fehler beim Hinzufügen des ICE-Kandidaten:", e);
    }
}

// --- 3. DATENKANAL FUNKTIONEN ---

function setupDataChannelEvents(partnerID, onMessageCallback) {
    const dc = dataChannels[partnerID];

    dc.onopen = () => {
        console.log(`✅ P2P DataChannel zu ${partnerID} ist offen!`);
    };
    dc.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onMessageCallback(data.senderID, data.text);
    };
    dc.onclose = () => console.log(`P2P DataChannel zu ${partnerID} geschlossen.`);
    dc.onerror = (error) => console.error(`P2P DataChannel Fehler zu ${partnerID}:`, error);
}

/**
 * Sendet eine Nachricht über den DataChannel an einen bestimmten Partner.
 */
export function sendP2PMessage(partnerID, message) {
    const dc = dataChannels[partnerID];
    if (dc && dc.readyState === 'open') {
        const payload = JSON.stringify({ senderID: localID, text: message });
        dc.send(payload);
        return true;
    }
    return false;
}

// --- 4. HILFSFUNKTIONEN FÜR MANUELLES SIGNALING ---

/**
 * Funktion zur Verarbeitung des manuell eingegebenen Signaling-Codes.
 */
export async function handleSignalingCode(code) {
    // Erwarte Code im Format: TYP:PARTNER_ID:{SDP_Payload}
    const parts = code.split(':');
    if (parts.length < 3) {
        alert("Fehlerhaftes Code-Format. Erwartet: TYP:ID:{JSON_Payload}");
        return;
    }
    
    const type = parts[0];
    const partnerID = parts[1];
    const sdpPayload = parts.slice(2).join(':');

    if (type === 'OFFER') {
        await createAnswer(partnerID, sdpPayload);
        return 'OFFER_HANDLED';
    } else if (type === 'ANSWER') {
        await setRemoteAnswer(partnerID, sdpPayload);
        return 'ANSWER_HANDLED';
    } else if (type === 'KANDIDAT') {
        await addIceCandidate(partnerID, sdpPayload);
        return 'CANDIDATE_HANDLED';
    }
    return 'UNKNOWN_CODE';
}

/**
 * Gibt den aktuellen Zustand des DataChannels zu einem Partner zurück.
 */
export function getConnectionStatus(partnerID) {
    const dc = dataChannels[partnerID];
    if (dc) {
        return dc.readyState; 
    }
    const pc = peerConnections[partnerID];
    if (pc && pc.connectionState === 'connecting') {
        return 'connecting'; 
    }
    return 'none';
}

/**
 * Schließt die P2P-Verbindung zu einem Partner.
 */
export function closeConnection(partnerID) {
    if (dataChannels[partnerID]) {
        dataChannels[partnerID].close();
        delete dataChannels[partnerID];
    }
    if (peerConnections[partnerID]) {
        peerConnections[partnerID].close();
        delete peerConnections[partnerID];
    }
}
