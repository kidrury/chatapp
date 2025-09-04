import { sortFeed, showTemporaryMessage, renderChats, renderRecievedRequests, getFriendUsername, formatTime, getFriendIdFromRoomId, tempSeenToMessageStore} from './utils/helper.js';

const socket = io({
    withCredentials : true
}) 

let userData = null;
let feed = [];
let currentRoom = null;
let requestsSent = [];
let requestsRecieved = [];
let messagesStore = {};
let roomsMessages = {};
let typingTimeout;
let seenObserver;
let searchTimeout = null;
const tempSeenMessages = new Map();


const chatList = document.getElementById('chatList');
const chatBox = document.getElementById('chatBox');
const chatTitle = document.getElementById('chatTitle');
const onlineStatus = document.getElementById('online-status')
const backBtn = document.getElementById('backBtn');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('send-message-button');
const messages = document.getElementById('messages');
const newGroupBtn = document.getElementById('add-btn');
const modalBackdrop = document.getElementById('modal-backdrop');
const closeModalBtns = document.querySelectorAll('.close-modal');
const modalNew = document.getElementById('modal-new');
const modalGroup = document.getElementById('modal-group');
const modalMakeRequest = document.getElementById('modal-make-request');

const menuToggleBtn = document.getElementById('friend-menu-toggle');
const friendMenu = document.getElementById('friend-menu');

const recievedRequestsBtn = document.getElementById('requests-received-btn');
const sentRequestsBtn = document.getElementById('requests-sent-btn');
const requestsReceivedList = document.getElementById('requests-received-list');
const requestsSentList = document.getElementById('requests-sent-list');

const createGroupBtn = document.getElementById('create-group');
const friendRequestBtn = document.getElementById('send-friend-request');

const groupSearchInput = document.getElementById('group-search-input');
const groupSearchResults = document.getElementById('group-search-results');

const submitGroupCreation = document.getElementById('submit-group-creation');
const submitFriendRequest = document.getElementById('submit-friend-request');

function initSeenObserver() {
  // Only initialize once
    if (seenObserver) return;

    seenObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
        if (entry.isIntersecting) {
            const bubble = entry.target;
            if (!bubble.classList.contains('seen')) {
            const messageId = bubble.dataset.id;
            const sender = bubble.dataset.sender
            const group = bubble.dataset.group
            socket.emit('message:seen', {messageId, sender, group});
            bubble.classList.add('seen');
            messagesStore[messageId].seenBy.push(`user::${userData.username}`);
            console.log(messagesStore[messageId]);
            }
        }
        });
    }, {
        root: document.querySelector('#messages'), // your scroll container
        threshold: 0.5 // at least 50% visible
    });
}
socket.on('connect', ()=>{
    initSeenObserver();
    console.log('connected');
    socket.emit('getUserData');
})
socket.on('userData', (data)=>{
    userData = data;
    feed = [...data.groups, ...data.friendsRooms];
    requestsSent = [...data.requestsSent];
    requestsRecieved = [...data.requestsRecieved];
    if(!Array.isArray(feed)) feed =[];
    console.log(feed);
    const userFeed = sortFeed(feed);
    console.log(feed);
    if(userFeed.length === 0){
        console.log('create a group to chat with your friends');
    }
    else{
        renderChats(chatList, userFeed, data.username, selectRoom);
        userFeed.forEach(room=>{
            socket.emit('join', room.id);
        })
    }
    console.log(userData);
    if(userData.tempSeen){
        userData.tempSeen.forEach(msg=>{
            if(!tempSeenMessages.has(msg.roomId)){
                tempSeenMessages.set(msg.roomId, []);
            }
            tempSeenMessages.get(msg.roomId).push({messageId:msg.messageId, userId: msg.userId});
        })
    }
    console.log(tempSeenMessages);
})
socket.on('updateFeed', (createdGroup)=>{
    feed.push(createdGroup);
    socket.emit('join', createdGroup.id)
    const userFeed = sortFeed(feed);
    console.log(createdGroup);
    renderChats(chatList, userFeed, userData.username, selectRoom);
})

