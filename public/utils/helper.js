export function sortFeed(feed){
    return feed.sort((a, b)=>b.latestAction.timestamp - a.latestAction.timestamp);
}
export function getFriendUsername(roomId, username){
    const names = roomId.split('::');
    const name = names[1] === username ? names[2] : names[1];
    return name
}
export function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}
export function formatTime(timestamp){
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}
// export function getRoomName()
export function renderChats(chatList, userFeed, username, selectRoom){
    removeAllChildNodes(chatList);
    userFeed.forEach(contact => {
        const li = document.createElement('li');
        let name = null;
        if(contact.type === 'private'){
            name = getFriendUsername(contact.id, username);
        }else{
            name = contact.name;
        }
        li.dataset.room = name;
        li.classList.add('chat-preview');
        li.innerHTML = `
            <div class="chat-name">${name}</div>
            <div class="latest-message">
                <span class="sender-name">${contact.latestAction.lastMessageType === 'broadcast'? '':contact.latestAction.senderName}</span>
                <span class="message-text">${contact.latestAction.text}</span>
            </div>
            <div class="message-time">${formatTime(contact.latestAction.timestamp)}</div>
        `
        li.addEventListener('click', () => selectRoom(contact));
        chatList.appendChild(li);
    });
}
export function renderRecievedRequests(requestsReceivedList, requestsRecieved){
    requestsReceivedList.classList.toggle('hidden');
    requestsReceivedList.innerHTML = '';
    console.log(requestsRecieved);
    requestsRecieved.forEach(req => {
        const username = req.replace('user::', '');
        const li = document.createElement('li');
        li.innerHTML = `
        ${username}
        <div>
            <button class="accept-btn" data-user-id="${req}">Accept</button>
            <button class="deny-btn" data-user-id="${req}">Deny</button>
        </div>
        `;
        requestsReceivedList.appendChild(li);
    });
}
export function showTemporaryMessage(message, modal, seconds = 2, callback) {
  const msg = document.createElement('p');
  msg.textContent = message;
  msg.style.color = 'green';
  msg.style.marginTop = '10px';
  msg.style.fontWeight = 'bold';
  modal.appendChild(msg);

  setTimeout(() => {
    msg.remove();
    if (callback) callback();
  }, seconds*1000);
}
export function getFriendIdFromRoomId(username, roomId){
    if(roomId){
        const [_, userA, userB] = roomId.split('::');
        const friendUsername =  userA === username ? userB : userA;
        return `user::${friendUsername}`;
    }
}
export function tempSeenToMessageStore(tempSeenMessages, currentRoom, messagesStore){
    if(tempSeenMessages.has(currentRoom)){
        tempSeenMessages.get(currentRoom).forEach(({messageId, userId})=>{
            messagesStore[messageId].seenBy.push(userId);
            console.log(`${messagesStore[messageId]}`);
        })
        tempSeenMessages.delete(currentRoom);
        console.log(tempSeenMessages.has(currentRoom));
    }
}

 