// script.js (Finaler Code mit Gruppen-Verbindungs-Management)

import * as P2PManager from './p2p_manager.js';

// --- BASIS-DATENSTRUKTUR ---

const myUserID = P2PManager.generateLocalID(); 
let myUserName = localStorage.getItem('myUserName') || "Ich (Noch kein Name festgelegt)";
let activeChatID = null;

function loadData() {
    const contacts = localStorage.getItem('contacts');
    const messages = localStorage.getItem('messages');
    
    return {
        contacts: contacts ? JSON.parse(contacts) : { 
            [myUserID]: { name: myUserName, isGroup: false, p2p_id: myUserID }
        },
        messages: messages ? JSON.parse(messages) : {}
    };
}
let AppData = loadData();

function updateLocalStorage() {
    localStorage.setItem('contacts', JSON.stringify(AppData.contacts));
    localStorage.setItem('messages', JSON.stringify(AppData.messages));
}

function getLastMessage(chatID) {
    const chatMessages = AppData.messages[chatID];
    return chatMessages && chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
}

// --- UI RENDER FUNKTIONEN ---

function renderChatList() {
    const chatListElement = document.getElementById('chat-list');
    chatListElement.innerHTML = '';
    
    const sortedChatIDs = Object.keys(AppData.contacts).sort((idA, idB) => {
        const msgB = getLastMessage(idB);
        const msgA = getLastMessage(idA);
        return (msgB?.timestamp || 0) - (msgA?.timestamp || 0);
    });

    sortedChatIDs.forEach(id => {
        const contact = AppData.contacts[id];
        const lastMessage = getLastMessage(id);

        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatID = id;
        chatItem.innerHTML = `
            <div>
                <strong>${contact.name}</strong> 
                <p style="color:#666; font-size:0.9em;">
                    ${lastMessage ? (lastMessage.senderID === myUserID ? 'Du: ' : '') + lastMessage.text.substring(0, 30) + (lastMessage.text.length > 30 ? '...' : '') : 'Keine Nachrichten'}
                </p>
            </div>
        `;
        chatItem.addEventListener('click', () => {
            activeChatID = id;
            const chatHeader = document.getElementById('chat-header');
            chatHeader.innerHTML = `<span id="current-chat-name">${contact.name}</span>`;
            
            // Füge Event Listener für Gruppen-Detail-Klick hinzu
            if (contact.isGroup) {
                chatHeader.classList.add('clickable-header');
                // Wichtig: Beim Klick auf den Header die Gruppen-Detailansicht zeigen
                chatHeader.onclick = showGroupDetails; 
            } else {
                chatHeader.classList.remove('clickable-header');
                chatHeader.onclick = null;
            }

            renderMessages(id);
        });
        chatListElement.appendChild(chatItem);
    });
}

function renderMessages(chatID) {
    const messagesElement = document.getElementById('messages');
    messagesElement.innerHTML = '';
    
    const chatMessages = AppData.messages[chatID] || [];
    const isGroup = AppData.contacts[chatID]?.isGroup;

    chatMessages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const isSent = msg.senderID === myUserID;
        const senderInfo = AppData.contacts[msg.senderID];
        const senderName = (senderInfo && senderInfo.name !== 'Ich') ? senderInfo.name : msg.senderID;

        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        
        if (!isSent && isGroup) {
            const senderSpan = document.createElement('span');
            senderSpan.textContent = senderName + ': ';
            senderSpan.style.fontWeight = 'bold';
            senderSpan.style.color = '#34B7F1'; 
            messageDiv.appendChild(senderSpan);
        }

        messageDiv.appendChild(document.createTextNode(msg.text));
        messagesElement.appendChild(messageDiv);
    });

    messagesElement.scrollTop = messagesElement.scrollHeight;
}


// --- GRUPPEN-VERBINDUNGSLOGIK ---

window.showGroupDetails = function() { // Muss global sein für onclick im HTML-String
    if (!activeChatID || !AppData.contacts[activeChatID].isGroup) return;

    const group = AppData.contacts[activeChatID];
    let memberListHTML = `<div style="padding: 15px;"><h3>Gruppenmitglieder (${group.name})</h3>`;

    group.members.forEach(memberID => {
        if (memberID === myUserID) {
            memberListHTML += `<p><strong>${myUserName} (Sie) - ID: ${memberID}</strong></p>`;
            return;
        }

        const memberName = AppData.contacts[memberID]?.name || `Unbekannt (${memberID})`;
        const connectionStatus = P2PManager.getConnectionStatus(memberID);
        let statusText = '';
        let buttonText = 'Verbinden';
        let buttonAction = `startP2PForGroupMember('${memberID}', true)`; // True = Initiator

        if (connectionStatus === 'open') {
            statusText = '<span style="color:green; font-weight:bold;">✅ Verbunden</span>';
            buttonText = 'Trennen';
            buttonAction = `closeP2PConnection('${memberID}')`;
        } else if (connectionStatus === 'connecting') {
            statusText = '<span style="color:orange; font-weight:bold;">⏳ Verbindet...</span>';
            buttonText = 'Code eingeben';
            buttonAction = `startP2PForGroupMember('${memberID}', false)`; // False = Nicht Initiator (Code eingeben)
        } else {
            statusText = '<span style="color:red; font-weight:bold;">❌ Nicht verbunden</span>';
        }

        memberListHTML += `
            <div style="border-bottom: 1px solid #eee; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${memberName}</strong> <br> 
                    <small>ID: ${memberID}</small><br>
                    ${statusText}
                </div>
                <button onclick="event.stopPropagation(); ${buttonAction}" style="padding: 5px 10px; background-color: #075E54; color: white; border: none; border-radius: 5px;">
                    ${buttonText}
                </button>
            </div>
        `;
    });
    memberListHTML += '</div>';

    // Wir ersetzen den Chat-Inhalt durch das Gruppen-Detail-Panel, bis der Nutzer zurück klickt
    const chatWindow = document.getElementById('messages');
    chatWindow.innerHTML = memberListHTML;
    
    // Header anpassen, um zurück zum Chat zu ermöglichen
    const chatHeader = document.getElementById('chat-header');
    chatHeader.innerHTML = `<span onclick="renderMessages(activeChatID);" style="cursor:pointer; text-decoration:underline;">Zurück zu ${group.name}</span>`;
    chatHeader.onclick = null; 
}