socket.on('groupInfo', (data)=>{
    selectRoom(data);
})
newGroupBtn.addEventListener('click', () => {
    modalBackdrop.classList.remove('hidden');
    modalBackdrop.classList.add('display-flex');
});
socket.on('groupExists', ()=>{
    console.log('group name already in use');
})
socket.on('refreshRequests', (userId)=>{
    requestsRecieved.push(userId);
    renderRecievedRequests(requestsReceivedList, requestsRecieved);
});
socket.on('typing', (from, roomId) => {
    // Only show if it's from the person you're currently chatting with
    if (from !== userData.username && roomId === currentRoom) {
        onlineStatus.classList.add('hidden');
        document.getElementById('typing-indicator').textContent = roomId.split('::').length === 3 ?
            'is typing...' : `${from} is typing...`;
        console.log('alright');
        document.getElementById('typing-indicator').classList.remove('hidden');
    }
});

socket.on('stop typing', (from) => {
    if (from !== userData.username) {
        document.getElementById('typing-indicator').classList.add('hidden');
        onlineStatus.classList.remove('hidden');
    }
});
socket.on('friendOnline', (friendId)=>{
    if (!userData.onlineFriends.includes(friendId)){
        userData.onlineFriends.push(friendId);
        console.log(userData.onlineFriends);
        const chat = Array.from(document.querySelectorAll('.chat-preview')).filter(chat=>`user::${chat.dataset.room}` === friendId);
        chat[0].classList.add('online');
        console.log(currentRoom, friendId)
        if(getFriendIdFromRoomId(userData.username, currentRoom) === friendId){
            onlineStatus.classList.remove('hidden');
        }
    }
})
socket.on('friendOffline', (friendId)=>{
    userData.onlineFriends = userData.onlineFriends.filter(friend => friend !== friendId);
    console.log(userData.onlineFriends);
    const chat = Array.from(document.querySelectorAll('.chat-preview')).filter(chat=>`user::${chat.dataset.room}` === friendId);
    chat[0].classList.remove('online');
    if(getFriendIdFromRoomId(userData.username, currentRoom) === friendId){
        onlineStatus.classList.add('hidden');
    }
})
socket.on('doubleCheck', (messageId, userId, roomId)=>{
    if(roomId === currentRoom && !messagesStore[messageId].seenBy.includes(userId)){
        messagesStore[messageId].seenBy.push(userId);
        const messages = Array.from(document.querySelectorAll('.bubble'));
        const bubble = messages.find(message => message.dataset.id === messageId)
        if(bubble){
            bubble.classList.add('double-check');
            const seenIndicator = bubble.querySelector('.seen-indicator');
            console.log(seenIndicator);
            if (seenIndicator){
                seenIndicator.innerHTML = '✔✔';
            }
        }
    }
    else{
        if(!tempSeenMessages.has(roomId)){
            tempSeenMessages.set(roomId, []);
        }
        tempSeenMessages.get(roomId).push({messageId, userId});
        console.log(tempSeenMessages);
    }

})
socket.on('error', (err)=>{
    console.log(err);
})
socket.on('done', ()=>{
    console.log('done');
})

// Hide modal when cancel is clicked
closeModalBtns.forEach((btn)=>{
    btn.addEventListener('click', () => {
        hideModals();
    });
    currentRoom = null;
})

// Handle create group
createGroupBtn.addEventListener('click', () => {
    modalNew.classList.add('hidden');
    modalGroup.classList.remove('hidden');
});

// Handle send friend request
friendRequestBtn.addEventListener('click', () => {
    modalNew.classList.add('hidden');
    modalMakeRequest.classList.remove('hidden');
});