window.startP2PForGroupMember = function(partnerID, isInitiator) {
    // Manuelle Verbindung zu einem Gruppenmitglied starten
    P2PManager.initializeConnection(partnerID, receiveP2PMessage);

    if (isInitiator) {
        P2PManager.createOffer(partnerID, () => {
            // Nach Offer-Generierung den Partner bitten, den Code zu senden
            alert(`OFFER generiert. Warten Sie auf den ANSWER/KANDIDAT-Code von ${partnerID}.`);
        }, receiveP2PMessage); 
    }
    
    // Manuelle Code-Eingabe (sowohl für Initiator als auch für Empfänger)
    const code = prompt(`Geben Sie den Code (OFFER, ANSWER oder KANDIDAT) von ${partnerID} ein.`);
    if (code) {
        P2PManager.handleSignalingCode(code);
    }
    // Gruppen-Detailansicht neu rendern, um den Status zu aktualisieren
    showGroupDetails();
}

window.closeP2PConnection = function(partnerID) {
    P2PManager.closeConnection(partnerID);
    showGroupDetails();
}


// --- AKTIONEN UND KONTAKTVERWALTUNG (Unverändert) ---

function showActionMenu() {
    // ... [Logik für das Menü (Kontakte/Gruppen/Name festlegen) bleibt gleich] ...
    const action = prompt(`Aktionen: \n1: Kontakt/Gruppe per ID hinzufügen\n2: Neue Gruppe erstellen\n3: Benutzernamen festlegen\n4: P2P-Verbindung starten/Code eingeben (NUR EINZELCHAT)\n\nIhre ID (zum Teilen): ${myUserID}`);

    if (action === '1') { addContactOrGroupPrompt(); } 
    else if (action === '2') { createNewGroup(); } 
    else if (action === '3') { setUserName(); } 
    else if (action === '4') { startP2PChat(); }
}
// ... [addContactOrGroupPrompt, createNewGroup, setUserName bleiben unverändert] ...


// --- P2P SENDEN UND EMPFANGEN ---

function startP2PChat() {
    // ... [Logik für den manuellen Einzelchat-Start bleibt gleich] ...
}

function receiveP2PMessage(senderID, text) {
    // ... [Logik zum Empfangen der Nachricht bleibt gleich] ...
    const chatID = senderID; // Wir nehmen an, der Absender ist der Chat-Partner

    const receivedMsg = { senderID: senderID, text: text, timestamp: new Date().getTime() };

    // Speichere Nachricht im Verlauf
    if (!AppData.messages[chatID]) { AppData.messages[chatID] = []; }
    AppData.messages[chatID].push(receivedMsg);
    updateLocalStorage();

    // UI aktualisieren
    if (chatID === activeChatID) { renderMessages(activeChatID); }
    renderChatList();
}


function sendMessage() {
    const inputElement = document.getElementById('message-input');
    const text = inputElement.value.trim();
    if (text === '' || !activeChatID) return;

    const newMessage = { senderID: myUserID, text: text, timestamp: new Date().getTime() };
    const currentChat = AppData.contacts[activeChatID];

    if (currentChat.isGroup) {
        // GRUPPENCHAT: Sendeversuch nur an VERBUNDENE Mitglieder
        let successCount = 0;
        currentChat.members.forEach(memberID => {
            if (memberID !== myUserID) {
                const sentToPeer = P2PManager.sendP2PMessage(memberID, text); 
                if (sentToPeer) { successCount++; } 
            }
        });

        if (successCount > 0) {
            console.log(`Gruppennachricht gesendet an ${successCount} von ${currentChat.members.length - 1} verbundene Peer(s).`);
        } else {
             alert("Keine aktiven P2P-Verbindungen zu Gruppenmitgliedern. Nachricht nur lokal gespeichert.");
        }
    } else {
        // Einzelchat: P2P-Nachricht senden
        const sentToPeer = P2PManager.sendP2PMessage(currentChat.p2p_id, text);
        if (!sentToPeer) {
             alert("P2P-Verbindung nicht offen. Starten Sie diese manuell! Nachricht nur lokal gespeichert.");
        }
    }
    
    // Nachricht immer im lokalen Verlauf speichern
    if (!AppData.messages[activeChatID]) { AppData.messages[activeChatID] = []; }
    AppData.messages[activeChatID].push(newMessage);
    updateLocalStorage();

    renderMessages(activeChatID);
    renderChatList();
    inputElement.value = '';
}


// --- INITIALISIERUNG ---

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('new-chat-btn').addEventListener('click', showActionMenu); 

document.getElementById('header-username').textContent = myUserName; 

renderChatList();