submitGroupCreation.addEventListener('click', async(e)=>{
    e.preventDefault();
    const groupName = document.getElementById('group-name-input').value;
    if(groupName.length === 0) return console.log('entering the field is required');
    socket.emit('createGroup', groupName);
    document.getElementById('group-name-input').value = '';
    showTemporaryMessage(`Group "${groupName}" has been created!`, modalGroup, 2, hideModals);
})
submitFriendRequest.addEventListener('click', (e)=>{
    e.preventDefault();
    const friendUsername = document.getElementById('friend-name-input').value;
    console.log(friendUsername);
    if(friendUsername === 0) return console.log('entering the field is required');
    socket.emit('makeFreindRequest', friendUsername);
    document.getElementById('friend-name-input').value = ''
    showTemporaryMessage(`request sent to"${friendUsername}"!`, modalMakeRequest, 2, hideModals);
})

menuToggleBtn.addEventListener('click', () => {
    friendMenu.classList.toggle('show');
});

recievedRequestsBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    renderRecievedRequests(requestsReceivedList, requestsRecieved);
})
sentRequestsBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    requestsSentList.classList.toggle('hidden');
})
requestsReceivedList.addEventListener('click', (e)=>{
    e.preventDefault();
    if(e.target.classList.contains('accept-btn')){
        const friendId = e.target.dataset.userId;
        socket.emit('acceptRequest', friendId);
    }
})




// Select room and show chat
function selectRoom(contact) {
    onlineStatus.classList.add('hidden');
    currentRoom = contact.id;
    chatTitle.textContent = contact.name ? contact.name : getFriendUsername(contact.id, userData.username);
    chatBox.classList.remove('hidden');
    if(userData.onlineFriends.includes(getFriendIdFromRoomId(userData.username, currentRoom))){
        onlineStatus.classList.remove('hidden');
    }
    console.log(currentRoom);
    messages.innerHTML = ''; // clear previous messages
    if (!roomsMessages[currentRoom]){
        socket.emit('loadRoomMessages', currentRoom);
    }
    else{
        tempSeenToMessageStore(tempSeenMessages, currentRoom, messagesStore)
        const messages = roomsMessages[currentRoom].map(id=>messagesStore[id]);
        messages.forEach(msg => {
            appendMessage(msg.id, msg.message, msg.user, msg.timestamp, msg.seenBy, msg.type);
        });
        console.log('from cache');
    }
}

// Go back to chat list
backBtn.addEventListener('click', () => {
    chatBox.classList.add('hidden');
    currentRoom = null;
});
messageInput.addEventListener('focus', () => {
    socket.emit('typing', currentRoom);
});

messageInput.addEventListener('input', () => {
    socket.emit('typing', currentRoom);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
    socket.emit('stop typing', currentRoom);
    }, 1500); // stop typing after 1.5 seconds of no input
});

messageInput.addEventListener('blur', () => {
  socket.emit('stop typing', currentRoom);
});
sendMessageButton.addEventListener('click', (e)=>{
    e.preventDefault();
    const message = messageInput.value.trim();
    if(!message || !currentRoom) return;
    socket.emit('message', {room:currentRoom, message});
    messageInput.value = '';
})

// // Send message
// messageForm.addEventListener('submit', (e) => {
//   e.preventDefault();
//   const msg = messageInput.value.trim();
//   if (!msg || !currentRoom) return;
//   socket.emit('sendMessage', { room: currentRoom, text: msg });
//   appendMessage({ text: msg, sender: 'You' });
//   messageInput.value = '';
// });

// Receive message
socket.on('recieveMessage', (messageDoc, latestAction)=>{
    console.log(messageDoc);
    const room = feed.find(r=>r.id === messageDoc.room);
    room.latestAction = latestAction;
    const sortedFeed = sortFeed(feed);
    renderChats(chatList, sortedFeed, userData.username, selectRoom);
    const {id} = messageDoc
    messagesStore = {
        ...messagesStore,
        [id] : messageDoc
    };
    console.log(roomsMessages);
    console.log(messageDoc.type);
    if(!roomsMessages[messageDoc.room]){
        roomsMessages ={
            ...roomsMessages,
            [messageDoc.room]: []
        }
    }
    console.log(messagesStore[id]);
    roomsMessages[messageDoc.room].push(messageDoc.id);
    if(messageDoc.room !== currentRoom) return;
    console.log(messageDoc.room);
    appendMessage(messageDoc.id, messageDoc.message, messageDoc.user, messageDoc.timestamp, messageDoc.seenBy, messageDoc.type);
})
socket.on('displayMessages', (loadedMessages ,roomId)=>{
    messagesStore = {
        ...messagesStore,
        ...Object.fromEntries(loadedMessages.map(msg=>[msg.id, msg]))
    }
    tempSeenToMessageStore(tempSeenMessages, currentRoom, messagesStore);
    roomsMessages[roomId] = loadedMessages.map(msg => msg.id)
    loadedMessages.forEach(msg => {
        appendMessage(msg.id, msg.message, msg.user, msg.timestamp, msg.seenBy, msg.type);
    })
    console.log(messagesStore);
})

function appendMessage(id, text, sender, timestamp, seenBy, type) {
    const li = document.createElement('li');
    li.classList.add('message-bubble');
    if (type === 'broadcast') {
        li.classList.add('broadcast-message');
        li.innerHTML = `
            <div class="broadcast-bubble">
                <span class="broadcast-text">${sender.replace('user::', '')===userData.username?'You': sender.replace('user::', '')} ${text}</span>
            </div>
        `;
    }else{
        li.classList.add(sender === userData.username ? 'you' : 'other');
        const formattedTime = formatTime(timestamp);
        const parts = currentRoom.split('::');
        li.innerHTML = `  
            <div class="bubble ${seenBy.length === 0?'':'double-check seen'}" data-id="${id}" data-sender="${sender}" data-group="${parts.length === 2 ? parts[1] : ''}">
                <div class="sender">${sender}</div>
                <div class="text">${text}</div>
                <div class="timestamp">${formattedTime}</div>
                <span class="seen-indicator">${seenBy.length > 0 && sender === userData.username? '✔✔' : '' }</span>
            </div>
        `;
    }
    
    messages.appendChild(li);
    //   messages.scrollTop = messages.scrollHeight;
    if(sender!== userData.username && type!=='broadcast'){
        const bubble = li.querySelector('.bubble');
        seenObserver.observe(bubble)
    }
}
socket.on('connect_error', (err)=>{
    console.log('socket.io connection error', err);
    window.location.href = './login.html';
})
function hideModals(){
    modalBackdrop.classList.remove('display-flex');
    modalBackdrop.classList.add('hidden');
    modalNew.classList.remove('hidden');
    modalGroup.classList.add('hidden');
    modalMakeRequest.classList.add('hidden');
}
groupSearchInput.addEventListener('input', () => {
    const query = groupSearchInput.value.trim();

    clearTimeout(searchTimeout);
    if (!query) {
        groupSearchResults.innerHTML = '';
        groupSearchResults.classList.add('hidden');
        return;
    }

    // Debounce to prevent too many requests
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/groups/search?search=${encodeURIComponent(query)}`);
            const data = await res.json();

            // Render results
            groupSearchResults.innerHTML = '';
            console.log(data);
            if (data.groups && data.groups.length > 0) {
                data.groups.forEach(group => {
                const li = document.createElement('li');
                li.textContent = group.name;
                li.dataset.groupId = group.id;
                console.log(group.name);
                groupSearchResults.appendChild(li);
                });
                groupSearchResults.classList.remove('hidden');
            } else {
                groupSearchResults.classList.add('hidden');
            }
        } catch (err) {
            console.error('Error searching groups:', err);
        }
  }, 300); // 300ms debounce
});

// Click on a result to join
groupSearchResults.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;

    const groupId = li.dataset.groupId;
    const groupName = li.textContent;
    console.log(groupId);   
    // Emit socket event to join the group
    socket.emit('joinExistingGroup', groupId);

    // Clear input and results
    groupSearchInput.value = '';
    groupSearchResults.innerHTML = '';
    groupSearchResults.classList.add('hidden');
});